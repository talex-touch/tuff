import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { formatDocsCodeLanguage } from './docs-code-language'

function readRelative(path: string) {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

describe('tuffex-docs code block & gallery polish contracts', () => {
  it('formats language identifiers cleanly without EXAMPLE prefix', () => {
    expect(formatDocsCodeLanguage('typescript')).toBe('TypeScript')
    expect(formatDocsCodeLanguage('vue')).toBe('Vue')
    expect(formatDocsCodeLanguage('txt', '文本')).toBe('文本')
  })

  it('removes traffic-light dots and EXAMPLE prefix from TuffCodeBlockRenderer', () => {
    const source = readRelative('../components/content/TuffCodeBlockRenderer.vue')
    expect(source).toContain('formatDocsCodeLanguage')
    expect(source).not.toContain('EXAMPLE.')
    expect(source).not.toContain('tuff-code-block__dots')
    expect(source).not.toContain('#ff5f57')
    expect(source).not.toContain('#febc2e')
    expect(source).not.toContain('#28c840')
    expect(source).not.toMatch(/\.tuff-code-block__copy\s*\{[^}]*transition\s*:[^}]*(?:background-color|color)/s)
  })

  it('renders the calm GalleryProgressBar specimen in GalleryBaseSuite', () => {
    const suiteSource = readRelative('../components/docs/gallery/suites/GalleryBaseSuite.vue')
    const progressSource = readRelative('../components/docs/gallery/GalleryProgressBar.vue')
    expect(suiteSource).toContain('import GalleryProgressBar from \'../GalleryProgressBar.vue\'')
    expect(suiteSource).toContain('<GalleryProgressBar :locale-key="localeKey" />')
    expect(suiteSource).not.toContain('flow-effect="stardust"')
    expect(suiteSource).not.toContain('progressSegments')
    expect(progressSource).toContain('useGalleryLoop')
    expect(progressSource).not.toContain('stardust')
  })
})
