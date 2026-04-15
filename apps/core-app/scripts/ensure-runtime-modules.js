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

function resolveModuleRoot(moduleName) {
  const directCandidates = [
    path.join(targetNodeModules, moduleName),
    path.join(workspaceNodeModules, moduleName)
  ]

  for (const candidate of directCandidates) {
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }

  try {
    const pkgPath = require.resolve(path.join(moduleName, 'package.json'), {
      paths: [projectRoot, workspaceRoot, targetNodeModules, workspaceNodeModules]
    })
    return path.dirname(pkgPath)
  } catch {
    return null
  }
}

function copyModule(sourceDir, targetDir) {
  fs.mkdirSync(path.dirname(targetDir), { recursive: true })
  fs.cpSync(sourceDir, targetDir, {
    recursive: true,
    dereference: true,
    filter: (src) => {
      if (src === sourceDir) {
        return true
      }
      const relative = path.relative(sourceDir, src)
      return !relative.split(path.sep).includes('node_modules')
    }
  })
}

function getRuntimeDependencyEntries(pkgJson) {
  return Object.entries({
    ...(pkgJson.dependencies || {}),
    ...(pkgJson.optionalDependencies || {})
  })
}

function ensureRuntimeModules() {
  const appPkg = readJson(appPackageJsonPath)
  const visited = new Set()
  const copiedModules = new Set()
  const resolvedExternalModules = new Set()
  const unresolvedOptionalModules = new Set()

  function visitModule(moduleName, parentLabel = 'app', optional = false, depth = 0) {
    if (!moduleName || visited.has(moduleName)) {
      return
    }
    if (depth > 64 || isBuiltinModule(moduleName) || moduleName.startsWith('@types/')) {
      return
    }

    visited.add(moduleName)

    const sourceDir = resolveModuleRoot(moduleName)
    if (!sourceDir) {
      if (optional) {
        unresolvedOptionalModules.add(moduleName)
        return
      }
      throw new Error(
        `[ensure-runtime-modules] Cannot resolve runtime dependency "${moduleName}" required by ${parentLabel}`
      )
    }

    const pkgJsonPath = path.join(sourceDir, 'package.json')
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

    if (!isWorkspaceModule(moduleName)) {
      resolvedExternalModules.add(moduleName)
      const targetDir = path.join(targetNodeModules, moduleName)
      if (!fs.existsSync(targetDir)) {
        copyModule(sourceDir, targetDir)
        copiedModules.add(moduleName)
        console.log(`[ensure-runtime-modules] Copied hoisted runtime module: ${moduleName}`)
      }
    }

    for (const [depName] of getRuntimeDependencyEntries(pkgJson)) {
      visitModule(depName, moduleName, isOptionalDependency(pkgJson, depName), depth + 1)
    }
  }

  for (const [depName] of getRuntimeDependencyEntries(appPkg)) {
    visitModule(depName, 'app', isOptionalDependency(appPkg, depName))
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
