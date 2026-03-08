import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Region } from '../types'
import { formatAuthHeader, stripRegionPrefix } from '../utils/region-prefix'
import { apiService } from '../services/api.service'

const STORAGE_KEY = 'jimeng_settings'

// 默认 API 地址：使用当前页面 origin（兼容 Nginx 反向代理统一入口部署）
const DEFAULT_API_BASE_URL = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5100'
interface StoredSettings {
  apiBaseUrl: string
  sessionId: string
  region: Region
  sessionApiUrl: string
  sessionApiKey: string
}

export const useSettingsStore = defineStore('settings', () => {
  // State
  const apiBaseUrl = ref(DEFAULT_API_BASE_URL)
  const sessionId = ref('')
  const region = ref<Region>('cn')
  const sessionApiUrl = ref('')
  const sessionApiKey = ref('')

  // Getters
  const isConfigured = computed(() => sessionId.value.length > 0)

  const formattedSessionId = computed(() => {
    if (!sessionId.value) return ''
    const raw = stripRegionPrefix(sessionId.value)
    const prefix = region.value === 'cn' ? '' : `${region.value}-`
    return `${prefix}${raw}`
  })

  const authHeader = computed(() => {
    if (!sessionId.value) return ''
    return formatAuthHeader(sessionId.value, region.value)
  })

  // Actions
  function setConfig(config: Partial<StoredSettings>) {
    if (config.apiBaseUrl !== undefined) apiBaseUrl.value = config.apiBaseUrl
    if (config.sessionId !== undefined) sessionId.value = config.sessionId
    if (config.region !== undefined) region.value = config.region
    if (config.sessionApiUrl !== undefined) sessionApiUrl.value = config.sessionApiUrl
    if (config.sessionApiKey !== undefined) sessionApiKey.value = config.sessionApiKey
    saveToStorage()
  }

  function loadFromStorage() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed: StoredSettings = JSON.parse(stored)
        apiBaseUrl.value = parsed.apiBaseUrl || DEFAULT_API_BASE_URL
        sessionId.value = parsed.sessionId || ''
        region.value = parsed.region || 'cn'
        sessionApiUrl.value = parsed.sessionApiUrl ?? ''
        sessionApiKey.value = parsed.sessionApiKey ?? ''
      }
    } catch {
      // If parsing fails, use defaults
    }

    // 注入自动续期回调：当后端返回新 SessionID 时，自动更新前端状态
    apiService.onNewSessionId = (newId: string) => {
      console.log('[AutoSession] 自动更新 Session ID:', newId.substring(0, 10) + '...')
      sessionId.value = newId
      region.value = 'us'
      saveToStorage()
    }
  }

  function saveToStorage() {
    const settings: StoredSettings = {
      apiBaseUrl: apiBaseUrl.value,
      sessionId: sessionId.value,
      region: region.value,
      sessionApiUrl: sessionApiUrl.value,
      sessionApiKey: sessionApiKey.value,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  }

  function clearConfig() {
    apiBaseUrl.value = DEFAULT_API_BASE_URL
    sessionId.value = ''
    region.value = 'cn'
    sessionApiUrl.value = ''
    sessionApiKey.value = ''
    localStorage.removeItem(STORAGE_KEY)
  }

  async function generateNewSession(): Promise<{ success: boolean; message: string }> {
    try {
      // Set API config for the request
      apiService.setConfig({
        baseUrl: apiBaseUrl.value,
        sessionId: sessionId.value || 'temp', // Use temp value for generation request
        region: region.value,
      })

      const result = await apiService.generateSession()
      
      // Update the session ID with the new one
      sessionId.value = result.sessionId
      saveToStorage()
      
      return {
        success: true,
        message: result.message || 'Session ID 生成成功'
      }
    } catch (error: any) {
      return {
        success: false,
        message: error.message || 'Session ID 生成失败'
      }
    }
  }

  /** 从用户填写的 Session 获取 API 地址拉取 SessionID */
  async function fetchSessionFromApi(): Promise<{ success: boolean; message: string }> {
    try {
      const url = sessionApiUrl.value.trim()
      if (!url) {
        return { success: false, message: '请先填写 Session 获取 API 地址' }
      }
      const result = await apiService.fetchSessionFromApi(url, sessionApiKey.value.trim() || undefined)
      if (!result.sessionId) {
        return { success: false, message: result.message || '接口未返回 Session ID' }
      }
      sessionId.value = result.sessionId
      // Dreamina-Token-Manager 等账号为美区，session 只在 dreamina.capcut.com 有效；
      // 若区域为国内站会走 jimeng.jianying.com，即梦会返回 check login error
      region.value = 'us'
      saveToStorage()
      return { success: true, message: result.message || '已获取 Session ID，并已切换为美区' }
    } catch (error: any) {
      const msg = error.response?.data?.message || error.message || '请求失败，请检查 API 地址与网络'
      return { success: false, message: msg }
    }
  }

  return {
    // State
    apiBaseUrl,
    sessionId,
    region,
    sessionApiUrl,
    sessionApiKey,
    // Getters
    isConfigured,
    formattedSessionId,
    authHeader,
    // Actions
    setConfig,
    loadFromStorage,
    saveToStorage,
    clearConfig,
    generateNewSession,
    fetchSessionFromApi,
  }
})
