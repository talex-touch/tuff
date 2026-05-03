const fs = require('node:fs')
const path = require('node:path')
const { builtinModules } = require('node:module')

const defaultProjectRoot = path.join(__dirname, '..', '..')
const defaultWorkspaceRoot = path.resolve(defaultProjectRoot, '..', '..')

const builtins = new Set(
  builtinModules.flatMap((name) => {
    const normalized = name.replace(/^node:/, '')
    return [name, normalized, `node:${normalized}`]
  })
)

const RUNTIME_MODULE_MANIFEST = Object.freeze({
  packaged: [
    'ms',
    '@sentry/electron',
    'require-in-the-middle',
    '@langchain/core',
    'p-retry',
    { name: 'module-details-from-path', location: 'resources' },
    { name: '@cfworker/json-schema', location: 'resources' },
    { name: 'ansi-styles', location: 'resources' },
    { name: 'camelcase', location: 'resources' },
    { name: 'decamelize', location: 'resources' },
    { name: 'mustache', location: 'resources' },
    { name: 'retry', location: 'resources' },
    { name: '@vue/compiler-sfc', location: 'resources' },
    { name: 'langsmith', location: 'resources' },
    { name: 'compressing', location: 'resources' }
  ],
  platform: {
    base: [
      '@langchain/openai',
      '@langchain/anthropic',
      '@langchain/langgraph',
      '@libsql/client',
      '@libsql/core',
      '@libsql/hrana-client',
      '@libsql/isomorphic-fetch',
      '@libsql/isomorphic-ws',
      'libsql',
      '@neon-rs/load',
      'detect-libc',
      '@talex-touch/tuff-native'
    ],
    modules: {
      darwin: {
        arm64: ['@libsql/darwin-arm64'],
        x64: ['@libsql/darwin-x64']
      },
      linux: {
        x64: ['@libsql/linux-x64-gnu', '@libsql/linux-x64-musl'],
        arm64: ['@libsql/linux-arm64-gnu', '@libsql/linux-arm64-musl'],
        arm: ['@libsql/linux-arm-gnueabihf', '@libsql/linux-arm-musleabihf']
      },
      win32: {
        x64: ['@libsql/win32-x64-msvc']
      }
    }
  }
})

const PACKAGED_RUNTIME_MODULES = RUNTIME_MODULE_MANIFEST.packaged
const PLATFORM_RUNTIME_BASE_MODULES = RUNTIME_MODULE_MANIFEST.platform.base
const PLATFORM_RUNTIME_MODULE_MAP = RUNTIME_MODULE_MANIFEST.platform.modules

function createRuntimePaths(options = {}) {
  const projectRoot = path.resolve(options.projectRoot || defaultProjectRoot)
  const workspaceRoot = path.resolve(
    options.workspaceRoot ||
      (options.projectRoot ? path.join(projectRoot, '..', '..') : defaultWorkspaceRoot)
  )

  return {
    projectRoot,
    workspaceRoot,
    targetNodeModules: path.resolve(
      options.targetNodeModules || path.join(projectRoot, 'node_modules')
    ),
    workspaceNodeModules: path.resolve(
      options.workspaceNodeModules || path.join(workspaceRoot, 'node_modules')
    ),
    appPackageJsonPath: path.resolve(
      options.appPackageJsonPath || path.join(projectRoot, 'package.json')
    )
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function isWorkspaceModule(moduleName) {
  return moduleName.startsWith('@talex-touch/')
}

function isBuiltinModule(moduleName) {
  return builtins.has(moduleName)
}

function isSubPath(parentDir, candidateDir) {
  const relative = path.relative(parentDir, candidateDir)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function uniqueModuleNames(moduleNames) {
  const seen = new Set()
  return moduleNames.filter((moduleName) => {
    if (!moduleName || seen.has(moduleName)) {
      return false
    }
    seen.add(moduleName)
    return true
  })
}

function normalizeRuntimeModuleSpec(moduleSpec) {
  if (typeof moduleSpec === 'string') {
    return { name: moduleSpec }
  }
  return {
    ...moduleSpec,
    name: moduleSpec.name
  }
}

function getPackagedRuntimeRootModules(requiredModules = PACKAGED_RUNTIME_MODULES) {
  return requiredModules.map((moduleSpec) => normalizeRuntimeModuleSpec(moduleSpec).name)
}

function normalizePlatformKey(targetPlatform) {
  if (targetPlatform === 'mac') return 'darwin'
  if (targetPlatform === 'win') return 'win32'
  return targetPlatform || process.platform
}

function resolvePlatformRuntimeModules(targetPlatform, targetArch, options = {}) {
  const {
    requiredModules = PACKAGED_RUNTIME_MODULES,
    platformBaseModules = PLATFORM_RUNTIME_BASE_MODULES,
    platformModuleMap = PLATFORM_RUNTIME_MODULE_MAP
  } = options
  const platformKey = normalizePlatformKey(targetPlatform)
  const archKey = targetArch || (platformKey === 'darwin' ? 'arm64' : 'x64')
  const platformModules = platformModuleMap[platformKey]
  const archModules = platformModules?.[archKey] || []
  const rootModules = uniqueModuleNames([
    ...getPackagedRuntimeRootModules(requiredModules),
    ...platformBaseModules,
    ...archModules
  ])

  return {
    archKey,
    hasArchModules: archModules.length > 0,
    hasPlatformModules: Boolean(platformModules),
    platformKey,
    rootModules
  }
}

function getPlatformRuntimeRootModules(targetPlatform, targetArch, options = {}) {
  return resolvePlatformRuntimeModules(targetPlatform, targetArch, options).rootModules
}

function getRuntimeDependencyEntries(pkgJson, options = {}) {
  const {
    includeDependencies = true,
    includeOptionalDependencies = true,
    includePeerDependencies = false,
    treatPeerDependenciesAsOptional = true
  } = options
  const entries = new Map()

  const addEntries = (deps, kind, optional) => {
    Object.keys(deps || {}).forEach((name) => {
      if (!entries.has(name)) {
        entries.set(name, { kind, name, optional })
        return
      }

      if (optional) {
        entries.set(name, {
          ...entries.get(name),
          kind,
          optional: true
        })
      }
    })
  }

  if (includeDependencies) {
    addEntries(pkgJson.dependencies, 'dependencies', false)
  }
  if (includePeerDependencies) {
    addEntries(pkgJson.peerDependencies, 'peerDependencies', treatPeerDependenciesAsOptional)
  }
  if (includeOptionalDependencies) {
    addEntries(pkgJson.optionalDependencies, 'optionalDependencies', true)
  }

  return Array.from(entries.values())
}

function getAppRuntimeRootModules(options = {}) {
  const runtimePaths = createRuntimePaths(options)
  const appPkg = readJson(runtimePaths.appPackageJsonPath)

  return getRuntimeDependencyEntries(appPkg, {
    includeDependencies: true,
    includeOptionalDependencies: true,
    includePeerDependencies: false
  }).map((entry) => ({
    ...entry,
    parentLabel: 'app',
    sourceDir: runtimePaths.projectRoot
  }))
}

function tryResolvePackageRoot(candidatePath) {
  if (fs.existsSync(path.join(candidatePath, 'package.json'))) {
    return candidatePath
  }
  return null
}

function getResolutionPaths(runtimePaths, sourceDir) {
  return uniqueModuleNames(
    [
      sourceDir,
      sourceDir && path.join(sourceDir, 'node_modules'),
      runtimePaths.projectRoot,
      runtimePaths.workspaceRoot,
      runtimePaths.targetNodeModules,
      runtimePaths.workspaceNodeModules,
      path.join(runtimePaths.workspaceNodeModules, '.pnpm')
    ].filter(Boolean)
  )
}

function findPackageRootFromEntry(entryPath, moduleName) {
  let currentDir = path.dirname(entryPath)

  while (currentDir !== path.dirname(currentDir)) {
    const pkgJsonPath = path.join(currentDir, 'package.json')
    if (fs.existsSync(pkgJsonPath)) {
      const pkgJson = readJson(pkgJsonPath)
      if (!moduleName || pkgJson.name === moduleName) {
        return currentDir
      }
    }
    currentDir = path.dirname(currentDir)
  }

  return null
}

function resolveRuntimeModuleRoot(moduleName, runtimePaths, sourceDir, options = {}) {
  if (!moduleName || isBuiltinModule(moduleName)) {
    return null
  }

  const directCandidates = []
  if (sourceDir) {
    const sourceNodeModulesCandidate = path.join(sourceDir, 'node_modules', moduleName)
    if (
      options.includeTargetNodeModules !== false ||
      !isSubPath(runtimePaths.targetNodeModules, sourceNodeModulesCandidate)
    ) {
      directCandidates.push(sourceNodeModulesCandidate)
    }
  }
  directCandidates.push(path.join(runtimePaths.workspaceNodeModules, moduleName))
  directCandidates.push(
    path.join(runtimePaths.workspaceNodeModules, '.pnpm', 'node_modules', moduleName)
  )
  if (options.includeTargetNodeModules !== false) {
    directCandidates.push(path.join(runtimePaths.targetNodeModules, moduleName))
  }

  for (const candidate of directCandidates) {
    const resolved = tryResolvePackageRoot(candidate)
    if (resolved) {
      return resolved
    }
  }

  const resolutionPaths = getResolutionPaths(runtimePaths, sourceDir)
  try {
    const pkgPath = require.resolve(`${moduleName}/package.json`, {
      paths: resolutionPaths
    })
    return path.dirname(pkgPath)
  } catch {
    try {
      const resolvedEntry = require.resolve(moduleName, {
        paths: resolutionPaths
      })
      const packageRoot = findPackageRootFromEntry(resolvedEntry, moduleName)
      if (packageRoot) {
        return packageRoot
      }
    } catch {
      return null
    }

    return null
  }
}

function resolveRuntimeModuleDir(moduleName, options = {}) {
  const runtimePaths = createRuntimePaths(options)
  const resolved = resolveRuntimeModuleRoot(moduleName, runtimePaths, options.sourceDir, options)

  if (resolved) {
    return resolved
  }

  throw new Error(`Cannot resolve runtime module ${moduleName}`)
}

function getRuntimeModuleVisitKey(moduleName, sourceDir, pkgJson, dedupeBy) {
  if (dedupeBy === 'package') {
    let resolvedPath
    try {
      resolvedPath = fs.realpathSync.native(sourceDir)
    } catch {
      resolvedPath = sourceDir
    }

    return `${pkgJson.name || moduleName}@${pkgJson.version || '0.0.0'}::${resolvedPath}`
  }

  return moduleName
}

function resolveRuntimeModuleTargetDir(sourceDir, moduleName, options = {}) {
  const runtimePaths = createRuntimePaths(options)
  const preserveSourceNodeModulesPath = options.preserveSourceNodeModulesPath !== false

  if (!preserveSourceNodeModulesPath) {
    return path.join(runtimePaths.targetNodeModules, moduleName)
  }

  if (isSubPath(runtimePaths.targetNodeModules, sourceDir)) {
    return sourceDir
  }

  if (isSubPath(runtimePaths.workspaceNodeModules, sourceDir)) {
    return path.join(
      runtimePaths.targetNodeModules,
      path.relative(runtimePaths.workspaceNodeModules, sourceDir)
    )
  }

  const marker = `${path.sep}node_modules${path.sep}`
  const index = sourceDir.lastIndexOf(marker)
  if (index >= 0) {
    const suffix = sourceDir.slice(index + marker.length)
    return path.join(runtimePaths.targetNodeModules, suffix)
  }

  return path.join(runtimePaths.targetNodeModules, moduleName)
}

function createMissingDependencyError(moduleName, parentLabel, logPrefix, reason) {
  const suffix = reason ? ` (${reason})` : ''
  return new Error(
    `${logPrefix} Cannot resolve runtime dependency "${moduleName}" required by ${parentLabel}${suffix}`
  )
}

function handleMissingDependency(state, moduleName, parentLabel, optional, reason) {
  const { logPrefix, logger, missingDependencyStrategy } = state
  const shouldSkip =
    missingDependencyStrategy === 'skip' ||
    missingDependencyStrategy === 'warn' ||
    (missingDependencyStrategy === 'skip-optional' && optional)

  if (!shouldSkip) {
    throw createMissingDependencyError(moduleName, parentLabel, logPrefix, reason)
  }

  if (optional) {
    state.unresolvedOptionalModules.add(moduleName)
  } else {
    state.unresolvedModules.add(moduleName)
  }

  if (missingDependencyStrategy === 'warn') {
    const suffix = reason ? ` (${reason})` : ''
    logger.warn(`${logPrefix} Cannot resolve ${moduleName} required by ${parentLabel}${suffix}`)
  }
}

function collectRuntimeModuleClosure(rootModules, options = {}) {
  const runtimePaths = createRuntimePaths(options)
  const dependencyTypes = new Set(
    options.dependencyTypes || ['dependencies', 'optionalDependencies']
  )
  const logger = options.logger || console
  const state = {
    logPrefix: options.logPrefix || '[runtime-modules]',
    logger,
    missingDependencyStrategy: options.missingDependencyStrategy || 'throw',
    modules: [],
    unresolvedModules: new Set(),
    unresolvedOptionalModules: new Set(),
    visited: new Set()
  }
  const maxDepth = options.maxDepth ?? 64
  const dedupeBy = options.dedupeBy || 'name'

  const visitModule = (moduleSpec, parentLabel = 'app', depth = 0, sourceDir) => {
    const normalizedSpec = normalizeRuntimeModuleSpec(moduleSpec)
    const moduleName = normalizedSpec.name
    const optional = Boolean(normalizedSpec.optional)

    if (!moduleName || isBuiltinModule(moduleName) || moduleName.startsWith('@types/')) {
      return
    }

    if (depth > maxDepth) {
      if (options.warnOnMaxDepth) {
        logger.warn(`${state.logPrefix} Max recursion depth reached for ${moduleName}`)
      }
      return
    }

    const resolvedSourceDir = resolveRuntimeModuleRoot(moduleName, runtimePaths, sourceDir, options)
    if (!resolvedSourceDir) {
      handleMissingDependency(state, moduleName, parentLabel, optional)
      return
    }

    const pkgJsonPath = path.join(resolvedSourceDir, 'package.json')
    if (!fs.existsSync(pkgJsonPath)) {
      handleMissingDependency(state, moduleName, parentLabel, optional, 'package.json missing')
      return
    }

    const pkgJson = readJson(pkgJsonPath)
    const visitKey = getRuntimeModuleVisitKey(moduleName, resolvedSourceDir, pkgJson, dedupeBy)
    if (state.visited.has(visitKey)) {
      return
    }
    state.visited.add(visitKey)

    const entry = {
      depth,
      isWorkspace: isWorkspaceModule(moduleName),
      name: moduleName,
      optional,
      parentLabel,
      pkgJson,
      sourceDir: resolvedSourceDir,
      targetDir: resolveRuntimeModuleTargetDir(resolvedSourceDir, moduleName, {
        ...runtimePaths,
        preserveSourceNodeModulesPath: options.preserveSourceNodeModulesPath
      }),
      targetRelativePath:
        path.relative(
          runtimePaths.targetNodeModules,
          resolveRuntimeModuleTargetDir(resolvedSourceDir, moduleName, {
            ...runtimePaths,
            preserveSourceNodeModulesPath: options.preserveSourceNodeModulesPath
          })
        ) || moduleName
    }
    state.modules.push(entry)

    const moduleLabel = pkgJson.name || moduleName
    const dependencyEntries = getRuntimeDependencyEntries(pkgJson, {
      includeDependencies: dependencyTypes.has('dependencies'),
      includeOptionalDependencies: dependencyTypes.has('optionalDependencies'),
      includePeerDependencies: dependencyTypes.has('peerDependencies')
    })

    dependencyEntries.forEach((dependencyEntry) => {
      if (options.skipDependency?.(dependencyEntry.name, entry)) {
        return
      }
      visitModule(dependencyEntry, moduleLabel, depth + 1, resolvedSourceDir)
    })
  }

  rootModules.forEach((moduleSpec) => {
    const normalizedSpec = normalizeRuntimeModuleSpec(moduleSpec)
    visitModule(
      normalizedSpec,
      normalizedSpec.parentLabel || 'app',
      0,
      normalizedSpec.sourceDir || options.rootSourceDir || runtimePaths.projectRoot
    )
  })

  return {
    modules: state.modules,
    unresolvedModules: Array.from(new Set(state.unresolvedModules)).sort(),
    unresolvedOptionalModules: Array.from(state.unresolvedOptionalModules).sort()
  }
}

function collectAppRuntimeModuleClosure(options = {}) {
  return collectRuntimeModuleClosure(getAppRuntimeRootModules(options), {
    ...options,
    dependencyTypes: options.dependencyTypes || ['dependencies', 'optionalDependencies'],
    dedupeBy: options.dedupeBy || 'package',
    missingDependencyStrategy: options.missingDependencyStrategy || 'skip-optional'
  })
}

function collectModuleClosure(rootModuleNames, options = {}) {
  return collectRuntimeModuleClosure(rootModuleNames, {
    ...options,
    dependencyTypes: options.dependencyTypes || ['dependencies', 'optionalDependencies'],
    dedupeBy: options.dedupeBy || 'name',
    missingDependencyStrategy: options.missingDependencyStrategy || 'throw'
  }).modules.map((entry) => entry.name)
}

function collectResourceRuntimeModuleEntries(
  requiredModules = PACKAGED_RUNTIME_MODULES,
  options = {}
) {
  const resourceRoots = requiredModules
    .map((moduleSpec) => normalizeRuntimeModuleSpec(moduleSpec))
    .filter((moduleSpec) => moduleSpec.location === 'resources')

  return collectRuntimeModuleClosure(resourceRoots, {
    ...options,
    dependencyTypes: options.dependencyTypes || ['dependencies', 'optionalDependencies'],
    dedupeBy: options.dedupeBy || 'name',
    missingDependencyStrategy: options.missingDependencyStrategy || 'throw'
  }).modules
}

function collectResourceModuleClosure(requiredModules = PACKAGED_RUNTIME_MODULES, options = {}) {
  return collectResourceRuntimeModuleEntries(requiredModules, options).map((entry) => entry.name)
}

function collectPackagedRuntimeModuleEntries(
  requiredModules = PACKAGED_RUNTIME_MODULES,
  options = {}
) {
  return collectRuntimeModuleClosure(getPackagedRuntimeRootModules(requiredModules), {
    ...options,
    dependencyTypes: options.dependencyTypes || ['dependencies', 'optionalDependencies'],
    dedupeBy: options.dedupeBy || 'name',
    missingDependencyStrategy: options.missingDependencyStrategy || 'throw'
  }).modules
}

function collectPackagedRuntimeModuleClosure(
  requiredModules = PACKAGED_RUNTIME_MODULES,
  options = {}
) {
  return collectPackagedRuntimeModuleEntries(requiredModules, options).map((entry) => entry.name)
}

function findFileRecursive(rootDir, fileName, maxDepth = 6, depth = 0) {
  if (!rootDir || !fs.existsSync(rootDir) || depth > maxDepth) {
    return null
  }

  const entries = fs.readdirSync(rootDir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name)
    if (entry.isFile() && entry.name === fileName) {
      return fullPath
    }
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const nestedPath = findFileRecursive(
      path.join(rootDir, entry.name),
      fileName,
      maxDepth,
      depth + 1
    )
    if (nestedPath) {
      return nestedPath
    }
  }

  return null
}

function findPackagedResourcesDir(searchRoot, logPrefix = '[runtime-modules]') {
  const asarPath = findFileRecursive(searchRoot, 'app.asar')
  if (!asarPath) {
    console.warn(
      `${logPrefix} app.asar not found under ${searchRoot}, skip runtime dependency handling`
    )
    return null
  }

  return path.dirname(asarPath)
}

function copyRuntimeModuleToNodeModules(moduleEntry, options = {}) {
  const runtimePaths = createRuntimePaths(options)
  const sourceDir = moduleEntry.sourceDir || resolveRuntimeModuleDir(moduleEntry.name, options)
  const targetDir =
    options.targetDir ||
    resolveRuntimeModuleTargetDir(sourceDir, moduleEntry.name, {
      ...runtimePaths,
      preserveSourceNodeModulesPath: options.preserveSourceNodeModulesPath
    })

  fs.mkdirSync(path.dirname(targetDir), { recursive: true })
  if (path.resolve(sourceDir) === path.resolve(targetDir)) {
    return {
      copied: false,
      relativeTarget: path.relative(runtimePaths.targetNodeModules, targetDir) || moduleEntry.name,
      sourceDir,
      targetDir
    }
  }

  if (!options.overwrite && fs.existsSync(targetDir)) {
    let sourceRealPath = sourceDir
    let targetRealPath = targetDir
    try {
      sourceRealPath = fs.realpathSync.native(sourceDir)
      targetRealPath = fs.realpathSync.native(targetDir)
    } catch {
      sourceRealPath = sourceDir
      targetRealPath = targetDir
    }

    if (sourceRealPath === targetRealPath) {
      return {
        copied: false,
        relativeTarget:
          path.relative(runtimePaths.targetNodeModules, targetDir) || moduleEntry.name,
        sourceDir,
        targetDir
      }
    }
  }

  if (fs.existsSync(targetDir)) {
    if (!options.overwrite) {
      return {
        copied: false,
        relativeTarget:
          path.relative(runtimePaths.targetNodeModules, targetDir) || moduleEntry.name,
        sourceDir,
        targetDir
      }
    }
    fs.rmSync(targetDir, { recursive: true, force: true })
  }

  fs.cpSync(sourceDir, targetDir, {
    recursive: true,
    dereference: true
  })

  return {
    copied: true,
    relativeTarget: path.relative(runtimePaths.targetNodeModules, targetDir) || moduleEntry.name,
    sourceDir,
    targetDir
  }
}

function hasResourceEntrypoint(resourcesDir, moduleName) {
  const resourceModuleDir = path.join(resourcesDir, 'node_modules', moduleName)
  const resourceEntrypoints = [
    path.join(resourceModuleDir, 'package.json'),
    path.join(resourceModuleDir, 'index.js')
  ]

  return resourceEntrypoints.some((entryPath) => fs.existsSync(entryPath))
}

function copyModuleToResources(resourcesDir, moduleEntry, options = {}) {
  const normalizedEntry =
    typeof moduleEntry === 'string'
      ? { name: moduleEntry, sourceDir: resolveRuntimeModuleDir(moduleEntry, options) }
      : moduleEntry
  const targetDir = path.join(resourcesDir, 'node_modules', normalizedEntry.name)

  fs.mkdirSync(path.dirname(targetDir), { recursive: true })
  fs.rmSync(targetDir, { recursive: true, force: true })
  fs.cpSync(normalizedEntry.sourceDir, targetDir, { recursive: true, dereference: true })
}

function syncPackagedResourceModules(searchRoot, options = {}) {
  const { requiredModules = PACKAGED_RUNTIME_MODULES, logPrefix = '[runtime-modules]' } = options

  if (!Array.isArray(requiredModules) || requiredModules.length === 0) {
    return []
  }

  const resourcesDir = findPackagedResourcesDir(searchRoot, logPrefix)
  if (!resourcesDir) {
    return []
  }

  const resourceModuleEntries = collectResourceRuntimeModuleEntries(requiredModules, options)
  if (resourceModuleEntries.length === 0) {
    return []
  }

  const resourceNodeModulesDir = path.join(resourcesDir, 'node_modules')
  fs.mkdirSync(resourceNodeModulesDir, { recursive: true })

  resourceModuleEntries.forEach((moduleEntry) => {
    copyModuleToResources(resourcesDir, moduleEntry, options)
  })

  console.log(
    `${logPrefix} Synced resources runtime module closure: ${resourceModuleEntries.length} modules`
  )

  return resourceModuleEntries.map((entry) => entry.name)
}

function syncMissingPackagedRuntimeModules(searchRoot, options = {}) {
  const { requiredModules = PACKAGED_RUNTIME_MODULES, logPrefix = '[runtime-modules]' } = options

  if (!Array.isArray(requiredModules) || requiredModules.length === 0) {
    return []
  }

  const resourcesDir = findPackagedResourcesDir(searchRoot, logPrefix)
  if (!resourcesDir) {
    return []
  }

  const asarPath = path.join(resourcesDir, 'app.asar')
  if (!fs.existsSync(asarPath)) {
    console.warn(`${logPrefix} ${asarPath} not found, skip missing runtime dependency sync`)
    return []
  }

  const { listPackage } = require('@electron/asar')
  const packageEntries = new Set(listPackage(asarPath).map((entry) => entry.replace(/\\/g, '/')))
  const requiredRuntimeModuleEntries = collectPackagedRuntimeModuleEntries(requiredModules, options)
  const copiedModules = []

  requiredRuntimeModuleEntries.forEach((moduleEntry) => {
    const packagedEntry = path.posix.join('/node_modules', moduleEntry.name, 'package.json')
    if (
      packageEntries.has(packagedEntry) ||
      hasResourceEntrypoint(resourcesDir, moduleEntry.name)
    ) {
      return
    }

    copyModuleToResources(resourcesDir, moduleEntry, options)
    copiedModules.push(moduleEntry.name)
  })

  if (copiedModules.length > 0) {
    console.log(`${logPrefix} Synced missing packaged runtime modules: ${copiedModules.join(', ')}`)
  }

  return copiedModules
}

module.exports = {
  PACKAGED_RUNTIME_MODULES,
  PLATFORM_RUNTIME_BASE_MODULES,
  PLATFORM_RUNTIME_MODULE_MAP,
  RUNTIME_MODULE_MANIFEST,
  collectAppRuntimeModuleClosure,
  collectModuleClosure,
  collectPackagedRuntimeModuleClosure,
  collectPackagedRuntimeModuleEntries,
  collectResourceModuleClosure,
  collectResourceRuntimeModuleEntries,
  collectRuntimeModuleClosure,
  copyModuleToResources,
  copyRuntimeModuleToNodeModules,
  createRuntimePaths,
  findPackagedResourcesDir,
  getAppRuntimeRootModules,
  getPackagedRuntimeRootModules,
  getPlatformRuntimeRootModules,
  getRuntimeDependencyEntries,
  hasResourceEntrypoint,
  isBuiltinModule,
  isWorkspaceModule,
  resolvePlatformRuntimeModules,
  resolveRuntimeModuleDir,
  resolveRuntimeModuleTargetDir,
  syncMissingPackagedRuntimeModules,
  syncPackagedResourceModules
}
