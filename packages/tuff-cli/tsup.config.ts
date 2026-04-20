import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/bin/tuff.ts'],
  format: ['esm'],
  dts: true,
  splitting: true,
  clean: true,
  target: 'node18',
  platform: 'node',
  noExternal: [
    '@talex-touch/tuff-cli-core',
    '@talex-touch/utils',
    '@talex-touch/unplugin-export-plugin',
    '@talex-touch/unplugin-export-plugin/vite',
  ],
  external: [
    'chalk',
    'cli-progress',
    'compressing',
    'debug',
    'esbuild',
    'fs-extra',
    'glob',
    'pathe',
    'rollup',
    'unplugin',
    'vite',
  ],
})
