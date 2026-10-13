/// <reference types="vite/client" />
interface ImportMetaEnv {
  /** Commit the web bundle was built from (set by the deploy workflow). */
  readonly VITE_APP_VERSION?: string;
}
