import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

function isolatedBrowserRenderHeaders() {
  const applyHeaders = (req, res, next) => {
    const url = req.url || ''
    const isStreamerRoute = url.startsWith('/streamer')
    const isFfmpegVendorAsset = url.startsWith('/vendor/ffmpeg/')

    // FFmpeg.wasm requires cross-origin isolation, but we scope it to streamer routes
    // so other app sections that rely on third-party embeds are unaffected.
    if (isStreamerRoute || isFfmpegVendorAsset) {
      res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
    }

    next()
  }

  return {
    name: 'streamer-isolation-headers',
    configureServer(server) {
      server.middlewares.use(applyHeaders)
    },
    configurePreviewServer(server) {
      server.middlewares.use(applyHeaders)
    }
  }
}

export default defineConfig(({ command }) => ({
  root: 'app',
  // Public directory is at project root (not under app/)
  publicDir: '../public',
  // Use subdirectory base only for production builds (GitHub Pages)
  // Local dev server uses root path for easier testing
  base: command === 'build' ? '/StarCitizen-OmniCore/' : '/',
  plugins: [react(), isolatedBrowserRenderHeaders()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './app/'),
    },
  },
  build: {
    outDir: '../dist',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return undefined
          }

          if (id.includes('@mantine/')) {
            return 'mantine'
          }

          if (id.includes('@arwes/') || id.includes('/arwes/')) {
            return 'arwes'
          }

          if (id.includes('@tanstack/')) {
            return 'query-vendor'
          }

          return 'vendor'
        }
      }
    }
  },
  css: {
    postcss: null,
  },
  // Exclude ffmpeg packages from pre-bundling so their Worker uses
  // import.meta.url correctly (new Worker(new URL('./worker.js', import.meta.url)))
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
  server: {
    host: 'localhost',
    port: 4342,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  }
}))
