export const publishPackages = [
  {
    name: '@talex-touch/tuffex',
    path: 'packages/tuffex',
    access: 'public',
    buildCommand: 'pnpm -C "packages/tuffex" run build',
  },
  {
    name: '@talex-touch/utils',
    path: 'packages/utils',
    access: 'public',
    testCommand: 'pnpm -C "packages/utils" test',
  },
  {
    name: '@talex-touch/tuff-core',
    path: 'packages/tuff-core',
    access: 'public',
    buildCommand: 'pnpm --filter "@talex-touch/tuff-core" run build',
  },
  {
    name: '@talex-touch/unplugin-export-plugin',
    path: 'packages/unplugin-export-plugin',
    access: 'public',
    buildCommand: 'pnpm --filter "@talex-touch/unplugin-export-plugin" run build',
    waitForPackages: ['@talex-touch/utils'],
  },
  {
    name: '@talex-touch/tuff-cli',
    path: 'packages/tuff-cli',
    access: 'public',
    preBuildCommands: [
      'pnpm --filter "@talex-touch/tuff-cli-core" run build',
      'pnpm --filter "@talex-touch/unplugin-export-plugin" run build',
    ],
    buildCommand: 'pnpm --filter "@talex-touch/tuff-cli" run build',
  },
  {
    name: '@talex-touch/tuff-intelligence',
    path: 'packages/tuff-intelligence',
    access: 'public',
    buildCommand: 'pnpm --filter "@talex-touch/tuff-intelligence" run build',
    waitForPackages: ['@talex-touch/utils'],
  },
]

export const ignoredPackages = [
  'apps/core-app',
  'apps/nexus',
  'packages/test',
  'packages/tuff-business',
  'packages/tuff-cli-core',
  'packages/tuff-native',
  'packages/intelligence-uikit',
  'packages/tuffex/packages/components',
  'plugins/*',
]

export const dependencyFieldPaths = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
  'bundleDependencies',
  'bundledDependencies',
  'overrides',
  'resolutions',
  'pnpm.overrides',
]

/**
 * `workspace:` was always allowed here and `catalog:` was not, which was never a difference
 * in the protocols — pnpm rewrites both when it packs. The asymmetry was a guard against the
 * one package that did not pack with pnpm: `packages/utils` published with a bare
 * `npm publish`, and npm passes `catalog:` through verbatim (#1137, #551).
 *
 * That publish path now goes through publish-package.mjs like every other package, so the
 * guard has nothing left to protect and was rejecting the supported way to use a catalog.
 * `packedForbiddenProtocols` below still forbids `catalog:`, checked against the real
 * tarball — a strictly stronger assertion than reading the source manifest.
 */
export const sourceForbiddenProtocols = [
  'file:',
  'link:',
]

export const packedForbiddenProtocols = [
  'catalog:',
  'workspace:',
  'file:',
  'link:',
]
