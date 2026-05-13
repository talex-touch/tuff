import { describe, expect, it } from 'vitest'
import { buildPilotServeStat } from '../pilot-serve-stat'

describe('buildPilotServeStat', () => {
  it('uses runtime metrics instead of fixed mock values', async () => {
    const stat = await buildPilotServeStat()

    expect(stat.runtime.nodeVersion).toBe(process.version)
    expect(stat.runtime.os).toBe(process.platform)
    expect(stat.cpu.brand).not.toBe('Mock CPU')
    expect(stat.cpu.model).not.toBe('pilot-mock')
    expect(stat.memory.total).toBeGreaterThan(0)
    expect(['available', 'degraded', 'unavailable']).toContain(stat.status)
  })
})
