import path from 'node:path'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

const unresolvedMusicModule = path.resolve(__dirname, 'src/modules/music')

const testModuleResolver = {
  name: 'touch-music-test-module-resolver',
  enforce: 'pre',
  apply(_config, { mode }) {
    return mode === 'test'
  },
  resolveId(id) {
    if (id === '@modules/music' || id === unresolvedMusicModule)
      return '\0touch-music-test:music'
  },
  load(id) {
    if (id === '\0touch-music-test:music')
      return 'export {}'
  },
}

// Chromium/Electron renders WOFF2 icon fonts natively; stripping legacy EOT/TTF/WOFF/SVG
// font fallbacks drops the 3MB remixicon.svg asset and keeps the bundle compact.
const slimRemixIconFonts = {
  name: 'touch-music-slim-remixicon-fonts',
  enforce: 'pre',
  transform(code, id) {
    if (!id.endsWith('remixicon/fonts/remixicon.css'))
      return null
    return {
      code: code.replace(
        /@font-face\s*\{[\s\S]*?\}/,
        `@font-face {\n  font-family: "remixicon";\n  src: url('remixicon.woff2') format("woff2");\n  font-display: swap;\n}`,
      ),
      map: null,
    }
  },
}

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  build: {
    modulePreload: { polyfill: false },
  },
  resolve: {
    alias: [
      {
        find: '@modules',
        replacement: path.resolve(__dirname, 'src/modules'),
      },
      {
        find: '@comp',
        replacement: path.resolve(__dirname, 'src/components'),
      },
      {
        find: '~',
        replacement: path.resolve(__dirname, 'src'),
      },
    ],
  },
  plugins: [testModuleResolver, slimRemixIconFonts, vue()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,js}'],
  },
})
