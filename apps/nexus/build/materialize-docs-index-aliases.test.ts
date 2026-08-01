import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { materializeDocsIndexAliases } from './materialize-docs-index-aliases.mjs'

describe('materialize docs index aliases', () => {
  it('copies localized index documents to Cloudflare directory targets', () => {
    const distRoot = mkdtempSync(join(tmpdir(), 'nexus-docs-aliases-'))
    const fixtures = [
      ['en/docs/index/index.html', '<html>English docs</html>'],
      ['en/docs/dev/index/index.html', '<html>Developer docs</html>'],
      ['zh/docs/dev/components/index/index.html', '<html>组件文档</html>'],
    ] as const

    for (const [file, content] of fixtures) {
      const filePath = join(distRoot, file)
      mkdirSync(join(filePath, '..'), { recursive: true })
      writeFileSync(filePath, content)
    }

    const ordinaryDoc = join(distRoot, 'en/docs/dev/components/button/index.html')
    mkdirSync(join(ordinaryDoc, '..'), { recursive: true })
    writeFileSync(ordinaryDoc, '<html>Button</html>')

    const aliases = materializeDocsIndexAliases(distRoot)
    const repeatedAliases = materializeDocsIndexAliases(distRoot)

    expect(aliases.map(alias => alias.route)).toEqual([
      '/en/docs',
      '/en/docs/dev',
      '/zh/docs/dev/components',
    ])
    expect(repeatedAliases).toEqual(aliases)
    expect(readFileSync(join(distRoot, 'en/docs/index.html'), 'utf8')).toBe('<html>English docs</html>')
    expect(readFileSync(join(distRoot, 'en/docs/dev/index.html'), 'utf8')).toBe('<html>Developer docs</html>')
    expect(readFileSync(join(distRoot, 'zh/docs/dev/components/index.html'), 'utf8')).toBe('<html>组件文档</html>')
    expect(readFileSync(ordinaryDoc, 'utf8')).toBe('<html>Button</html>')
    expect(existsSync(join(distRoot, 'en/docs/dev/components/button.html'))).toBe(false)
  })

  it('fails closed when localized docs output is missing', () => {
    const distRoot = mkdtempSync(join(tmpdir(), 'nexus-docs-aliases-missing-'))
    const englishIndex = join(distRoot, 'en/docs/index/index.html')
    mkdirSync(join(englishIndex, '..'), { recursive: true })
    writeFileSync(englishIndex, '<html>English docs</html>')

    expect(() => materializeDocsIndexAliases(distRoot)).toThrow(
      '[nexus-docs-aliases] localized docs output is missing: zh',
    )
  })
})
