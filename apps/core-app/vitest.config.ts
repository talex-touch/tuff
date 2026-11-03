import path from 'node:path'
import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import { configDefaults, defineConfig } from 'vitest/config'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const workspaceRoot = path.resolve(__dirname, '..', '..')
const rendererPath = path.join(__dirname, 'src', 'renderer', 'src')
const tuffexRoot = path.join(workspaceRoot, 'packages', 'tuffex')

export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, 'scripts/search-index-stress/**'],
    poolOptions: {
      forks: {
        /**
         * Node 26 exposes a built-in `localStorage` global that is `undefined`
         * unless `--localstorage-file` is passed. In a jsdom environment it wins
         * over jsdom's own implementation, so `window.localStorage` reads back
         * undefined and every test touching UI preference storage fails. Turning
         * the built-in off hands the global back to jsdom.
         */
        execArgv: ['--no-experimental-webstorage']
      }
    }
  },
  plugins: [
    vue(),
    {
      // The real runtime is served by electron.vite.config; tests never start a widget frame.
      name: 'widget-sandbox-runtime-stub',
      enforce: 'pre',
      resolveId(id) {
        if (id === 'virtual:widget-sandbox-runtime') return '\0widget-sandbox-runtime'
      },
      load(id) {
        if (id === '\0widget-sandbox-runtime') return 'export default ""'
      }
    },
    AutoImport({
      imports: ['vue', 'vue-router'],
      dts: false
    })
  ],
  resolve: {
    dedupe: ['electron'],
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
        find: /^@talex-touch\/intelligence-uikit$/,
        replacement: path.join(workspaceRoot, 'packages', 'intelligence-uikit', 'src', 'index.ts')
      },
      {
        find: /^@talex-touch\/tuffex$/,
        replacement: path.join(tuffexRoot, 'packages', 'components', 'src', 'index.ts')
      }
    ]
  }
})
