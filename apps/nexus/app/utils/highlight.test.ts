import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { highlightCodeToHtml, resolveHighlightApi } from './highlight'

const nexusRoot = join(import.meta.dirname, '../..')

describe('local code highlighter (zero polling, zero CDN)', () => {
  it('escapes HTML safely to prevent XSS in every language mode', () => {
    const payload = '<img src=x onerror="alert(1)">'
    for (const lang of ['ts', 'vue', 'html', 'json', 'css', 'bash', 'plaintext']) {
      const rendered = highlightCodeToHtml(payload, lang)
      expect(rendered).not.toContain('<img')
      expect(rendered).not.toContain('onerror="alert')
      expect(rendered).toContain('&lt;')
    }
  })

  it('highlights TypeScript, Vue SFC, JSON, CSS, and Bash tokens locally', () => {
    const tsHtml = highlightCodeToHtml('export const count: number = 42 // answer', 'ts')
    expect(tsHtml).toContain('hljs-keyword')
    expect(tsHtml).toContain('hljs-built_in')
    expect(tsHtml).toContain('hljs-number')
    expect(tsHtml).toContain('hljs-comment')

    const vueHtml = highlightCodeToHtml('<script setup lang="ts">\nconst ok = true\n</script>\n<template><TxButton type="primary" /></template>', 'vue')
    expect(vueHtml).toContain('hljs-name')
    expect(vueHtml).toContain('hljs-keyword')
    expect(vueHtml).toContain('hljs-literal')
    expect(vueHtml).toContain('hljs-attr')
    expect(vueHtml).toContain('hljs-string')

    const jsonHtml = highlightCodeToHtml('{"enabled": true, "count": 3}', 'json')
    expect(jsonHtml).toContain('hljs-attr')
    expect(jsonHtml).toContain('hljs-literal')
    expect(jsonHtml).toContain('hljs-number')

    const cssHtml = highlightCodeToHtml('.card { color: var(--tx-primary); padding: 12px; }', 'css')
    expect(cssHtml).toContain('hljs-selector-class')
    expect(cssHtml).toContain('hljs-variable')
    expect(cssHtml).toContain('hljs-number')

    const bashHtml = highlightCodeToHtml('pnpm add @talex-touch/tuffex --save # install', 'bash')
    expect(bashHtml).toContain('hljs-built_in')
    expect(bashHtml).toContain('hljs-attr')
    expect(bashHtml).toContain('hljs-comment')
  })

  it('resolves highlight API immediately without window.hljs or setInterval polling', async () => {
    const api = await resolveHighlightApi()
    expect(api).toBeTruthy()
    expect(api.highlight('const x = 1', { language: 'ts' }).value).toContain('hljs-keyword')

    const highlightSource = readFileSync(join(nexusRoot, 'app/utils/highlight.ts'), 'utf8')
    expect(highlightSource).not.toContain('setInterval')
    expect(highlightSource).not.toContain('window.hljs')

    const codeRendererSource = readFileSync(join(nexusRoot, 'app/components/content/CodeRenderer.vue'), 'utf8')
    expect(codeRendererSource).not.toContain('cdn.jsdelivr.net')
    expect(codeRendererSource).not.toContain('window.hljs')
  })

  it('highlights ordinary HTML and Vue tags with quoted expressions cleanly', () => {
    const html = highlightCodeToHtml('<div class="card" :title="a < b">ok</div>', 'vue')
    expect(html).toContain('hljs-name')
    expect(html).toContain('hljs-attr')
    expect(html).toContain('hljs-string')
    expect(html).toContain('ok')
  })

  it('does not suffer cubic backtracking on unclosed markup tags with many spaces', () => {
    const malformedSpaces = `<div${' '.repeat(4000)}`
    const malformedRepeated = '<div '.repeat(2000)

    const start = performance.now()
    const outSpaces = highlightCodeToHtml(malformedSpaces, 'html')
    const outRepeated = highlightCodeToHtml(malformedRepeated, 'vue')
    const elapsedMs = performance.now() - start

    expect(outSpaces).toContain('&lt;div')
    expect(outRepeated).toContain('&lt;div')
    expect(elapsedMs).toBeLessThan(250)
  })
})
