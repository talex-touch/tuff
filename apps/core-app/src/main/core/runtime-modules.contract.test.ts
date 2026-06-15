import {
  chmodSync,
  cpSync,
  existsSync,
  symlinkSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const {
  collectAppRuntimeModuleClosure,
  collectResourceResolvableRuntimeModuleEntries,
  collectRuntimeModuleClosure,
  copyRuntimeModuleToNodeModules,
  resolvePlatformRuntimeModules,
  resolveRuntimeModuleTargetDir,
  getPlatformRuntimeRootModules,
  syncMissingPackagedRuntimeModules,
  verifyPackagedEsbuildBinaries
} = require('../../../scripts/build-target/runtime-modules.js')

const tempRoots: string[] = []

function createTempWorkspace() {
  const root = mkdtempSync(path.join(tmpdir(), 'tuff-runtime-modules-'))
  const projectRoot = path.join(root, 'apps/core-app')
  const workspaceNodeModules = path.join(root, 'node_modules')
  const targetNodeModules = path.join(projectRoot, 'node_modules')

  tempRoots.push(root)
  mkdirSync(projectRoot, { recursive: true })
  mkdirSync(workspaceNodeModules, { recursive: true })
  mkdirSync(targetNodeModules, { recursive: true })

  return {
    appPackageJsonPath: path.join(projectRoot, 'package.json'),
    projectRoot,
    root,
    targetNodeModules,
    workspaceNodeModules,
    workspaceRoot: root
  }
}

function writeJson(filePath: string, value: unknown) {
  mkdirSync(path.dirname(filePath), { recursive: true })
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

async function createPackage(baseDir: string, name: string, pkg: Record<string, unknown> = {}) {
  const packageDir = path.join(baseDir, ...name.split('/'))

  await mkdir(packageDir, { recursive: true })
  writeJson(path.join(packageDir, 'package.json'), {
    name,
    version: '1.0.0',
    ...pkg
  })
  writeFileSync(path.join(packageDir, 'index.js'), 'module.exports = {}\n')

  return packageDir
}

afterEach(() => {
  tempRoots.splice(0).forEach((root) => {
    rmSync(root, { force: true, recursive: true })
  })
})

describe('runtime module manifest contract', () => {
  it('resolves app runtime closure through hoisted and package-local transitive dependencies', async () => {
    const paths = createTempWorkspace()
    const appLocalModule = await createPackage(paths.targetNodeModules, 'app-local', {
      dependencies: {
        nested_runtime: '1.0.0',
        path: '1.0.0'
      }
    })

    await createPackage(paths.workspaceNodeModules, 'hoisted-runtime', {
      dependencies: {
        transitive_hoisted: '1.0.0'
      }
    })
    await createPackage(paths.workspaceNodeModules, 'transitive_hoisted')
    await createPackage(path.join(appLocalModule, 'node_modules'), 'nested_runtime')
    writeJson(paths.appPackageJsonPath, {
      dependencies: {
        'app-local': '1.0.0',
        'hoisted-runtime': '1.0.0'
      },
      optionalDependencies: {
        'missing-optional-runtime': '1.0.0'
      }
    })

    const closure = collectAppRuntimeModuleClosure({
      ...paths,
      logger: { warn: () => undefined },
      rootSourceDir: paths.projectRoot
    })
    const resolvedNames = closure.modules.map((entry: { name: string }) => entry.name)

    expect(resolvedNames).toEqual([
      'app-local',
      'nested_runtime',
      'hoisted-runtime',
      'transitive_hoisted'
    ])
    expect(closure.unresolvedOptionalModules).toEqual(['missing-optional-runtime'])
    expect(resolvedNames).not.toContain('path')
    expect(
      closure.modules.find((entry: { name: string }) => entry.name === 'nested_runtime')?.sourceDir
    ).toBe(path.join(appLocalModule, 'node_modules/nested_runtime'))
  })

  it('copies a hoisted runtime module into the app node_modules target path', async () => {
    const paths = createTempWorkspace()
    const hoistedModuleDir = await createPackage(
      paths.workspaceNodeModules,
      '@scope/hoisted-runtime'
    )
    const [moduleEntry] = collectRuntimeModuleClosure(['@scope/hoisted-runtime'], {
      ...paths,
      rootSourceDir: paths.projectRoot
    }).modules

    const copyResult = copyRuntimeModuleToNodeModules(moduleEntry, {
      ...paths,
      overwrite: false,
      preserveSourceNodeModulesPath: true
    })

    expect(moduleEntry.sourceDir).toBe(hoistedModuleDir)
    expect(copyResult.copied).toBe(true)
    expect(copyResult.relativeTarget).toBe('@scope/hoisted-runtime')
    expect(copyResult.targetDir).toBe(path.join(paths.targetNodeModules, '@scope/hoisted-runtime'))
  })

  it('uses the shared manifest roots for platform prepackaging instead of a script-local list', () => {
    const platformRuntime = resolvePlatformRuntimeModules('win', 'x64', {
      platformBaseModules: ['base-runtime'],
      platformModuleMap: {
        win32: {
          x64: ['native-runtime']
        }
      },
      requiredModules: ['packaged-runtime', { name: 'resource-runtime', location: 'resources' }]
    })

    expect(platformRuntime.platformKey).toBe('win32')
    expect(platformRuntime.rootModules).toEqual([
      'packaged-runtime',
      'resource-runtime',
      'base-runtime',
      'native-runtime'
    ])
  })

  it('keeps OpenAI Node shim dependencies in the packaged platform runtime closure', () => {
    const names = collectRuntimeModuleClosure(getPlatformRuntimeRootModules('mac', 'arm64'), {
      dedupeBy: 'name',
      dependencyTypes: ['dependencies', 'optionalDependencies', 'peerDependencies'],
      includeTargetNodeModules: false,
      logger: { warn: () => undefined },
      maxDepth: 20,
      missingDependencyStrategy: 'warn',
      skipDependency: (dependencyName: string) => dependencyName.startsWith('@talex-touch/')
    }).modules.map((entry: { name: string }) => entry.name)

    expect(names).toContain('@langchain/openai')
    expect(names).toContain('openai')
    expect(names).toContain('formdata-node')
    expect(names).toContain('form-data-encoder')
    expect(names).toContain('abort-controller')
    expect(names).toContain('agentkeepalive')
  })

  it('keeps esbuild and platform binaries in packaged runtime resources', () => {
    const resourceNames = collectResourceResolvableRuntimeModuleEntries([
      { name: 'esbuild', location: 'resources' }
    ]).map((entry: { name: string }) => entry.name)

    expect(resourceNames).toContain('esbuild')
    expect(resourceNames.some((name: string) => name.startsWith('@esbuild/'))).toBe(true)

    expect(resolvePlatformRuntimeModules('mac', 'arm64').rootModules).toContain(
      '@esbuild/darwin-arm64'
    )
    expect(resolvePlatformRuntimeModules('mac', 'x64').rootModules).toContain('@esbuild/darwin-x64')
    expect(resolvePlatformRuntimeModules('linux', 'x64').rootModules).toContain(
      '@esbuild/linux-x64'
    )
    expect(resolvePlatformRuntimeModules('linux', 'arm64').rootModules).toContain(
      '@esbuild/linux-arm64'
    )
    expect(resolvePlatformRuntimeModules('win', 'x64').rootModules).toContain('@esbuild/win32-x64')
    expect(resolvePlatformRuntimeModules('win', 'arm64').rootModules).toContain(
      '@esbuild/win32-arm64'
    )
  })

  it('skips unresolved optional platform packages in packaged runtime closure', async () => {
    const paths = createTempWorkspace()

    await createPackage(paths.workspaceNodeModules, 'runtime-root', {
      optionalDependencies: {
        'missing-platform-runtime': '1.0.0'
      }
    })

    const {
      collectPackagedRuntimeModuleEntries
    } = require('../../../scripts/build-target/runtime-modules.js')
    const entries = collectPackagedRuntimeModuleEntries(['runtime-root'], {
      ...paths,
      rootSourceDir: paths.projectRoot
    })

    expect(entries.map((entry: { name: string }) => entry.name)).toEqual(['runtime-root'])
  })

  it('fails fast when the target esbuild binary is missing from packaged resources', () => {
    const paths = createTempWorkspace()
    const resourcesDir = path.join(paths.root, 'dist/mac-arm64/tuff.app/Contents/Resources')
    mkdirSync(resourcesDir, { recursive: true })

    expect(() =>
      verifyPackagedEsbuildBinaries(paths.root, 'mac', 'arm64', {
        resourcesDir,
        logPrefix: '[test]'
      })
    ).toThrow(/@esbuild\/darwin-arm64\/bin\/esbuild/)
  })

  it('accepts the target esbuild binary only when the packaged file is executable', () => {
    const paths = createTempWorkspace()
    const resourcesDir = path.join(paths.root, 'dist/mac-arm64/tuff.app/Contents/Resources')
    const binaryPath = path.join(resourcesDir, 'node_modules/@esbuild/darwin-arm64/bin/esbuild')
    mkdirSync(path.dirname(binaryPath), { recursive: true })
    writeFileSync(binaryPath, '')

    expect(() =>
      verifyPackagedEsbuildBinaries(paths.root, 'mac', 'arm64', {
        resourcesDir,
        logPrefix: '[test]'
      })
    ).toThrow(/not executable/)

    chmodSync(binaryPath, 0o755)

    expect(
      verifyPackagedEsbuildBinaries(paths.root, 'mac', 'arm64', {
        resourcesDir,
        logPrefix: '[test]'
      })
    ).toEqual(['@esbuild/darwin-arm64'])
  })

  it('keeps promoted resource modules resolvable through resources node_modules', async () => {
    const paths = createTempWorkspace()

    await createPackage(paths.workspaceNodeModules, 'promoted-runtime', {
      dependencies: {
        'promoted-child': '1.0.0'
      },
      peerDependencies: {
        'required-peer': '1.0.0',
        'optional-peer': '1.0.0'
      },
      peerDependenciesMeta: {
        'optional-peer': {
          optional: true
        }
      }
    })
    await createPackage(paths.workspaceNodeModules, 'promoted-child', {
      peerDependencies: {
        'required-peer': '1.0.0'
      }
    })
    await createPackage(paths.workspaceNodeModules, 'required-peer')
    await createPackage(paths.workspaceNodeModules, 'optional-peer')

    const closure = collectResourceResolvableRuntimeModuleEntries(['promoted-runtime'], {
      ...paths,
      rootSourceDir: paths.projectRoot
    })
    const names = closure.map((entry: { name: string }) => entry.name)

    expect(names).toEqual(['promoted-runtime', 'promoted-child', 'required-peer'])
    expect(names).not.toContain('optional-peer')
  })

  it('resolves transitive dependencies from a symlinked pnpm package real path first', async () => {
    const paths = createTempWorkspace()
    const pnpmStore = path.join(paths.workspaceNodeModules, '.pnpm')
    const runtimeRootReal = await createPackage(
      path.join(pnpmStore, 'runtime-root@1.0.0/node_modules'),
      'runtime-root',
      {
        dependencies: {
          'versioned-child': '1.0.0'
        }
      }
    )

    await createPackage(
      path.join(pnpmStore, 'runtime-root@1.0.0/node_modules'),
      'versioned-child',
      {
        version: '1.0.0',
        dependencies: {
          'runtime-grandchild': '1.0.0'
        }
      }
    )
    await createPackage(
      path.join(pnpmStore, 'versioned-child@2.0.0/node_modules'),
      'versioned-child',
      {
        version: '2.0.0'
      }
    )
    await createPackage(paths.workspaceNodeModules, 'runtime-grandchild')

    symlinkSync(runtimeRootReal, path.join(paths.targetNodeModules, 'runtime-root'))
    symlinkSync(
      path.join(pnpmStore, 'versioned-child@2.0.0/node_modules/versioned-child'),
      path.join(paths.workspaceNodeModules, 'versioned-child')
    )

    const closure = collectResourceResolvableRuntimeModuleEntries(['runtime-root'], {
      ...paths,
      rootSourceDir: paths.projectRoot
    })
    const childEntry = closure.find((entry: { name: string }) => entry.name === 'versioned-child')

    expect(childEntry?.pkgJson.version).toBe('1.0.0')
    expect(closure.map((entry: { name: string }) => entry.name)).toEqual([
      'runtime-root',
      'versioned-child',
      'runtime-grandchild'
    ])
  })

  it('keeps traversing duplicate resource package instances before flattening by name', async () => {
    const paths = createTempWorkspace()
    const pnpmStore = path.join(paths.workspaceNodeModules, '.pnpm')

    const runtimeRootA = await createPackage(
      path.join(pnpmStore, 'runtime-root-a@1.0.0/node_modules'),
      'runtime-root-a',
      {
        dependencies: {
          'duplicate-child': '2.0.0'
        }
      }
    )
    const runtimeRootB = await createPackage(
      path.join(pnpmStore, 'runtime-root-b@1.0.0/node_modules'),
      'runtime-root-b',
      {
        dependencies: {
          'duplicate-child': '1.0.0'
        }
      }
    )

    await createPackage(
      path.join(pnpmStore, 'runtime-root-a@1.0.0/node_modules'),
      'duplicate-child',
      {
        version: '2.0.0'
      }
    )
    await createPackage(
      path.join(pnpmStore, 'runtime-root-b@1.0.0/node_modules'),
      'duplicate-child',
      {
        version: '1.0.0',
        dependencies: {
          'duplicate-grandchild': '1.0.0'
        }
      }
    )
    await createPackage(paths.workspaceNodeModules, 'duplicate-grandchild')

    symlinkSync(runtimeRootA, path.join(paths.targetNodeModules, 'runtime-root-a'))
    symlinkSync(runtimeRootB, path.join(paths.targetNodeModules, 'runtime-root-b'))

    const closure = collectResourceResolvableRuntimeModuleEntries(
      ['runtime-root-a', 'runtime-root-b'],
      {
        ...paths,
        rootSourceDir: paths.projectRoot
      }
    )
    const duplicateChildVersions = closure
      .filter((entry: { name: string }) => entry.name === 'duplicate-child')
      .map((entry: { pkgJson: { version: string } }) => entry.pkgJson.version)

    expect(duplicateChildVersions).toEqual(['2.0.0', '1.0.0'])
    expect(closure.map((entry: { name: string }) => entry.name)).toContain('duplicate-grandchild')
  })

  it('syncs dependencies for runtime modules that were promoted to resources node_modules', async () => {
    const paths = createTempWorkspace()
    const appOutDir = path.join(paths.root, 'dist/mac-arm64/tuff.app/Contents')
    const resourcesDir = path.join(appOutDir, 'Resources')
    const emptyAsarSource = path.join(paths.root, 'empty-asar')

    await createPackage(paths.workspaceNodeModules, 'runtime-root', {
      dependencies: {
        'promoted-runtime': '1.0.0'
      }
    })
    const promotedRuntime = await createPackage(paths.workspaceNodeModules, 'promoted-runtime', {
      dependencies: {
        'promoted-child': '1.0.0'
      },
      peerDependencies: {
        'required-peer': '1.0.0'
      }
    })
    await createPackage(paths.workspaceNodeModules, 'promoted-child')
    await createPackage(paths.workspaceNodeModules, 'required-peer')
    await mkdir(emptyAsarSource, { recursive: true })
    writeJson(path.join(emptyAsarSource, 'package.json'), { name: 'empty-app' })
    await mkdir(resourcesDir, { recursive: true })

    const { createPackage: createAsarPackage } = require('@electron/asar')
    await createAsarPackage(emptyAsarSource, path.join(resourcesDir, 'app.asar'))

    const promotedResourceDir = path.join(resourcesDir, 'node_modules/promoted-runtime')
    mkdirSync(path.dirname(promotedResourceDir), { recursive: true })
    cpSync(promotedRuntime, promotedResourceDir, { recursive: true })

    const copiedModules = syncMissingPackagedRuntimeModules(appOutDir, {
      ...paths,
      requiredModules: ['runtime-root']
    })

    expect(copiedModules).toEqual(['runtime-root', 'promoted-child', 'required-peer'])
    expect(existsSync(path.join(resourcesDir, 'node_modules/promoted-child/package.json'))).toBe(
      true
    )
    expect(existsSync(path.join(resourcesDir, 'node_modules/required-peer/package.json'))).toBe(
      true
    )
  })

  it('syncs missing platform runtime transitive dependencies after packaging', async () => {
    const paths = createTempWorkspace()
    const appOutDir = path.join(paths.root, 'dist/mac-arm64/tuff.app/Contents')
    const resourcesDir = path.join(appOutDir, 'Resources')
    const emptyAsarSource = path.join(paths.root, 'empty-asar')

    await createPackage(paths.workspaceNodeModules, 'runtime-root', {
      dependencies: {
        'openai-like': '1.0.0'
      }
    })
    await createPackage(paths.workspaceNodeModules, 'openai-like', {
      dependencies: {
        'formdata-node': '1.0.0',
        'form-data-encoder': '1.0.0',
        'abort-controller': '1.0.0',
        agentkeepalive: '1.0.0'
      }
    })
    await createPackage(paths.workspaceNodeModules, 'formdata-node')
    await createPackage(paths.workspaceNodeModules, 'form-data-encoder')
    await createPackage(paths.workspaceNodeModules, 'abort-controller')
    await createPackage(paths.workspaceNodeModules, 'agentkeepalive')
    await mkdir(emptyAsarSource, { recursive: true })
    writeJson(path.join(emptyAsarSource, 'package.json'), { name: 'empty-app' })
    await mkdir(resourcesDir, { recursive: true })

    const { createPackage: createAsarPackage } = require('@electron/asar')
    await createAsarPackage(emptyAsarSource, path.join(resourcesDir, 'app.asar'))

    const copiedModules = syncMissingPackagedRuntimeModules(appOutDir, {
      ...paths,
      requiredModules: ['runtime-root']
    })

    expect(copiedModules).toEqual([
      'runtime-root',
      'openai-like',
      'formdata-node',
      'form-data-encoder',
      'abort-controller',
      'agentkeepalive'
    ])
    expect(existsSync(path.join(resourcesDir, 'node_modules/formdata-node/package.json'))).toBe(
      true
    )
  })

  it('keeps explicit workspace root modules copyable while skipping workspace transitive dependencies', async () => {
    const paths = createTempWorkspace()
    const nativeRoot = await createPackage(paths.workspaceNodeModules, '@talex-touch/tuff-native', {
      dependencies: {
        '@talex-touch/utils': '1.0.0',
        'native-helper': '1.0.0'
      }
    })
    await createPackage(paths.workspaceNodeModules, '@talex-touch/utils')
    await createPackage(paths.workspaceNodeModules, 'native-helper')

    const closure = collectRuntimeModuleClosure(['@talex-touch/tuff-native'], {
      ...paths,
      rootSourceDir: paths.projectRoot,
      skipDependency: (dependencyName: string) => dependencyName.startsWith('@talex-touch/')
    })
    const names = closure.modules.map((entry: { name: string }) => entry.name)

    expect(names).toEqual(['@talex-touch/tuff-native', 'native-helper'])
    expect(closure.modules[0].sourceDir).toBe(nativeRoot)
    expect(
      resolveRuntimeModuleTargetDir(closure.modules[0].sourceDir, closure.modules[0].name, {
        ...paths,
        preserveSourceNodeModulesPath: false
      })
    ).toBe(path.join(paths.targetNodeModules, '@talex-touch/tuff-native'))
  })
})
