interface ImportMetaEnv {
  readonly PUBLIC_SITE_URL?: string;
  readonly PUBLIC_APP_URL?: string;
  readonly PUBLIC_STORE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
