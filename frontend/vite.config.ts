import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    tailwindcss(),
  ],
  server: {
    host: '0.0.0.0',
    proxy: {
      '/auth': 'http://localhost:8000',
      '/schedules': 'http://localhost:8000',
      '/google': 'http://localhost:8000',
      '/ai': 'http://localhost:8000',
      '/microsoft': 'http://localhost:8000',
      '/login': 'http://localhost:8000',
      '/register': 'http://localhost:8000',
      '/protected': 'http://localhost:8000',
    },
  },
})
