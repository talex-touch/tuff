const {
  collectRuntimeModuleClosure,
  copyRuntimeModuleToNodeModules,
  resolvePlatformRuntimeModules
} = require('./build-target/runtime-modules')

function ensurePlatformModules(targetPlatform, targetArch, options = {}) {
  const platformRuntime = resolvePlatformRuntimeModules(targetPlatform, targetArch, options)

  if (platformRuntime.hasPlatformModules && !platformRuntime.hasArchModules) {
    console.warn(
      `[ensure-modules] No platform modules defined for ${platformRuntime.platformKey}/${platformRuntime.archKey}`
    )
  }

  const closure = collectRuntimeModuleClosure(platformRuntime.rootModules, {
    logPrefix: '[ensure-modules]',
    ...options,
    dependencyTypes: options.dependencyTypes || [
      'dependencies',
      'optionalDependencies',
      'peerDependencies'
    ],
    dedupeBy: options.dedupeBy || 'name',
    includeTargetNodeModules: options.includeTargetNodeModules ?? false,
    maxDepth: options.maxDepth ?? 20,
    missingDependencyStrategy: options.missingDependencyStrategy || 'warn',
    skipDependency:
      options.skipDependency ||
      ((dependencyName) => {
        return dependencyName.startsWith('@talex-touch/')
      }),
    warnOnMaxDepth: options.warnOnMaxDepth ?? true
  })
  const copiedModules = new Set()

  closure.modules.forEach((moduleEntry) => {
    const copyResult = copyRuntimeModuleToNodeModules(moduleEntry, {
      ...options,
      overwrite: true,
      preserveSourceNodeModulesPath: false
    })

    if (copyResult.copied) {
      copiedModules.add(moduleEntry.name)
      console.log(`[ensure-modules] Copied ${moduleEntry.name}`)
    }
  })

  return {
    copiedModules: Array.from(copiedModules).sort(),
    resolvedModules: closure.modules.map((moduleEntry) => moduleEntry.name).sort(),
    unresolvedModules: closure.unresolvedModules,
    unresolvedOptionalModules: closure.unresolvedOptionalModules
  }
}

module.exports = ensurePlatformModules

if (require.main === module) {
  const target = process.env.BUILD_TARGET || process.platform
  const arch = process.env.BUILD_ARCH || process.arch
  ensurePlatformModules(target, arch)
}
