import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    // Тестовое окружение
    environment: 'jsdom',
    
    // Глобальные настройки
    globals: true,
    
    // Файлы setup
    setupFiles: ['./src/test/setup.js'],
    
    // Паттерны для поиска тестовых файлов
    include: ['src/**/*.{test,spec}.{js,jsx}'],
    exclude: ['node_modules', 'dist', '.git'],
    
    // Coverage настройки
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov', 'json-summary'],
      reportsDirectory: './coverage',
      exclude: [
        'node_modules/',
        'src/test/',
        '**/*.config.js',
        '**/*.config.*.js',
        '**/dist/**',
        '**/*.d.ts',
        '**/*.css',
        '**/main.jsx',
        '**/App.jsx',
        '**/index.js',
        '**/index.jsx',
        '**/*.stories.*',
        '**/*.test.*',
        '**/*.spec.*'
      ],
      // Минимальные пороги покрытия
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 50,
        statements: 60
      },
      // Включаем все файлы для coverage
      all: true,
      // Исключаем неиспользуемые файлы
      skipFull: false
    },
    
    // Таймауты
    testTimeout: 10000,
    hookTimeout: 10000,
    
    // Отчеты
    reporters: ['verbose'],
    
    // Mock настройки
    mockReset: true,
    restoreMocks: true
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src')
    }
  }
})

