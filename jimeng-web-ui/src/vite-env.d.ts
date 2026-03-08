/** 手写 Vite 环境类型，不依赖 vite/client 类型包 */
interface ImportMetaEnv {
  readonly VITE_ACCESS_PASSWORD?: string
  readonly BASE_URL: string
  readonly MODE: string
  readonly DEV: boolean
  readonly PROD: boolean
  readonly SSR: boolean
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
