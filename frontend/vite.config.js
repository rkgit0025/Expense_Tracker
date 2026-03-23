import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],

  // ── Dev server ───────────────────────────────────────────────
  server: {
    port: 3006,
    proxy: {
      '/api':     { target: 'http://localhost:8000', changeOrigin: true },
      '/uploads': { target: 'http://localhost:8000', changeOrigin: true },
    }
  },

  // ── Production build optimisations ──────────────────────────
  build: {
    // Split vendor chunks so browser can cache them separately
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react':  ['react', 'react-dom', 'react-router-dom'],
          'vendor-axios':  ['axios'],
        }
      }
    },
    // Minify + compress
    minify: 'esbuild',
    // Inline small assets (< 4 KB) to save HTTP round-trips
    assetsInlineLimit: 4096,
    // Generate source maps only for non-prod debugging (set false to shrink bundle)
    sourcemap: false,
    // Chunk size warning threshold
    chunkSizeWarningLimit: 600,
  },

  // ── Preview (serve built dist) ───────────────────────────────
  preview: {
    port: 3006,
  }
});
