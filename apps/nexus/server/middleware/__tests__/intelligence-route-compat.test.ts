import { beforeAll, describe, expect, it, vi } from 'vitest'

let handler: (event: any) => unknown

beforeAll(async () => {
  vi.stubGlobal('defineEventHandler', (fn: (event: any) => unknown) => fn)
  const mod = await import('../intelligence-route-compat')
  handler = mod.default
})

function run(url: string) {
  const event = {
    node: {
      req: {
        url,
      },
    },
  }
  return () => handler(event as any)
}

describe('intelligence-route-compat', () => {
  it('legacy dot 路由返回 410', () => {
    expect(run('/api/dashboard/intelligence/providers/prov_1.probe')).toThrowError(/Deprecated endpoint/)
    expect(run('/api/dashboard/intelligence/providers/prov_1.test')).toThrowError(/Deprecated endpoint/)
  })

  it('标准斜杠路由不拦截', () => {
    expect(run('/api/dashboard/intelligence/providers/prov_1/probe')).not.toThrow()
    expect(run('/api/dashboard/intelligence/providers/prov_1/test')).not.toThrow()
  })

  it('非 intelligence providers 路由不拦截', () => {
    expect(run('/api/dashboard/intelligence/settings')).not.toThrow()
    expect(run('/api/other/path')).not.toThrow()
  })
})
