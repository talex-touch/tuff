const fs = require('node:fs')
const path = require('node:path')

const projectRoot = path.join(__dirname, '..', '..')
const workspaceRoot = path.resolve(projectRoot, '..', '..')

const PACKAGED_RUNTIME_MODULES = [
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
]

function getPackagedRuntimeRootModules(requiredModules = PACKAGED_RUNTIME_MODULES) {
  return requiredModules.map((moduleSpec) =>
    typeof moduleSpec === 'string' ? moduleSpec : moduleSpec.name
  )
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

function resolveRuntimeModuleDir(moduleName) {
  const directCandidates = [
    path.join(projectRoot, 'node_modules', moduleName),
    path.join(workspaceRoot, 'node_modules', moduleName)
  ]

  for (const candidate of directCandidates) {
    if (fs.existsSync(path.join(candidate, 'package.json'))) {
      return candidate
    }
  }

  try {
    const pkgPath = require.resolve(path.posix.join(moduleName, 'package.json'), {
      paths: [projectRoot, workspaceRoot]
    })
    return path.dirname(pkgPath)
  } catch (error) {
    try {
      const resolvedEntry = require.resolve(moduleName, {
        paths: [projectRoot, workspaceRoot]
      })
      let currentDir = path.dirname(resolvedEntry)
      while (currentDir !== path.dirname(currentDir)) {
        const pkgJsonPath = path.join(currentDir, 'package.json')
        if (fs.existsSync(pkgJsonPath)) {
          const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'))
          if (pkgJson.name === moduleName) {
            return currentDir
          }
        }
        currentDir = path.dirname(currentDir)
      }
    } catch (fallbackError) {
      throw new Error(`Cannot resolve runtime module ${moduleName}: ${fallbackError.message}`)
    }

    throw new Error(`Cannot resolve runtime module ${moduleName}: ${error.message}`)
  }
}

function collectModuleClosure(rootModuleNames) {
  const queue = [...rootModuleNames]
  const seen = new Set()
  const orderedModules = []

  while (queue.length > 0) {
    const moduleName = queue.shift()
    if (!moduleName || seen.has(moduleName) || moduleName.startsWith('@types/')) {
      continue
    }

    seen.add(moduleName)
    orderedModules.push(moduleName)

    const moduleDir = resolveRuntimeModuleDir(moduleName)
    const pkgJson = JSON.parse(fs.readFileSync(path.join(moduleDir, 'package.json'), 'utf8'))
    const dependencies = {
      ...(pkgJson.dependencies || {}),
      ...(pkgJson.optionalDependencies || {})
    }

    Object.keys(dependencies).forEach((dependencyName) => {
      if (!dependencyName.startsWith('@types/')) {
        queue.push(dependencyName)
      }
    })
  }

  return orderedModules
}

function collectResourceModuleClosure(requiredModules = PACKAGED_RUNTIME_MODULES) {
  const resourceRoots = requiredModules
    .filter((moduleSpec) => typeof moduleSpec === 'object' && moduleSpec.location === 'resources')
    .map((moduleSpec) => moduleSpec.name)

  return collectModuleClosure(resourceRoots)
}

function collectPackagedRuntimeModuleClosure(requiredModules = PACKAGED_RUNTIME_MODULES) {
  return collectModuleClosure(getPackagedRuntimeRootModules(requiredModules))
}

function hasResourceEntrypoint(resourcesDir, moduleName) {
  const resourceModuleDir = path.join(resourcesDir, 'node_modules', moduleName)
  const resourceEntrypoints = [
    path.join(resourceModuleDir, 'package.json'),
    path.join(resourceModuleDir, 'index.js')
  ]

  return resourceEntrypoints.some((entryPath) => fs.existsSync(entryPath))
}

function copyModuleToResources(resourcesDir, moduleName) {
  const sourceDir = resolveRuntimeModuleDir(moduleName)
  const targetDir = path.join(resourcesDir, 'node_modules', moduleName)
  fs.mkdirSync(path.dirname(targetDir), { recursive: true })
  fs.rmSync(targetDir, { recursive: true, force: true })
  fs.cpSync(sourceDir, targetDir, { recursive: true, dereference: true })
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

  const resourceModules = collectResourceModuleClosure(requiredModules)
  if (resourceModules.length === 0) {
    return []
  }

  const resourceNodeModulesDir = path.join(resourcesDir, 'node_modules')
  fs.mkdirSync(resourceNodeModulesDir, { recursive: true })

  resourceModules.forEach((moduleName) => {
    copyModuleToResources(resourcesDir, moduleName)
  })

  console.log(
    `${logPrefix} Synced resources runtime module closure: ${resourceModules.length} modules`
  )

  return resourceModules
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
  const requiredRuntimeModules = collectPackagedRuntimeModuleClosure(requiredModules)
  const copiedModules = []

  requiredRuntimeModules.forEach((moduleName) => {
    const packagedEntry = path.posix.join('/node_modules', moduleName, 'package.json')
    if (packageEntries.has(packagedEntry) || hasResourceEntrypoint(resourcesDir, moduleName)) {
      return
    }

    copyModuleToResources(resourcesDir, moduleName)
    copiedModules.push(moduleName)
  })

  if (copiedModules.length > 0) {
    console.log(`${logPrefix} Synced missing packaged runtime modules: ${copiedModules.join(', ')}`)
  }

  return copiedModules
}

module.exports = {
  PACKAGED_RUNTIME_MODULES,
  collectModuleClosure,
  collectPackagedRuntimeModuleClosure,
  collectResourceModuleClosure,
  findPackagedResourcesDir,
  getPackagedRuntimeRootModules,
  resolveRuntimeModuleDir,
  syncMissingPackagedRuntimeModules,
  syncPackagedResourceModules
}
