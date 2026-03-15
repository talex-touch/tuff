import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  splitting: true,
  clean: true,
  target: 'node18',
  platform: 'node',
  noExternal: ['@talex-touch/utils'],
  external: [
    'fs-extra',
    'glob',
    'pathe',
    'compressing',
    'cli-progress',
    'vite',
  ],
})
