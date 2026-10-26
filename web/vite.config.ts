import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // El backend va detras de /api, para que la cookie de sesion sea del MISMO
    // origen que la pagina. Asi no hay CORS en desarrollo y se parece a
    // produccion, donde nginx sirve los estaticos y hace proxy de /api.
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
    },
  },
});
