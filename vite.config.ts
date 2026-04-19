import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
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
