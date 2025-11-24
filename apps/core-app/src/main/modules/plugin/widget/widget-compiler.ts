import { compileScript, compileTemplate, parse } from '@vue/compiler-sfc'
import { transform } from 'esbuild'
import type { WidgetSource } from './widget-loader'

interface CompiledWidget {
  code: string
  styles: string
}

function resolveLoader(lang: string | undefined): 'js' | 'ts' | 'tsx' | 'jsx' {
  if (!lang)
    return 'js'

  const lower = lang.toLowerCase()

  if (lower === 'ts')
    return 'ts'
  if (lower === 'tsx')
    return 'tsx'
  if (lower === 'jsx')
    return 'jsx'

  return 'js'
}

export async function compileWidgetSource(source: WidgetSource): Promise<CompiledWidget> {
  const descriptor = parse(source.source, { filename: source.filePath }).descriptor

  let scriptCode = ''

  if (descriptor.script || descriptor.scriptSetup) {
    const compiledScript = compileScript(descriptor, {
      id: source.widgetId,
      inlineTemplate: false,
    })
    scriptCode = compiledScript.content
  }
  else {
    scriptCode = 'export default {}'
  }

  let templateCode = ''
  if (descriptor.template) {
    const compiledTemplate = compileTemplate({
      id: source.widgetId,
      filename: source.filePath,
      source: descriptor.template.content,
      compilerOptions: {
        mode: 'function',
      },
    })
    templateCode = compiledTemplate.code
  }

  const loader = resolveLoader(descriptor.script?.lang ?? descriptor.scriptSetup?.lang)
  const finalBundle = `
${scriptCode}
${templateCode}
const __component = exports.default || module.exports || {}
if (__component && exports.render) {
  __component.render = exports.render
}
module.exports = __component
`

  const transformed = await transform(finalBundle, {
    loader,
    format: 'cjs',
    target: 'node18',
  })

  const styles = descriptor.styles.map((style) => style.content || '').join('\n').trim()

  return {
    code: transformed.code,
    styles,
  }
}
