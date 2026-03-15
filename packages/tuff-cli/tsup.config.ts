import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/bin/tuff.ts'],
  format: ['esm'],
  dts: true,
  splitting: true,
  clean: true,
  target: 'node18',
  platform: 'node',
  noExternal: ['@talex-touch/utils'],
  external: [
    'vite',
    'rollup',
    '@talex-touch/unplugin-export-plugin/vite',
  ],
})
