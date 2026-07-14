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

  it('keeps async GSAP setup scoped to mounted DOM and setup-time cleanup', () => {
    const gsapReveal = readLandingFile('../../../composables/useGsapReveal.ts')
    const homeSections = readLandingFile('../../../composables/useTuffHomeSections.ts')

    expect(gsapReveal).toContain('const scope = container.value')
    expect(gsapReveal).toContain('if (disposed)')
    expect(gsapReveal).toContain('trigger: scope')
    expect(gsapReveal).toContain('}, scope)')
    expect(gsapReveal).not.toContain('}, container)')

    expect(homeSections).toContain('let disposed = false')
    expect(homeSections).toContain('if (disposed || !hasWindow())')
    expect(homeSections).toContain('if (disposed)')
    expect(homeSections.match(/onBeforeUnmount\(/g)).toHaveLength(1)
    expect(homeSections).toMatch(/scrollTo:\s*\{[\s\S]*autoKill: false,[\s\S]*\},\s*duration/)
    expect(homeSections).not.toMatch(/\},\s*duration,[\s\S]*autoKill: false,/)
  })

  it('defers below-fold plugin card images until their cards approach the viewport', () => {
    const blurImage = readLandingFile('../carousel/apple/AppleBlurImage.vue')
    const pluginCards = [
      readLandingFile('./plugins/cards/PluginCardCalendar.vue'),
      readLandingFile('./plugins/cards/PluginCardNotion.vue'),
      readLandingFile('./plugins/cards/PluginCardSpotify.vue'),
      readLandingFile('./plugins/cards/PluginCardVSCode.vue'),
    ]

    expect(blurImage).toContain('defer?: boolean')
    expect(blurImage).toContain('const resolvedSrc = computed')
    expect(blurImage).toContain(':src="resolvedSrc"')
    expect(blurImage).toContain('new IntersectionObserver')
    expect(blurImage).toContain("rootMargin: '200px 0px'")
    expect(blurImage).toContain('observer?.disconnect()')
    for (const card of pluginCards)
      expect(card).toContain(':defer="true"')
  })

  it('defers showcase video URLs and duration work until the showcase is visible', () => {
    const displayer = readLandingFile('./showcase/TuffShowcaseDisplayer.vue')
    const search = readLandingFile('./showcase/TuffShowcaseSearch.vue')

    expect(displayer).not.toContain("from '@talex-touch/utils/network'")
    expect(displayer).not.toContain("document.createElement('video')")
    expect(displayer).not.toContain('loadSlideDurations')
    expect(displayer).toContain('const mediaEnabled = ref(false)')
    expect(displayer).toContain('new IntersectionObserver')
    expect(displayer).toContain("rootMargin: '0px'")
    expect(displayer).toContain(':media-enabled="mediaEnabled"')
    expect(displayer).toContain('@media-duration="handleMediaDuration(slide.id, $event)"')

    expect(search).toContain('mediaEnabled?: boolean')
    expect(search).toContain('const mediaSrc = computed')
    expect(search).toContain(':src="mediaSrc"')
    expect(search).toContain(':poster="mediaPoster"')
    expect(search).toContain('preload="none"')
    expect(search).toContain('@loadedmetadata="handleLoadedMetadata"')
  })
})
