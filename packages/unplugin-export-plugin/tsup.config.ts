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
    'src/bin/tuff.ts',
  ],
  clean: true,
  format: ['esm'],
  dts: true,
  splitting: true,
  target: 'node16',
  platform: 'node',
  external: [
    'unplugin',
    'fs-extra',
    'pathe',
    'compressing',
    'chalk',
    'cli-progress',
  ],
}
