/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_HF_LIVE_BASE?: string
  readonly VITE_SNAPSHOT_CDN_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
