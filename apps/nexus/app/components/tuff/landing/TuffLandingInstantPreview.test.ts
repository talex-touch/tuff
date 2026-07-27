import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const preview = readFileSync(new URL('./TuffLandingInstantPreview.vue', import.meta.url), 'utf8')

describe('TuffLandingInstantPreview layout contract', () => {
  it('keeps the floating stage expanded and its card layers ordered', () => {
    expect(preview).toContain('.InstantPreview-Stage .InstantPreview-FloatLayer')
    expect(preview).toContain('inset: 0;')
    expect(preview).toContain(':style="{ zIndex: Math.round(widget.depth * 100) }"')
    expect(preview).toContain('@media (max-width: 1140px)')
    expect(preview).toContain('--instant-preview-stage-scale: 0.9')
  })

  it('preserves rounded animated borders across browsers', () => {
    expect(preview).toContain('-webkit-mask-composite: xor')
    expect(preview).toContain('mask-composite: exclude')
    expect(preview).not.toContain('border-image-source')
  })

  it('stops the custom-property border animation for reduced motion', () => {
    expect(preview).toMatch(/prefers-reduced-motion: reduce[\s\S]*\.ai-preview-demo__card::before[\s\S]*animation: none/)
  })

  it('localizes the preview attribution', () => {
    expect(preview).toContain("t('landing.os.aiOverview.demo.preview.poweredBy')")
    expect(preview).toContain('{{ poweredByLabel }}')
    expect(preview).not.toContain('Powered by TuffIntelligence')
  })
})
