import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { formatDocsCodeLanguage } from './docs-code-language'

function readRelative(path: string) {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

describe('formatDocsCodeLanguage', () => {
  it('formats common language identifiers into clean labels without EXAMPLE prefix', () => {
    expect(formatDocsCodeLanguage('typescript')).toBe('TypeScript')
    expect(formatDocsCodeLanguage('ts')).toBe('TypeScript')
    expect(formatDocsCodeLanguage('TSX')).toBe('TSX')
    expect(formatDocsCodeLanguage('javascript')).toBe('JavaScript')
    expect(formatDocsCodeLanguage('vue')).toBe('Vue')
    expect(formatDocsCodeLanguage('bash')).toBe('Bash')
    expect(formatDocsCodeLanguage('sh')).toBe('Shell')
    expect(formatDocsCodeLanguage('css')).toBe('CSS')
    expect(formatDocsCodeLanguage('scss')).toBe('SCSS')
    expect(formatDocsCodeLanguage('json')).toBe('JSON')
    expect(formatDocsCodeLanguage('yaml')).toBe('YAML')
    expect(formatDocsCodeLanguage('mdc')).toBe('MDC')
  })

  it('uses fallback for empty or plain text languages', () => {
    expect(formatDocsCodeLanguage('')).toBe('Text')
    expect(formatDocsCodeLanguage(undefined, '文本')).toBe('文本')
    expect(formatDocsCodeLanguage('txt', '文本')).toBe('文本')
    expect(formatDocsCodeLanguage('plaintext')).toBe('Text')
  })

  it('sanitizes and title-cases unknown languages', () => {
    expect(formatDocsCodeLanguage('nginx')).toBe('Nginx')
    expect(formatDocsCodeLanguage('  hcl! ')).toBe('Hcl')
    expect(formatDocsCodeLanguage('constructor')).toBe('Constructor')
    expect(formatDocsCodeLanguage('toString')).toBe('Tostring')
  })
})

describe('docs code block polish contracts', () => {
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

  it('preserves .not-prose exclusion and shared language formatting in docs page', () => {
    const source = readRelative('../pages/docs/[...slug].vue')
    expect(source).toContain('formatDocsCodeLanguage')
    expect(source).toContain('pre.closest(\'.tuff-code-block, .not-prose\')')
    expect(source).toContain('code.closest(\'.tuff-code-block, .not-prose\')')
    expect(source).not.toMatch(/\.docs-code-copy\)\s*\{[^}]*transition\s*:[^}]*(?:background-color|color)/s)
  })
})
