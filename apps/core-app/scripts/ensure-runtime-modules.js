const fs = require('node:fs')
const path = require('node:path')
const { builtinModules } = require('node:module')

const projectRoot = path.join(__dirname, '..')
const workspaceRoot = path.join(projectRoot, '..', '..')
const workspaceNodeModules = path.join(workspaceRoot, 'node_modules')
const targetNodeModules = path.join(projectRoot, 'node_modules')
const appPackageJsonPath = path.join(projectRoot, 'package.json')

const builtins = new Set(
  builtinModules.flatMap((name) => {
    const normalized = name.replace(/^node:/, '')
    return [name, normalized, `node:${normalized}`]
  })
)

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function isWorkspaceModule(moduleName) {
  return moduleName.startsWith('@talex-touch/')
}

function isBuiltinModule(moduleName) {
  return builtins.has(moduleName)
}

function isOptionalDependency(pkgJson, moduleName) {
  return Object.prototype.hasOwnProperty.call(pkgJson.optionalDependencies || {}, moduleName)
}

function isSubPath(parentDir, candidateDir) {
  const relative = path.relative(parentDir, candidateDir)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function tryResolvePackageRoot(candidatePath) {
  if (fs.existsSync(path.join(candidatePath, 'package.json'))) {
    return candidatePath
  }
  return null
}

function resolveModuleRoot(moduleName, sourceDir) {
  const directCandidates = []

  if (sourceDir) {
    directCandidates.push(path.join(sourceDir, 'node_modules', moduleName))
  }

  directCandidates.push(path.join(targetNodeModules, moduleName))
  directCandidates.push(path.join(workspaceNodeModules, moduleName))

  for (const candidate of directCandidates) {
    const resolved = tryResolvePackageRoot(candidate)
    if (resolved) {
      return resolved
    }
  }

  const resolutionPaths = []
  if (sourceDir) {
    resolutionPaths.push(sourceDir)
    resolutionPaths.push(path.join(sourceDir, 'node_modules'))
  }
  resolutionPaths.push(projectRoot, workspaceRoot, targetNodeModules, workspaceNodeModules)

  try {
    const pkgPath = require.resolve(path.join(moduleName, 'package.json'), {
      paths: resolutionPaths
    })
    return path.dirname(pkgPath)
  } catch {
    return null
  }
}

function resolveTargetModuleDir(sourceDir, moduleName) {
  if (isSubPath(targetNodeModules, sourceDir)) {
    return sourceDir
  }

  if (isSubPath(workspaceNodeModules, sourceDir)) {
    return path.join(targetNodeModules, path.relative(workspaceNodeModules, sourceDir))
  }

  const marker = `${path.sep}node_modules${path.sep}`
  const index = sourceDir.lastIndexOf(marker)
  if (index >= 0) {
    const suffix = sourceDir.slice(index + marker.length)
    return path.join(targetNodeModules, suffix)
  }

  return path.join(targetNodeModules, moduleName)
}

function copyModule(sourceDir, targetDir) {
  fs.mkdirSync(path.dirname(targetDir), { recursive: true })
  fs.cpSync(sourceDir, targetDir, {
    recursive: true,
    dereference: true
  })
}

function getRuntimeDependencyEntries(pkgJson) {
  return Object.entries({
    ...(pkgJson.dependencies || {}),
    ...(pkgJson.optionalDependencies || {})
  })
}

function getVisitKey(sourceDir, pkgJson) {
  let resolvedPath
  try {
    resolvedPath = fs.realpathSync.native(sourceDir)
  } catch {
    resolvedPath = sourceDir
  }

  return `${pkgJson.name || path.basename(sourceDir)}@${pkgJson.version || '0.0.0'}::${resolvedPath}`
}

function ensureRuntimeModules() {
  const appPkg = readJson(appPackageJsonPath)
  const visited = new Set()
  const copiedModules = new Set()
  const resolvedExternalModules = new Set()
  const unresolvedOptionalModules = new Set()

  function visitModule(moduleName, parentLabel = 'app', optional = false, depth = 0, sourceDir) {
    if (!moduleName) {
      return
    }
    if (depth > 64 || isBuiltinModule(moduleName) || moduleName.startsWith('@types/')) {
      return
    }

    const resolvedSourceDir = resolveModuleRoot(moduleName, sourceDir)
    if (!resolvedSourceDir) {
      if (optional) {
        unresolvedOptionalModules.add(moduleName)
        return
      }
      throw new Error(
        `[ensure-runtime-modules] Cannot resolve runtime dependency "${moduleName}" required by ${parentLabel}`
      )
    }

    const pkgJsonPath = path.join(resolvedSourceDir, 'package.json')
    if (!fs.existsSync(pkgJsonPath)) {
      if (optional) {
        unresolvedOptionalModules.add(moduleName)
        return
      }
      throw new Error(
        `[ensure-runtime-modules] package.json missing for runtime dependency "${moduleName}" required by ${parentLabel}`
      )
    }

    const pkgJson = readJson(pkgJsonPath)
    const visitKey = getVisitKey(resolvedSourceDir, pkgJson)
    if (visited.has(visitKey)) {
      return
    }
    visited.add(visitKey)

    if (!isWorkspaceModule(moduleName)) {
      resolvedExternalModules.add(moduleName)
      const targetDir = resolveTargetModuleDir(resolvedSourceDir, moduleName)
      if (!fs.existsSync(targetDir)) {
        copyModule(resolvedSourceDir, targetDir)
        const relativeTarget = path.relative(targetNodeModules, targetDir) || moduleName
        copiedModules.add(relativeTarget)
        console.log(`[ensure-runtime-modules] Copied runtime module: ${relativeTarget}`)
      }
    }

    const moduleLabel = pkgJson.name || moduleName
    for (const [depName] of getRuntimeDependencyEntries(pkgJson)) {
      visitModule(
        depName,
        moduleLabel,
        isOptionalDependency(pkgJson, depName),
        depth + 1,
        resolvedSourceDir
      )
    }
  }

  for (const [depName] of getRuntimeDependencyEntries(appPkg)) {
    visitModule(depName, 'app', isOptionalDependency(appPkg, depName), 0, projectRoot)
  }

  if (unresolvedOptionalModules.size > 0) {
    console.log(
      `[ensure-runtime-modules] Skipped unresolved optional runtime modules: ${Array.from(
        unresolvedOptionalModules
      )
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
