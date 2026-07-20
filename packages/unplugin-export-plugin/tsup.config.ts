import type { Options } from 'tsup'

export default <Options>{
  entryPoints: [
    'src/index.ts',
    'src/vite.ts',
    'src/webpack.ts',
    'src/rollup.ts',
    'src/esbuild.ts',
    'src/nuxt.ts',
    'src/types.ts',
    'src/preload.ts',
  ],
  clean: true,
  format: ['esm'],
  dts: true,
  splitting: true,
  target: 'node24',
  platform: 'node',
  external: [
    'unplugin',
    'fs-extra',
    'pathe',
    'chalk',
    'lightningcss',
    'rollup',
  ],
  banner: {
    js: 'import { createRequire as __createRequire } from \'node:module\'; const require = __createRequire(import.meta.url);',
  },
}
