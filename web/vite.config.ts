import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Landing page at `/` (Astro, public/); Mini App SPA at `/app` (Vite, public/app/).
// base '/app/' ensures all asset URLs are prefixed with /app/ so they resolve
// correctly when the SPA is served at the /app sub-path.
// The Express SPA fallback maps /app, /admin, /docs to public/app/index.html.
export default defineConfig({
  plugins: [react()],
  base: '/app/',
  build: {
    outDir: '../public/app',
    emptyOutDir: true,
  },
  server: {
    // Local dev: proxy /api to the backend so the SPA and API share an origin.
    proxy: {
      '/api': 'http://localhost:8099',
    },
  },
});
