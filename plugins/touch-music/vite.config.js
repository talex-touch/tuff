import path from 'node:path'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

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
  plugins: [vue()],
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
