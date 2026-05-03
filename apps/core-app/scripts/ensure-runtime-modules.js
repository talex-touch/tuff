const {
  collectAppRuntimeModuleClosure,
  copyRuntimeModuleToNodeModules
} = require('./build-target/runtime-modules')

function ensureRuntimeModules(options = {}) {
  const closure = collectAppRuntimeModuleClosure({
    logPrefix: '[ensure-runtime-modules]',
    ...options
  })
  const copiedModules = new Set()
  const resolvedExternalModules = new Set()

  closure.modules.forEach((moduleEntry) => {
    if (moduleEntry.isWorkspace) {
      return
    }

    resolvedExternalModules.add(moduleEntry.name)
    const copyResult = copyRuntimeModuleToNodeModules(moduleEntry, {
      ...options,
      overwrite: false,
      preserveSourceNodeModulesPath: true
    })

    if (copyResult.copied) {
      copiedModules.add(copyResult.relativeTarget)
      console.log(`[ensure-runtime-modules] Copied runtime module: ${copyResult.relativeTarget}`)
    }
  })

  if (closure.unresolvedOptionalModules.length > 0) {
    console.log(
      `[ensure-runtime-modules] Skipped unresolved optional runtime modules: ${closure.unresolvedOptionalModules
        .sort()
        .join(', ')}`
    )
  }

  console.log(
    `[ensure-runtime-modules] Runtime dependency sync complete: copied=${copiedModules.size}, resolved=${resolvedExternalModules.size}`
  )

  return {
    copiedModules: Array.from(copiedModules).sort(),
    resolvedModules: Array.from(resolvedExternalModules).sort()
  }
}

module.exports = ensureRuntimeModules

if (require.main === module) {
  ensureRuntimeModules()
}
