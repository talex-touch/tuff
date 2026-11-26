import { execFile } from 'node:child_process'
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { defineConfig } from 'tsup'

const packageRoot = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(packageRoot, '../..')
const piDesktopReuse = /^@talex-touch\/pi-desktop-reuse(?:\/|$)/
const execFileAsync = promisify(execFile)

export default defineConfig({
  entry: [
    'account/index.ts',
    'analytics/index.ts',
    'auth/index.ts',
    'base/index.ts',
    'clipboard/index.ts',
    'cloud-share/index.ts',
    'cloud-sync/index.ts',
    'common/index.ts',
    'core-box/index.ts',
    'electron/index.ts',
    'env/index.ts',
    'eventbus/index.ts',
    'i18n/index.ts',
    'icons/index.ts',
    'index.ts',
    'intelligence/index.ts',
    'network/index.ts',
    'permission/index.ts',
    'plugin/index.ts',
    'plugin/preload.ts',
    'plugin/theme.ts',
    'plugin/sdk/box-sdk.ts',
    'plugin/sdk/clipboard.ts',
    'plugin/sdk/index.ts',
    'plugin/sdk/service/index.ts',
    'plugin/sdk/storage.ts',
    'plugin/sdk/system.ts',
    'plugin/sdk/types.ts',
    'preload/index.ts',
    'search/index.ts',
    'service/index.ts',
    'service/protocol/index.ts',
    'store/index.ts',
    'tds-theme/index.ts',
    'transport/events/herdr.ts',
    'transport/events/types/index.ts',
    'transport/index.ts',
    'transport/sdk/domains/herdr.ts',
    'types/ai-orchestrator.ts',
    'types/intelligence.ts',
    'types/index.ts',
  ],
  format: ['esm'],
  dts: { resolve: [piDesktopReuse] },
  noExternal: [piDesktopReuse],
  target: 'node24',
  platform: 'neutral',
  clean: true,
  outDir: 'dist',
  tsconfig: 'tsconfig.build.json',
  banner: {
    js: '/*! Includes PI-Desktop contributors / vastsa code, LGPL-3.0-only, pinned 3b036cc7810e18b3ef7689a2b93385125a8d0a3f. See legal/pi-desktop-reuse for notices, licenses and corresponding source. */',
  },
  async onSuccess() {
    const legalRoot = path.join(packageRoot, 'dist/legal/pi-desktop-reuse')
    const sourceRoot = path.join(legalRoot, 'source')
    const libraryRoot = path.join(workspaceRoot, 'packages/pi-desktop-reuse')
    await mkdir(legalRoot, { recursive: true })
    for (const file of ['LICENSE', 'COPYING', 'NOTICE', 'sources.json']) {
      await cp(path.join(libraryRoot, file), path.join(legalRoot, file))
    }
    // Ship the original sources, not a second implementation. The workspace-shaped tree
    // lets recipients edit the Library and relink the same public entry points with tsup.
    for (const file of ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'LICENSE', 'patches']) {
      await cp(path.join(workspaceRoot, file), path.join(sourceRoot, file), { recursive: true })
    }
    for (const file of ['package.json', 'LICENSE', 'COPYING', 'NOTICE', 'BUILDING.md', 'sources.json', 'src']) {
      await cp(path.join(libraryRoot, file), path.join(sourceRoot, 'packages/pi-desktop-reuse', file), { recursive: true })
    }
    const manifest = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8')) as { files: string[] }
    for (const file of ['package.json', ...manifest.files.filter(file => file !== 'dist')]) {
      await cp(path.join(packageRoot, file), path.join(sourceRoot, 'packages/utils', file), { recursive: true })
    }
    // npm's file filtering drops nested declaration sources; archive the complete
    // corresponding tree before packing so rebuilding does not depend on that filter.
    await execFileAsync('tar', ['-czf', path.join(legalRoot, 'source.tar.gz'), '-C', sourceRoot, '.'])
    await rm(sourceRoot, { recursive: true, force: true })
    await writeFile(path.join(legalRoot, 'BUILDING.txt'), [
      '@talex-touch/utils bundles selected PI-Desktop modules and their declarations.',
      'The Library is LGPL-3.0-only; Tuff-owned utils source remains MPL-2.0.',
      'LICENSE and COPYING contain the LGPL/GPL terms; NOTICE and sources.json retain attribution and the pinned upstream mapping.',
      'The Electron-specific packaging instructions in the original NOTICE do not describe this npm distribution.',
      'For this npm Combined Work, LGPL section 4(d)(0) is served by source.tar.gz: the original Library, corresponding utils application code, licenses, build configuration and locked dependency inputs.',
      'No release signature or private registry package is needed to modify or recombine this distribution.',
      '',
      'To rebuild with a modified Library:',
      '1. Extract source.tar.gz to a writable directory outside node_modules.',
      '2. Edit packages/pi-desktop-reuse/src/; retain source headers and update sources.json for changed mappings.',
      '3. Use Node >=26 and the pnpm version declared by the extracted package.json.',
      '4. From the extracted root, run pnpm --filter @talex-touch/utils... install --frozen-lockfile --ignore-scripts.',
      '5. Run npm_config_verify_deps_before_run=false pnpm_config_verify_deps_before_run=false pnpm --filter @talex-touch/utils run build.',
      '6. Replace the installed @talex-touch/utils/dist directory with packages/utils/dist, or pack the rebuilt workspace package with pnpm pack and install that tarball.',
      'This regenerates both executable modules and declarations from the modified Library.',
      'External dependencies remain installed from their declared public registries and keep their own licenses.',
      '',
    ].join('\n'))
  },
})
