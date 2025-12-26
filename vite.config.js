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
  cacheDir: 'node_modules/.vite',
  clearScreen: false, // Prevent clearing screen which can cause issues on Windows
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1000, // Increase warning limit to 1MB
    rollupOptions: {
      input: resolve(__dirname, 'index.html'),
      output: {
        manualChunks: (id) => {
          // Split node_modules into separate chunks
          if (id.includes('node_modules')) {
            // Vendor chunks
            if (id.includes('react') || id.includes('react-dom')) {
              return 'vendor-react'
            }
            if (id.includes('leaflet')) {
              return 'vendor-leaflet'
            }
            if (id.includes('xlsx')) {
              return 'vendor-xlsx'
            }
            // Other vendor libraries
            return 'vendor'
          }
          
          // Split large components into separate chunks
          if (id.includes('src/components')) {
            // Large components that should be in their own chunks
            if (id.includes('TemplateEditor')) {
              return 'component-template-editor'
            }
            if (id.includes('ProviderAnalysisDashboard')) {
              return 'component-provider-analysis'
            }
            if (id.includes('FuelCardAnalysisList')) {
              return 'component-fuel-card-analysis'
            }
            if (id.includes('Dashboard')) {
              return 'component-dashboard'
            }
            // Group other components
            return 'components'
          }
        }
      }
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
        secure: false,
        // Настройки для корректной передачи cookies через proxy
        configure: (proxy, _options) => {
          proxy.on('proxyRes', (proxyRes, req, res) => {
            // Перезаписываем domain в Set-Cookie для работы с localhost
            const cookies = proxyRes.headers['set-cookie']
            if (cookies) {
              proxyRes.headers['set-cookie'] = cookies.map(cookie => {
                return cookie
                  .replace(/Domain=[^;]+;?\s*/gi, '')
                  .replace(/Secure;?\s*/gi, '')
              })
            }
          })
        }
      }
    }
  }
})

