/** Application version and identity, injected at build time from package.json (see vite.config.ts). */
declare const __APP_VERSION__: string;

export const APP_NAME = 'EasyPanel';
export const APP_VERSION: string = __APP_VERSION__;
