import { existsSync, readdirSync, readFileSync } from 'node:fs'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

const pkg = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf-8')
)
const externalDeps = Array.from(
  new Set([
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.peerDependencies ?? {})
  ])
)
// Every directory under src/ was treated as a component and required to have an
// index.ts, so adding any non-component directory (a shared __tests__ folder,
// for example) broke the whole build with an unresolved-entry error. Only take
// directories that actually expose an entry.
const componentEntries = Object.fromEntries(
  readdirSync(new URL('./src', import.meta.url), { withFileTypes: true })
    .filter(dirent => dirent.isDirectory() && dirent.name !== 'utils')
    .filter(dirent => existsSync(new URL(`./src/${dirent.name}/index.ts`, import.meta.url)))
    .map(dirent => [`${dirent.name}/index`, `./src/${dirent.name}/index.ts`])
)

export default defineConfig({
  build: {
    target: 'esnext',
    outDir: 'es',
    emptyOutDir: false,
    minify: false,
    rollupOptions: {
      external: externalDeps,
      input: {
        index: './src/index.ts',
        'utils/index': './src/utils/index.ts',
        ...componentEntries,
      },
      output: [
        {
          exports: 'named',
          format: 'es',
          dir: '../../dist/es',
          entryFileNames: '[name].js',
          preserveModules: true,
          preserveModulesRoot: 'src',
        },
        {
          exports: 'named',
          format: 'cjs',
          dir: '../../dist/lib',
          entryFileNames: '[name].js',
          preserveModules: true,
          preserveModulesRoot: 'src',
        },
        // 开启umd打包模式
        // {
        //   name: 'vuecomp',
        //   exports: 'named',
        //   format: 'umd',
        //   dir: '../../dist/umd',
        //   entryFileNames: '[name].js',
        // }
      ],
    },
    lib: {
      entry: 'src/index.ts',
      name: 'vuecomp',
      // No `formats`: `rollupOptions.output` above is already an array and owns
      // the es/cjs outputs, so Vite ignores this key and warns. Listing 'umd'
      // here was doubly misleading — the umd output block is commented out.
    },
  },
  plugins: [
    vue(),
    dts({
      entryRoot: './src',
      outDir: '../../dist/es',
    }),
  ],
})
