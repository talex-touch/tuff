import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compileTemplate, parse as parseSfc } from '@vue/compiler-sfc'
import { describe, expect, it } from 'vitest'
import { rehypeShikiJs } from '../rehype-shiki-js'
import { remarkCloseComponentTags } from '../remark-close-component-tags'
import { remarkMath } from '../remark-math'
import { remarkMermaid } from '../remark-mermaid'
import { remarkShikiCodeProps } from '../remark-shiki-code-props'
import { compileMdcToSfc } from './compile-mdc-to-sfc'

const currentDir = dirname(fileURLToPath(import.meta.url))
const appRoot = resolve(currentDir, '../..')
const contentDocsDir = join(appRoot, 'content/docs')

const TUFFEX_REMARK_PLUGINS = {
  'remark-mermaid': { instance: remarkMermaid },
  'remark-close-component-tags': { instance: remarkCloseComponentTags },
  'remark-math': { instance: remarkMath },
  'remark-shiki-code-props': { instance: remarkShikiCodeProps },
}

const TUFFEX_REHYPE_PLUGINS = {
  'rehype-shiki-js': { instance: rehypeShikiJs },
}

function walkMdcFiles(dir: string): string[] {
  if (!existsSync(dir))
    return []
  const files: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory())
      files.push(...walkMdcFiles(full))
    else if (st.isFile() && /\.mdc$/i.test(entry))
      files.push(full)
  }
  return files.sort((a, b) => a.localeCompare(b))
}

function compileAndValidateSfc(sfc: string, filename: string) {
  const parsed = parseSfc(sfc, { filename })
  expect(parsed.errors, `SFC parse errors in ${filename}`).toEqual([])
  expect(parsed.descriptor.template, `Missing <template> in ${filename}`).toBeTruthy()
  expect(parsed.descriptor.script, `Missing <script> docMeta export in ${filename}`).toBeTruthy()

  const scoped = parsed.descriptor.styles.some(style => style.scoped)
  const id = 'data-v-test0001'
  const clientTemplate = compileTemplate({
    source: parsed.descriptor.template!.content,
    filename,
    id,
    scoped,
    compilerOptions: {
      hoistStatic: true,
      ...(scoped ? { scopeId: id } : {}),
    },
  })
  expect(clientTemplate.errors, `Client template compile errors in ${filename}`).toEqual([])

  const ssrTemplate = compileTemplate({
    source: parsed.descriptor.template!.content,
    filename,
    id,
    scoped,
    ssr: true,
    ssrCssVars: [],
    compilerOptions: {
      hoistStatic: true,
      ...(scoped ? { scopeId: id } : {}),
    },
  })
  expect(ssrTemplate.errors, `SSR template compile errors in ${filename}`).toEqual([])

  return { parsed, clientTemplate, ssrTemplate }
}

describe('mdc-sfc-compiler', () => {
  it('compiles ALL 542 real content/docs/*.mdc files with 0 @vue/compiler-sfc parse/template errors', async () => {
    const files = walkMdcFiles(contentDocsDir)
    expect(files.length).toBe(542)

    const failures: Array<{ file: string, error: string }> = []
    let staticVNodeCount = 0

    for (const file of files) {
      const rel = relative(contentDocsDir, file)
      const raw = readFileSync(file, 'utf8')
      try {
        const compiled = await compileMdcToSfc(raw, {
          filePath: file,
          baseURL: '/tuffex',
          rootClass: 'tuffex-mdc-doc',
          remarkPlugins: TUFFEX_REMARK_PLUGINS,
          rehypePlugins: TUFFEX_REHYPE_PLUGINS,
        })

        const parsed = parseSfc(compiled.sfc, { filename: file })
        if (parsed.errors.length) {
          failures.push({ file: rel, error: `parse: ${parsed.errors.map(String).join('; ')}` })
          continue
        }

        const tpl = parsed.descriptor.template?.content ?? ''
        const scoped = parsed.descriptor.styles.some(s => s.scoped)
        const id = 'data-v-532check'
        const clientRes = compileTemplate({
          source: tpl,
          filename: file,
          id,
          scoped,
          compilerOptions: { hoistStatic: true, ...(scoped ? { scopeId: id } : {}) },
        })
        if (clientRes.errors.length) {
          failures.push({ file: rel, error: `client template: ${clientRes.errors.map(String).join('; ')}` })
          continue
        }
        if (clientRes.code.includes('createStaticVNode'))
          staticVNodeCount += 1

        const ssrRes = compileTemplate({
          source: tpl,
          filename: file,
          id,
          scoped,
          ssr: true,
          ssrCssVars: [],
          compilerOptions: { hoistStatic: true, ...(scoped ? { scopeId: id } : {}) },
        })
        if (ssrRes.errors.length) {
          failures.push({ file: rel, error: `ssr template: ${ssrRes.errors.map(String).join('; ')}` })
        }
      }
      catch (err) {
        failures.push({ file: rel, error: err instanceof Error ? err.message : String(err) })
      }
    }

    expect(failures).toEqual([])
    expect(staticVNodeCount).toBeGreaterThan(500)
  }, 60_000)

  it('emits createStaticVNode and preserves dual-theme Shiki spans on tabs.en.mdc, button.en.mdc, composition.en.mdc', async () => {
    const targets = [
      'components/tabs.en.mdc',
      'components/button.en.mdc',
      'composition.en.mdc',
    ]

    for (const rel of targets) {
      const file = join(contentDocsDir, rel)
      const raw = readFileSync(file, 'utf8')
      const compiled = await compileMdcToSfc(raw, {
        filePath: file,
        baseURL: '/tuffex',
        rootClass: 'tuffex-mdc-doc',
        remarkPlugins: TUFFEX_REMARK_PLUGINS,
        rehypePlugins: TUFFEX_REHYPE_PLUGINS,
      })

      const { clientTemplate } = compileAndValidateSfc(compiled.sfc, file)
      expect(clientTemplate.code, `${rel} must emit createStaticVNode`).toContain('createStaticVNode')
      expect(compiled.sfc, `${rel} must preserve --shiki-light`).toContain('--shiki-light')
      expect(compiled.sfc, `${rel} must preserve --shiki-dark`).toContain('--shiki-dark')
      expect(compiled.meta.toc.links.length, `${rel} must export non-empty toc.links`).toBeGreaterThan(0)
    }

    // Check internal link baseURL prefixing + fenced Shiki pre on composition.en.mdc
    const compFile = join(contentDocsDir, 'composition.en.mdc')
    const compCompiled = await compileMdcToSfc(readFileSync(compFile, 'utf8'), {
      filePath: compFile,
      baseURL: '/tuffex',
      rootClass: 'tuffex-mdc-doc',
      remarkPlugins: TUFFEX_REMARK_PLUGINS,
      rehypePlugins: TUFFEX_REHYPE_PLUGINS,
    })
    expect(compCompiled.sfc).toContain('href="/tuffex/en/')
    expect(compCompiled.sfc).not.toContain('href="/en/')
    expect(compCompiled.sfc).toContain('<pre v-pre class="')
    expect(compCompiled.sfc).toContain('shiki')

    // Check :rows JSON decoding on button.en.mdc DocApiTable
    const btnFile = join(contentDocsDir, 'components/button.en.mdc')
    const btnCompiled = await compileMdcToSfc(readFileSync(btnFile, 'utf8'), {
      filePath: btnFile,
      baseURL: '/tuffex',
      rootClass: 'tuffex-mdc-doc',
      remarkPlugins: TUFFEX_REMARK_PLUGINS,
      rehypePlugins: TUFFEX_REHYPE_PLUGINS,
    })
    expect(btnCompiled.usedComponents).toContain('DocApiTable')
    expect(btnCompiled.usedComponents).toContain('TuffDemoWrapper')
    expect(btnCompiled.usedComponents).toContain('TuffDocSourceLink')
    expect(btnCompiled.sfc).toContain('"rows":[{')
  })

  it('hoists <style scoped> in foundations.en.mdc, drops <script> in pagination.en.mdc, and compiles named/default slots + {{ }} safely', async () => {
    const foundationsFile = join(contentDocsDir, 'components/foundations.en.mdc')
    const foundations = await compileMdcToSfc(readFileSync(foundationsFile, 'utf8'), {
      filePath: foundationsFile,
      baseURL: '/tuffex',
      remarkPlugins: TUFFEX_REMARK_PLUGINS,
      rehypePlugins: TUFFEX_REHYPE_PLUGINS,
    })
    const { parsed: foundParsed } = compileAndValidateSfc(foundations.sfc, foundationsFile)
    expect(foundParsed.descriptor.styles.length).toBe(1)
    expect(foundParsed.descriptor.styles[0]?.scoped).toBe(true)
    expect(foundParsed.descriptor.styles[0]?.content).toContain('.tuff-swatch')
    expect(foundParsed.descriptor.script?.content).toContain('export default {}')
    expect(foundations.hasMath).toBe(true)

    const paginationFile = join(contentDocsDir, 'components/pagination.en.mdc')
    const pagination = await compileMdcToSfc(readFileSync(paginationFile, 'utf8'), {
      filePath: paginationFile,
      baseURL: '/tuffex',
      remarkPlugins: TUFFEX_REMARK_PLUGINS,
      rehypePlugins: TUFFEX_REHYPE_PLUGINS,
    })
    const { parsed: pagParsed } = compileAndValidateSfc(pagination.sfc, paginationFile)
    expect(pagParsed.descriptor.template?.content).not.toContain('<script')

    // Synthetic named-slot + mustache safety check
    const synthetic = `---
title: Slot Test
---

## Section Heading

See [Button](/en/button) and literal {{ mustache }}.

::Alert{type="warning"}
Default body with {{ unsafe }} text.

#footer
Named slot footer with [Link](/en/tabs) and {{ footerVar }}.
::
`
    const synthCompiled = await compileMdcToSfc(synthetic, {
      filePath: 'synthetic.en.mdc',
      baseURL: '/tuffex',
      resolveComponentImport: name => (name === 'Alert' ? { path: '~/components/content/Alert.vue' } : null),
    })
    compileAndValidateSfc(synthCompiled.sfc, 'synthetic.en.mdc')
    expect(synthCompiled.sfc).toContain('import Alert from "~/components/content/Alert.vue"')
    expect(synthCompiled.sfc).toContain('<Alert v-bind="__mdcProps_0">')
    expect(synthCompiled.sfc).toContain('<template #footer>')
    expect(synthCompiled.sfc).toContain('href="/tuffex/en/button"')
    expect(synthCompiled.sfc).toContain('href="/tuffex/en/tabs"')
  })
})
