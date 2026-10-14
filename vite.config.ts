import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Served from https://devindipk.github.io/pocket-interviewer/ in production.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/pocket-interviewer/' : '/',
  plugins: [react()],
}))
