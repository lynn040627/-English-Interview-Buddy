import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// Cloudflare Pages 纯静态 SPA：base 用相对路径
export default defineConfig({
  base: './',
  plugins: [vue()],
  server: { port: 5173, open: false, host: true },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        // pdfmake / jspdf 体积较大，单独拆 chunk
        manualChunks: {
          pdf: ['jspdf']
        }
      }
    }
  }
})
