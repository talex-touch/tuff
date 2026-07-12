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

// https://vitejs.dev/config/
export default defineConfig({
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
  plugins: [testModuleResolver, vue()],
  experimental: {
    renderBuiltUrl(filename, host) {
      //      console.log(filename, hostType)
      const { hostType } = host
      //      if( hostType === 'js' ) return `./js/${filename}`
      //      if( hostType === 'css' ) return `./css/${filename}`
      return `./${filename}`
    },
  },
})
