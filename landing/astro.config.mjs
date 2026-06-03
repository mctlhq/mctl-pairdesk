import { defineConfig } from 'astro/config';

// Landing page for PairDesk — built as fully static HTML at the Express /public root.
// outDir '../public' means Astro writes public/index.html and public/_astro/...
// The Express static middleware serves public/index.html at GET / automatically.
// The Mini App SPA lives at public/app/ (Vite, base '/app/').
export default defineConfig({
  output: 'static',
  outDir: '../public',
  build: {
    assets: '_astro',
  },
});
