import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    outDir: 'dist',
    // Inline assets so the plugin is self-contained in the dist folder
    assetsInlineLimit: 100000,
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
})
