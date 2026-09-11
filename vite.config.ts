import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    'process.env': {
      // Nécessaire pour éviter les erreurs avec Google Maps
      NODE_ENV: JSON.stringify(process.env.NODE_ENV || 'production'),
    },
  },
  build: {
    // Assurez-vous que les fichiers sont bien générés
    outDir: 'dist',
    sourcemap: true,
  },
});