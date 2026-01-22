import { readFileSync } from 'node:fs'
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

export default defineConfig({
  build: {
    target: 'esnext',
    outDir: 'es',
    emptyOutDir: false,
    minify: false,
    rollupOptions: {
      external: externalDeps,
      input: ['./src/index.ts'],
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
      formats: ['es', 'cjs', 'umd'],
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
