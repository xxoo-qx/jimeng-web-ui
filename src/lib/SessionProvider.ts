import { chromium, Browser, BrowserContext, Page } from 'playwright';
import axios from 'axios';
import logger from './logger.ts';

// Mail.tm API 辅助类
class MailTm {
  private baseUrl = 'https://api.mail.tm';
  private token: string | null = null;
  public email: string | null = null;
  private password: string | null = null;

  async createAccount() {
    // 获取可用域名
    const domainsRes = await axios.get(`${this.baseUrl}/domains`);
    const domains = domainsRes.data['hydra:member'];
    if (!domains || domains.length === 0) throw new Error('没有可用的域名');
    
    // 选择第一个域名
    const domain = domains[0].domain;
    
    // 生成随机凭证
    const randomStr = Math.random().toString(36).substring(7);
    this.email = `user_${randomStr}@${domain}`;
    this.password = `Pwd_${randomStr}!`;

    try {
      await axios.post(`${this.baseUrl}/accounts`, {
        address: this.email,
        password: this.password
      });
    } catch (e: any) {
      logger.error(`创建邮箱账户失败: ${e.response?.data || e.message}`);
      throw e;
    }

    // 登录以获取 token
    const tokenRes = await axios.post(`${this.baseUrl}/token`, {
      address: this.email,
      password: this.password
    });
    this.token = tokenRes.data.token;
    
    logger.info(`[MailTm] 已创建临时邮箱: ${this.email}`);
    return this.email;
  }

  async getLatestMessage() {
    if (!this.token) throw new Error('未认证');
    
    const res = await axios.get(`${this.baseUrl}/messages`, {
      headers: { Authorization: `Bearer ${this.token}` }
    });
    
    const messages = res.data['hydra:member'];
    if (messages && messages.length > 0) {
      // 获取第一条消息详情
      const msgId = messages[0].id;
      const msgDetail = await axios.get(`${this.baseUrl}/messages/${msgId}`, {
        headers: { Authorization: `Bearer ${this.token}` }
      });
      return msgDetail.data;
    }
    return null;
  }

  async waitForVerificationCode(attempts = 20): Promise<string> {
    logger.info(`[MailTm] 等待验证邮件...`);
    for (let i = 0; i < attempts; i++) {
      try {
        const msg = await this.getLatestMessage();
        if (msg) {
          const subject = msg.subject || '';
          const body = msg.text || msg.intro || '';
          
          logger.info(`[MailTm] 收到邮件: ${subject}`);
          
          // 查找 6 位数字或字母数字代码
          const codeMatch = body.match(/\b[A-Z0-9]{6}\b/) || subject.match(/\b[A-Z0-9]{6}\b/);
          
          if (codeMatch) {
            logger.info(`[MailTm] 找到验证码: ${codeMatch[0]}`);
            return codeMatch[0];
          }
        }
      } catch (e) {
          // 忽略获取消息时的临时错误
      }
      // 下次轮询前等待 3 秒
      await new Promise(r => setTimeout(r, 3000));
    }
    throw new Error('未在规定时间内收到验证码');
  }
}

export class SessionProvider {
  /**
   * 自动注册并获取新的 SessionID
   */
  static async generateNewSession(): Promise<string> {
    const mailer = new MailTm();
    let browser: Browser | null = null;
    let sessionCookieValue = '';

    try {
    //  throw new Error("测试的错误")
      // 1. 设置临时邮箱
      await mailer.createAccount();

      // 2. 启动浏览器
      // 注意：headless: true 在生产环境更合适，但如果被检测反爬可能需要 false
      browser = await chromium.launch({
        headless: true, 
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      
      const context = await browser.newContext();
      const page = await context.newPage();

      // 3. 导航至 Dreamina
      logger.info('[Playwright] 正在导航至 Dreamina...');
      await page.goto('https://dreamina.capcut.com/ai-tool/home');

      // 4. 点击 登录 / 注册 流程
      // 尝试先找到 "Sign in" 按钮
      const signInBtn = page.locator('text="Sign in"').first();
      await signInBtn.click();

      logger.info('[Playwright] 点击 "Continue with email"...');
      const continueEmailBtn = page.locator('text="Continue with email"');
      await continueEmailBtn.waitFor({ state: 'visible' });
      await continueEmailBtn.click();
      
      logger.info('[Playwright] 切换到注册标签...');
      const signUpLink = page.locator('text="Sign up"');
      await signUpLink.waitFor({ state: 'visible' });
      await signUpLink.click();

      // 5. 填写注册表单
      logger.info('[Playwright] 正在填写注册表单...');
      
      if (!mailer.email) throw new Error("邮箱未创建");

      await page.getByRole('textbox', { name: 'Enter email' }).click();
      await page.getByRole('textbox', { name: 'Enter email' }).fill(mailer.email);
      
      const passwordInput = page.getByRole('textbox', { name: 'Enter password' });
      await passwordInput.click();
      await passwordInput.fill('Dreams123456!');
      
      await page.getByRole('button', { name: 'Continue' }).click();

      // 6. 等待验证码步骤
      logger.info('[Playwright] 等待验证码输入步骤...');
      const code = await mailer.waitForVerificationCode();
      
      // 7. 输入验证码
      logger.info('[Playwright] 处理验证码输入...');
      
      try {
          const codeInput = page.getByRole('textbox').nth(2);
          if (await codeInput.isVisible()) {
               await codeInput.fill(code);
          } else {
               await page.locator('.verification_code_input-number').first().click();
               await page.keyboard.type(code, { delay: 100 });
          }
      } catch (e: any) {
          logger.warn(`[Playwright] 验证码常规输入失败，尝试强制输入: ${e.message}`);
          await page.locator('.verification_code_input-number').first().click({ force: true });
          await page.keyboard.type(code, { delay: 100 });
      }

      // 8. 处理生日屏幕
      logger.info('[Playwright] 检查生日屏幕...');
      try {
          const birthdayTitle = page.locator('text="When’s your birthday?"');
          await birthdayTitle.waitFor({ state: 'visible', timeout: 8000 });
          
          if (await birthdayTitle.isVisible()) {
              logger.info('[Playwright] 检测到生日屏幕，正在填写...');
              await page.getByRole('textbox', { name: 'Year' }).click();
              await page.getByRole('textbox', { name: 'Year' }).fill('1995');
              
              await page.getByText('Month').click();
              await page.getByRole('option', { name: 'January' }).click();
              
              await page.getByText('Day', { exact: true }).click();
              // 使用更精确的选择器
              await page.getByRole('option', { name: '15', exact: true }).click(); 
              
              await page.getByRole('button', { name: 'Next', exact: true }).click();
          }
      } catch (e) {
          logger.info('[Playwright] 生日屏幕未出现或超时，跳过。');
      }

      // 9. 处理生日后流程
      logger.info('[Playwright] 处理后续步骤...');
      
      try {
          const okBtn = page.getByRole('button', { name: 'OK' });
          if (await okBtn.isVisible({ timeout: 3000 })) {
               await okBtn.click();
          }
      } catch (e) {}

      try {
          const roleOption = page.getByText('Other (please specify)');
          const continueBtn = page.getByRole('button', { name: 'Continue to Dreamina' });

          if (await continueBtn.isVisible({ timeout: 5000 }) || await roleOption.isVisible({ timeout: 5000 })) {
               
               if (await roleOption.isVisible()) {
                  await roleOption.click();
               } else {
                  await page.locator('div[class*="role-card"], div[class*="option"]').first().click();
               }
               await continueBtn.click();
          }
      } catch (e) {}

      // 10. 等待 Session
      logger.info('[Playwright] 等待登录完成获取 SessionID...');
      await page.waitForTimeout(5000);

      const cookies = await context.cookies();
      const sessionCookie = cookies.find(c => c.name === 'sessionid');
      
      if (sessionCookie) {
          sessionCookieValue = sessionCookie.value;
          logger.info(`[Playwright] 成功获取 Session ID: ${sessionCookieValue.substring(0, 10)}...`);
      } else {
          logger.error('[Playwright] 警告: 未找到 Session ID Cookie');
          throw new Error("未找到 Session ID");
      }

    } catch (error: any) {
      logger.error(`[Playwright] 自动化流程出错: ${error.message}`);
      throw error;
    } finally {
      if (browser) await browser.close();
    }
    
    return sessionCookieValue;
  }
    // static async generateNewSession(): Promise<string> {
    //   return new Promise((resolve) => {
    //     setTimeout(() => {
    //       resolve('9eb935d310278f90dd1f53efafea8572');
    //     }, 1000);
    //   });
    // } 
}
