import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Build the React Mini App SPA into the backend's /public dir. PairDesk has no
// separate marketing landing (unlike loyalty), so the SPA owns the /public root
// with base '/'. The Express SPA fallback maps /app, /admin, /docs to index.html;
// assets resolve from the absolute /assets/* path on every route.
export default defineConfig({
  plugins: [react()],
  base: '/',
  build: {
    outDir: '../public',
    emptyOutDir: true,
  },
  server: {
    // Local dev: proxy /api to the backend so the SPA and API share an origin.
    proxy: {
      '/api': 'http://localhost:8099',
    },
  },
});
