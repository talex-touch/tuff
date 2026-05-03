import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const {
  collectAppRuntimeModuleClosure,
  collectRuntimeModuleClosure,
  copyRuntimeModuleToNodeModules,
  resolvePlatformRuntimeModules,
  resolveRuntimeModuleTargetDir
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
