import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// Base path для деплоя на поддомене/подпути
// Можно задать через переменную окружения VITE_BASE_PATH
// Например: VITE_BASE_PATH=/ для корня или VITE_BASE_PATH=/app/ для подпути
const base = process.env.VITE_BASE_PATH || '/'

export default defineConfig({
  plugins: [react()],
  base: base,
  root: '.',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'index.html')
    }
  },
  server: {
    port: parseInt(process.env.PORT || '3000'),
    open: true,
    host: true, // Разрешить доступ с любых хостов
    allowedHosts: [
      'defectively-nimble-rattail.cloudpub.ru',
      'localhost',
      '127.0.0.1',
      '.cloudpub.ru' // Разрешить все поддомены cloudpub.ru
    ],
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        secure: false
      }
    }
  }
})

