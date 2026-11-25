import { describe, expect, it } from 'vitest'
import {
  buildReactRuntimeVirtualModule,
  buildWcRuntimeVirtualModule,
  nexusFrameworkRuntimePlugin,
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
})
