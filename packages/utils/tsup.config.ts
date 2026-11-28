import { execFile } from 'node:child_process'
import { rmSync } from 'node:fs'
import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { defineConfig } from 'tsup'

const packageRoot = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(packageRoot, '../..')
const piDesktopReuse = /^@talex-touch\/pi-desktop-reuse(?:\/|$)/
const execFileAsync = promisify(execFile)

const ENTRIES = [
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
] as const

function resolveTscBin(): string {
  for (const anchor of [path.join(packageRoot, 'package.json'), path.join(workspaceRoot, 'package.json')]) {
    try {
      return createRequire(anchor).resolve('typescript/bin/tsc')
    }
    catch {
      // Fall back to workspace root when TypeScript is hoisted.
    }
  }
  throw new Error('Unable to resolve typescript/bin/tsc for @talex-touch/utils declaration emit.')
}

async function copyDeclarationSidecarAssets(srcDir: string, dstDir: string): Promise<void> {
  const entries = await readdir(srcDir, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '__tests__') {
      continue
    }
    const srcPath = path.join(srcDir, entry.name)
    const dstPath = path.join(dstDir, entry.name)
    if (entry.isDirectory()) {
      await copyDeclarationSidecarAssets(srcPath, dstPath)
    }
    else if (entry.name.endsWith('.json') || entry.name.endsWith('.d.ts')) {
      await mkdir(path.dirname(dstPath), { recursive: true })
      await cp(srcPath, dstPath)
    }
  }
}

/**
 * Emits raw `.d.ts` declarations once via `tsc` into an isolated temp directory before
 * handing them to tsup's `rollup-plugin-dts` worker.
 *
 * Passing 41 subdirectory `.ts` entries directly to `rollup-plugin-dts` triggers a cache-hit
 * `dirName` bug in `getCompilerOptions`, creating ~32 concurrent `ts.Program` instances in
 * a single worker_thread (>4.5 GB heap -> `ERR_WORKER_OUT_OF_MEMORY` on CI without huge
 * `NODE_OPTIONS`). Pre-emitting once keeps peak RSS under ~700 MB and avoids duplicate
 * type-checking while still letting Rollup resolve and inline `@talex-touch/pi-desktop-reuse`.
 */
async function stageDeclarations(manifestFiles: readonly string[]): Promise<{
  stageDir: string
  dtsEntry: Record<string, string>
}> {
  const stageDir = await mkdtemp(path.join(os.tmpdir(), 'tuff-utils-dts-'))
  const cleanupSync = () => {
    try {
      rmSync(stageDir, { recursive: true, force: true })
    }
    catch {
      // Best-effort temp cleanup on process exit.
    }
  }
  process.once('exit', cleanupSync)

  try {
    const tscBin = resolveTscBin()
    await execFileAsync(process.execPath, [
      tscBin,
      '-p',
      path.join(packageRoot, 'tsconfig.build.json'),
      '--outDir',
      stageDir,
      '--rootDir',
      packageRoot,
    ], {
      cwd: packageRoot,
      maxBuffer: 16 * 1024 * 1024,
    })

    for (const file of manifestFiles) {
      if (file === 'dist' || file === 'LICENSE' || file.endsWith('.ts') || file.endsWith('.json')) {
        continue
      }
      const sourceDir = path.join(packageRoot, file)
      await copyDeclarationSidecarAssets(sourceDir, path.join(stageDir, file))
    }

    const dtsEntry = Object.fromEntries(
      ENTRIES.map(entry => [
        entry.replace(/\.ts$/, ''),
        path.join(stageDir, entry.replace(/\.ts$/, '.d.ts')),
      ]),
    )
    return { stageDir, dtsEntry }
  }
  catch (error) {
    cleanupSync()
    if (error && typeof error === 'object' && 'stdout' in error) {
      const { stdout, stderr } = error as { stdout?: string, stderr?: string }
      if (stdout)
        process.stderr.write(stdout)
      if (stderr)
        process.stderr.write(stderr)
    }
    throw error
  }
}

export default defineConfig(async (cliOptions) => {
  const manifest = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8')) as {
    files: string[]
  }
  const dtsEnabled = cliOptions.dts !== false
  const staged = dtsEnabled ? await stageDeclarations(manifest.files) : null

  return {
    entry: [...ENTRIES],
    format: ['esm'],
    dts: staged ? { entry: staged.dtsEntry, resolve: [piDesktopReuse] } : false,
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
  }
})
