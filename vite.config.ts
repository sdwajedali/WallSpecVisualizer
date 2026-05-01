import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react()],
  resolve: {
    alias: {
      'react-colorful/dist/index.css': '/src/styles/react-colorful-fallback.css'
    }
  },
  optimizeDeps: {
    exclude: ['react-colorful']
  }
})
