import { readFileSync } from 'node:fs'
import Module from 'node:module'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

type GlobalOverrides = Record<string, unknown>

interface NodeModuleCtor {
  new (id?: string): {
    filename: string
    paths: string[]
    exports: unknown
    _compile: (code: string, filename: string) => void
  }
  _nodeModulePaths: (from: string) => string[]
}

const ModuleCtor = Module as unknown as NodeModuleCtor

function withGlobalOverrides<T>(overrides: GlobalOverrides | undefined, task: () => T): T {
  if (!overrides || Object.keys(overrides).length === 0) {
    return task()
  }

  const previous = new Map<string, { existed: boolean, value: unknown }>()

  for (const [key, value] of Object.entries(overrides)) {
    const existed = Object.prototype.hasOwnProperty.call(globalThis, key)
    previous.set(key, { existed, value: (globalThis as Record<string, unknown>)[key] })
    ;(globalThis as Record<string, unknown>)[key] = value
  }

  try {
    return task()
  }
  finally {
    for (const [key, snapshot] of previous.entries()) {
      if (!snapshot.existed) {
        delete (globalThis as Record<string, unknown>)[key]
        continue
      }

      ;(globalThis as Record<string, unknown>)[key] = snapshot.value
    }
  }
}

function compileCommonJsModule<T>(filename: string): T {
  const source = readFileSync(filename, 'utf8')
  const mod = new ModuleCtor(filename)
  mod.filename = filename
  mod.paths = ModuleCtor._nodeModulePaths(dirname(filename))
  mod._compile(source, filename)
  return mod.exports as T
}

export function loadPluginModule<T = any>(url: URL, overrides?: GlobalOverrides): T {
  return withGlobalOverrides(overrides, () => {
    const filename = fileURLToPath(url)
    return compileCommonJsModule<T>(filename)
  })
}

export function createPluginGlobals(overrides: GlobalOverrides = {}): GlobalOverrides {
  return {
    plugin: {
      feature: {
        clearItems() {},
        pushItems() {},
      },
      storage: {
        async getFile() {
          return null
        },
        async setFile() {},
      },
      box: {
        hide() {},
      },
    },
    logger: {
      error() {},
      warn() {},
      info() {},
      log() {},
    },
    ...overrides,
  }
}
