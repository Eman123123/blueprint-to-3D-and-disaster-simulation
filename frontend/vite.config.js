import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react({
    include: ['**/*.jsx', '**/*.js'] // Add this line to include .js files
  })],
  server: {
    port: 3000,
    open: true
  }
})