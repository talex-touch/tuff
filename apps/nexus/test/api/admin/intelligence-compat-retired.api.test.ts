import { beforeAll, describe, expect, it } from 'vitest'

type ApiHandler = (event: any) => Promise<unknown> | unknown

const createTestError = (input: { statusCode: number; statusMessage: string; data?: unknown }) =>
  Object.assign(new Error(input.statusMessage), input)

const callHandler = (handler: ApiHandler) => Promise.resolve().then(() => handler({}))

const retiredLabRoutes = [
  ['providers', '../../../server/api/admin/intelligence-lab/providers.get'],
  ['session trace', '../../../server/api/admin/intelligence-lab/session/trace.get'],
  ['session heartbeat', '../../../server/api/admin/intelligence-lab/session/heartbeat.post'],
  ['session stream', '../../../server/api/admin/intelligence-lab/session/stream.post'],
  ['session history', '../../../server/api/admin/intelligence-lab/session/history.get'],
  ['session pause', '../../../server/api/admin/intelligence-lab/session/pause.post'],
  ['tool approve', '../../../server/api/admin/intelligence-lab/tool/approve.post'],
  ['orchestrator plan', '../../../server/api/admin/intelligence-lab/orchestrator/plan.post'],
  ['orchestrator execute', '../../../server/api/admin/intelligence-lab/orchestrator/execute.post'],
  ['orchestrator reflect', '../../../server/api/admin/intelligence-lab/orchestrator/reflect.post'],
] as const

const retiredOrchestratorRoutes = [
  ['plan', '../../../server/api/admin/intelligence-agent/orchestrator/plan.post'],
  ['execute', '../../../server/api/admin/intelligence-agent/orchestrator/execute.post'],
  ['reflect', '../../../server/api/admin/intelligence-agent/orchestrator/reflect.post'],
] as const

beforeAll(() => {
  ;(globalThis as any).defineEventHandler = (fn: ApiHandler) => fn
  ;(globalThis as any).createError = createTestError
})

describe('retired intelligence compatibility endpoints', () => {
  it.each(retiredLabRoutes)('returns 410 for intelligence-lab %s', async (_name, importPath) => {
    const handler = (await import(importPath)).default as ApiHandler

    await expect(callHandler(handler)).rejects.toMatchObject({
      statusCode: 410,
      statusMessage: expect.stringContaining('/api/admin/intelligence-agent/*'),
    })
  })

  it.each(retiredOrchestratorRoutes)(
    'returns 410 for old intelligence-agent orchestrator %s endpoint',
    async (_name, importPath) => {
      const handler = (await import(importPath)).default as ApiHandler

      await expect(callHandler(handler)).rejects.toMatchObject({
        statusCode: 410,
        statusMessage: expect.stringContaining('/api/admin/intelligence-agent/session/stream'),
      })
    },
  )
})
