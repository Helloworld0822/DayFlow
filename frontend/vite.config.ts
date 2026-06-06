import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] })
  ],
  server: {
    host: '0.0.0.0',
    proxy: {
      '/auth': 'http://backend:8000',
      '/schedules': 'http://backend:8000',
      '/google': 'http://backend:8000',
      '/ai': 'http://backend:8000',
      '/login': 'http://backend:8000',
      '/register': 'http://backend:8000',
      '/protected': 'http://backend:8000',
    },
  },
})
