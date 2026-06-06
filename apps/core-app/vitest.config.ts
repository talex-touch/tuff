import path from 'node:path'
import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import { defineConfig } from 'vitest/config'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const workspaceRoot = path.resolve(__dirname, '..', '..')
const rendererPath = path.join(__dirname, 'src', 'renderer', 'src')
const tuffexRoot = path.join(workspaceRoot, 'packages', 'tuffex')

export default defineConfig({
  plugins: [
    vue(),
    AutoImport({
      imports: ['vue', 'vue-router'],
      dts: false
    })
  ],
  resolve: {
    alias: [
      {
        find: /^~\//,
        replacement: `${rendererPath}/`
      },
      {
        find: /^@talex-touch\/tuffex\/base\.css$/,
        replacement: path.join(tuffexRoot, 'packages', 'components', 'style', 'index.scss')
      },
      {
        find: /^@talex-touch\/tuffex\/([^/]+)\/style\.css$/,
        replacement: path.join(tuffexRoot, 'dist', 'es', '$1', 'style.css')
      },
      {
        find: /^@talex-touch\/tuffex\/utils$/,
        replacement: path.join(tuffexRoot, 'packages', 'utils', 'index.ts')
      },
      {
        find: /^@talex-touch\/tuffex\/([a-z0-9-]+)$/,
        replacement: path.join(tuffexRoot, 'packages', 'components', 'src', '$1', 'index.ts')
      },
      {
        find: /^@talex-touch\/tuffex$/,
        replacement: path.join(tuffexRoot, 'packages', 'components', 'src', 'index.ts')
      }
    ]
  }
})
