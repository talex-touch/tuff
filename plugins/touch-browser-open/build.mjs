import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

async function main() {
  const root = path.dirname(fileURLToPath(import.meta.url))
  const outDir = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, 'dist')
  const compiler = createRequire(new URL('../../packages/tuff-cli-core/package.json', import.meta.url))('esbuild')
  const { build: exportPlugin } = createRequire(new URL('../../packages/tuff-cli/package.json', import.meta.url))('@talex-touch/tuff-cli-core')
  await compiler.build({
    entryPoints: [path.join(root, 'settings-bridge.ts')],
    outfile: path.join(outDir, 'settings-sdk.js'),
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'chrome140',
    minify: true,
    sourcemap: false,
    logLevel: 'warning',
  })
  await exportPlugin({ root, outDir, assets: { copy: ['settings.html'] } })
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
