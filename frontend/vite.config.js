import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/generate-story": "http://127.0.0.1:8000",
      "/predict-reading-skill": "http://127.0.0.1:8000",
      "/log-session": "http://127.0.0.1:8000",
    },
  },
})
