import { describe, expect, it } from 'vitest'
import { makeRig, useRigs } from '../monitor/testing/rig'
import { gateOf, greenInputs, withMonitor } from './testing/builders'

useRigs()

describe('what the monitor saw of dropped frames, as G7 reads it', () => {
  it.each([
    ['warn', 2, />20 ms share 0 fail \+ 1 warn, peak 3\.3%/],
    ['fail', 4, />20 ms share 1 fail \+ 0 warn, peak 6\.7%/]
  ] as const)(
    'a sustained 25-45 ms run that no 50 ms limit sees makes G7 %s and names the share over 20 ms',
    async (status, slowPerSecond, breakdown) => {
      const rig = await makeRig()
      rig.monitor.setPhase('steady')
      Object.assign(rig.pages.get('p1')!, { o20: slowPerSecond, o33: 1, o50: 0, worst: 45 })
      await rig.clock.run(8_000)
      const summary = await rig.stop()

      const result = gateOf(withMonitor(greenInputs(), summary), 'G7')
      expect(result.status).toBe(status)
      expect(result.detail).toMatch(breakdown)
      expect(result.detail).not.toMatch(/>50 ms share \d+ fail/)
      expect(result.detail).toContain(`${((slowPerSecond / 60) * 100).toFixed(1)}% over 20 ms`)
    }
  )

  it('does not let a hidden window with slow frames touch G7', async () => {
    const rig = await makeRig()
    rig.monitor.setPhase('steady')
    rig.pages.set('p2', {
      ...rig.pages.get('p1')!,
      id: 'p2',
      title: 'Settings',
      vis: false,
      o20: 30,
      o33: 30,
      o50: 30,
      worst: 300
    })
    await rig.clock.run(8_000)
    const summary = await rig.stop()

    const result = gateOf(withMonitor(greenInputs(), summary), 'G7')
    expect(result.status).toBe('pass')
    expect(result.detail).toContain('frame-drop episodes 0 fail + 0 warn')
    expect(summary.windows!.find((entry) => entry.label.includes('Settings'))).toMatchObject({
      frames: 0,
      over20ms: 0
    })
  })
})
