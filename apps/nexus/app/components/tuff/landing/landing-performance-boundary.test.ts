import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function readLandingFile(file: string) {
  return readFileSync(new URL(file, import.meta.url), 'utf8')
}

describe('landing page performance boundaries', () => {
  it('forwards sticky bar reveal attrs to a real element', () => {
    const stickyBar = readLandingFile('../TuffStickyBar.vue')

    expect(stickyBar).toContain('defineOptions({ inheritAttrs: false })')
    expect(stickyBar).toContain('v-bind="$attrs"')
  })

  it('keeps waitlist aurora styles deterministic across SSR hydration', () => {
    const waitlist = readLandingFile('./TuffLandingWaitlist.vue')
    const auroraBar = readLandingFile('./TuffLandingAuroraBar.vue')

    expect(waitlist).not.toContain('Math.random')
    expect(waitlist).toContain('const seed = i + 1')
    expect(waitlist).toContain('hue: (seed * 47) % 360')
    expect(waitlist).toContain('aspectRatio: (seed * 7) % 10 + 1')
    expect(waitlist).toContain(':hue="bar.hue"')
    expect(waitlist).toContain(':aspect-ratio="bar.aspectRatio"')

    expect(auroraBar).not.toContain('Math.random')
    expect(auroraBar).not.toContain("import { computed } from 'vue'")
    expect(auroraBar).toContain('hue: number')
    expect(auroraBar).toContain('aspectRatio: number')
  })
})
