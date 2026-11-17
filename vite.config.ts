/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

// Relative base so the production build works from any folder,
// including when index.html is opened from a static file server or sub-path.
export default defineConfig({
  base: './',
  // Application semantic version, single source of truth: package.json.
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  // No explicit target: Vite's default, "baseline-widely-available", follows Vite upgrades.
  build: { sourcemap: true },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
