import { describe, expect, it, vi } from 'vitest'

let jtiUsed = false

const mockDb = {
  prepare(sql: string) {
    return {
      bind() {
        return {
          run: async () => {
            if (sql.includes('UPDATE admin_emergency_jti')) {
              if (!jtiUsed) {
                jtiUsed = true
                return { meta: { changes: 1 } }
              }
              return { meta: { changes: 0 } }
            }
            return { meta: { changes: 1 } }
          },
          first: async () => null,
          all: async () => ({ results: [] }),
        }
      },
      run: async () => ({ meta: { changes: 1 } }),
      first: async () => null,
      all: async () => ({ results: [] }),
    }
  },
}

vi.mock('../cloudflare', () => ({
  readCloudflareBindings: () => ({
    DB: mockDb,
  }),
}))

describe('adminEmergencyStore.consumeEmergencyJti', () => {
  it('jti 只能成功消费一次', async () => {
    jtiUsed = false
    const { consumeEmergencyJti } = await import('../adminEmergencyStore')
    const event = {} as any

    const first = await consumeEmergencyJti(event, 'jti-test')
    const second = await consumeEmergencyJti(event, 'jti-test')

    expect(first).toBe(true)
    expect(second).toBe(false)
  })
})

