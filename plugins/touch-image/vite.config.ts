import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import TouchPluginExport from '@talex-touch/unplugin-export-plugin/vite'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue(), UnoCSS(), TouchPluginExport()],
  css: {
    preprocessorOptions: {
      scss: {
        
      }
    }
  },
  // set server port
  server: {
    port: 6001
  }
})
