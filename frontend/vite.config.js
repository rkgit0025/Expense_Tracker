import { defineConfig, splitVendorChunkPlugin } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    react(),
    splitVendorChunkPlugin(), // auto-split vendor chunks
  ],

  // ── Dev server ────────────────────────────────────────────────
  server: {
    port: 3006,
    proxy: {
      '/api':     { target: 'http://localhost:8000', changeOrigin: true },
      '/uploads': { target: 'http://localhost:8000', changeOrigin: true },
    }
  },

  // ── Production build ──────────────────────────────────────────
  build: {
    minify:               'esbuild',    // fastest minifier
    sourcemap:            false,        // no source maps = smaller bundle
    assetsInlineLimit:    4096,         // inline assets < 4 KB
    chunkSizeWarningLimit: 600,

    rollupOptions: {
      output: {
        // Split into cache-friendly chunks
        manualChunks(id) {
          // React ecosystem — very stable, cached forever
          if (id.includes('node_modules/react') ||
              id.includes('node_modules/react-dom') ||
              id.includes('node_modules/react-router-dom') ||
              id.includes('node_modules/scheduler')) {
            return 'vendor-react';
          }
          // Axios — rarely changes
          if (id.includes('node_modules/axios')) {
            return 'vendor-axios';
          }
          // All other node_modules go into a single vendor chunk
          if (id.includes('node_modules')) {
            return 'vendor-misc';
          }
        },
        // Consistent file names for better CDN caching
        chunkFileNames:  'assets/js/[name]-[hash].js',
        entryFileNames:  'assets/js/[name]-[hash].js',
        assetFileNames:  'assets/[ext]/[name]-[hash].[ext]',
      }
    },

    // Target modern browsers — smaller output, no legacy polyfills
    target: ['es2020', 'chrome80', 'firefox78', 'safari14'],

    // Report which modules are biggest (helps spot bloat)
    reportCompressedSize: true,
  },

  preview: { port: 3006 },
});
