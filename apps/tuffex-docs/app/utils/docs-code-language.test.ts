import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { normalizeShikiLang } from '../../modules/shiki-js-highlighter'
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

  it('guards Object.prototype keys in language label and Shiki alias lookups', () => {
    expect(formatDocsCodeLanguage('constructor')).toBe('Constructor')
    expect(formatDocsCodeLanguage('toString')).toBe('Tostring')
    expect(formatDocsCodeLanguage('valueOf')).toBe('Valueof')
    expect(normalizeShikiLang('constructor')).toBe('text')
    expect(normalizeShikiLang('toString')).toBe('text')
    expect(normalizeShikiLang('__proto__')).toBe('text')
  })

  it('enforces tuffex-docs security, staging, changelog, and SSR 404 invariants', () => {
    const renderer = readRelative('../components/content/TuffCodeBlockRenderer.vue')
    expect(renderer).toContain('delete node.dataset.mermaidSource')

    const stageScript = readRelative('../../scripts/stage-cf-assets.mjs')
    expect(stageScript).toContain('basename(file)')

    const slugPage = readRelative('../pages/[...slug].vue')
    const readyIdx = slugPage.indexOf('await currentDoc.ready')
    const statusIdx = slugPage.indexOf('setResponseStatus(404)')
    expect(readyIdx).toBeGreaterThan(-1)
    expect(statusIdx).toBeGreaterThan(readyIdx)

    const changelogEn = readRelative('../../content/docs/components/changelog.en.mdc')
    const changelogZh = readRelative('../../content/docs/components/changelog.zh.mdc')
    expect(changelogEn).not.toContain('(/en/motion-toggle)')
    expect(changelogZh).not.toContain('(/zh/motion-toggle)')
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
