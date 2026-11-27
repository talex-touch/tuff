import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  buildReactRuntimeVirtualModule,
  buildWcRuntimeVirtualModule,
  nexusFrameworkRuntimePlugin,
  probeFrameworkRuntimes,
  VIRTUAL_TUFFEX_REACT_RUNTIME_ID,
  VIRTUAL_TUFFEX_WC_RUNTIME_ID,
} from './nexus-framework-runtime-plugin'

describe('nexus-framework-runtime-plugin', () => {
  it('emits graceful unavailable virtual modules when packages are not linked', () => {
    const wcCode = buildWcRuntimeVirtualModule({
      wcAvailable: false,
      wcEntry: null,
      wcStyleEntry: null,
    })
    expect(wcCode).toContain('export const available = false')
    expect(wcCode).toContain('loadTuffexWcRuntime')

    const reactCode = buildReactRuntimeVirtualModule({
      reactAvailable: false,
      reactEntry: null,
      reactStyleEntry: null,
      reactLibEntry: null,
      reactDomClientEntry: null,
    })
    expect(reactCode).toContain('export const available = false')
    expect(reactCode).toContain('loadTuffexReactRuntime')
  })

  it('emits lazy dynamic loaders when workspace packages are linked', () => {
    const wcCode = buildWcRuntimeVirtualModule({
      wcAvailable: true,
      wcEntry: '@talex-touch/tuffex-wc',
      wcStyleEntry: '@talex-touch/tuffex-wc/style.css',
    })
    expect(wcCode).toContain('export const available = true')
    expect(wcCode).toContain('import("@talex-touch/tuffex-wc")')
    expect(wcCode).toContain('import("@talex-touch/tuffex-wc/style.css")')
    expect(wcCode).toContain('registerTuffexElements')

    const reactCode = buildReactRuntimeVirtualModule({
      reactAvailable: true,
      reactEntry: '@talex-touch/tuffex-react',
      reactStyleEntry: '@talex-touch/tuffex-react/style.css',
      reactLibEntry: 'react',
      reactDomClientEntry: 'react-dom/client',
    })
    expect(reactCode).toContain('export const available = true')
    expect(reactCode).toContain('import("react")')
    expect(reactCode).toContain('import("react-dom/client")')
    expect(reactCode).toContain('import("@talex-touch/tuffex-react")')
    expect(reactCode).toContain('import("@talex-touch/tuffex-react/style.css")')
  })

  it('resolves both virtual runtime IDs through the Vite plugin', () => {
    const plugin = nexusFrameworkRuntimePlugin(process.cwd())
    const resolveId = plugin.resolveId as (id: string) => string | null
    expect(resolveId(VIRTUAL_TUFFEX_WC_RUNTIME_ID)).toBe(`\0${VIRTUAL_TUFFEX_WC_RUNTIME_ID}`)
    expect(resolveId(VIRTUAL_TUFFEX_REACT_RUNTIME_ID)).toBe(`\0${VIRTUAL_TUFFEX_REACT_RUNTIME_ID}`)
    expect(resolveId('some-other-module')).toBeNull()
  })

  it('probes linked workspace packages when installed and built in apps/nexus', () => {
    const probe = probeFrameworkRuntimes(process.cwd())
    expect(probe.wcAvailable).toBe(true)
    expect(probe.wcEntry).toBe('@talex-touch/tuffex-wc')
    expect(probe.wcStyleEntry).toBe('@talex-touch/tuffex-wc/style.css')
    expect(probe.reactAvailable).toBe(true)
    expect(probe.reactEntry).toBe('@talex-touch/tuffex-react')
    expect(probe.reactStyleEntry).toBe('@talex-touch/tuffex-react/style.css')
    expect(probe.reactLibEntry).toBe('react')
    expect(probe.reactDomClientEntry).toBe('react-dom/client')
  })

  it('pre-bundles @floating-ui/dom via a pnpm-resolvable optimizeDeps entry in nuxt.config.ts', async () => {
    vi.stubGlobal('defineNuxtConfig', (config: unknown) => config)
    try {
      const mod = await import('../nuxt.config')
      const config = mod.default as { vite?: { optimizeDeps?: { include?: string[] } } }
      const include = config.vite?.optimizeDeps?.include ?? []

      const floatingDomEntry = include.find(entry => entry === '@floating-ui/dom' || entry.endsWith('> @floating-ui/dom'))
      expect(floatingDomEntry).toBe('@talex-touch/tuffex-core > @floating-ui/dom')

      const nexusRoot = resolve(import.meta.dirname, '..')
      const nexusReq = createRequire(resolve(nexusRoot, 'package.json'))
      const corePkgJson = nexusReq.resolve('@talex-touch/tuffex-core/package.json')
      const coreReq = createRequire(corePkgJson)
      const floatingDomEntryPath = coreReq.resolve('@floating-ui/dom')
      expect(existsSync(floatingDomEntryPath)).toBe(true)
      expect(dirname(floatingDomEntryPath)).toContain('@floating-ui')
    }
    finally {
      vi.unstubAllGlobals()
    }
  })
})
