import type { Plugin } from 'vite'

const TUFFEX_COMPONENT_STATIC_IMPORT_RE = /^\s*import\s+(?!type\b)[\s\S]*?\sfrom\s+['"]@talex-touch\/tuffex\/([a-z0-9-]+)['"]/gm
const TUFFEX_COMPONENT_DYNAMIC_IMPORT_RE = /import\(\s*['"]@talex-touch\/tuffex\/([a-z0-9-]+)['"]\s*\)/g
const SUPPORTED_CODE_ID_RE = /\.(?:[cm]?[jt]sx?|vue)(?:$|\?)/

export interface TuffexOnDemandStylePluginOptions {
  enabled?: boolean
}

function isComponentSubpath(componentName: string) {
  return componentName !== 'base.css'
    && componentName !== 'style.css'
    && componentName !== 'utils'
    && !componentName.endsWith('.css')
}

function collectComponentImports(code: string) {
  const components = new Set<string>()

  for (const pattern of [TUFFEX_COMPONENT_STATIC_IMPORT_RE, TUFFEX_COMPONENT_DYNAMIC_IMPORT_RE]) {
    pattern.lastIndex = 0
    for (let match = pattern.exec(code); match !== null; match = pattern.exec(code)) {
      const componentName = match[1]
      if (!componentName)
        continue
      if (isComponentSubpath(componentName))
        components.add(componentName)
    }
  }

  return [...components].sort()
}

function hasStyleImport(code: string, componentName: string) {
  const specifier = `@talex-touch/tuffex/${componentName}/style.css`
  return code.includes(`'${specifier}'`) || code.includes(`"${specifier}"`)
}

export function tuffexOnDemandStylePlugin(options: TuffexOnDemandStylePluginOptions = {}): Plugin {
  return {
    name: 'tuffex-on-demand-style',
    enforce: 'post',
    transform(code, id) {
      if (options.enabled === false)
        return null
      if (!SUPPORTED_CODE_ID_RE.test(id))
        return null
      if (!code.includes('@talex-touch/tuffex/'))
        return null

      const componentNames = collectComponentImports(code)
      if (componentNames.length === 0)
        return null

      const styleImports = componentNames
        .filter(componentName => !hasStyleImport(code, componentName))
        .map(componentName => `import '@talex-touch/tuffex/${componentName}/style.css';`)
        .join('\n')
      if (!styleImports)
        return null

      return {
        code: `${styleImports}\n${code}`,
        map: null,
      }
    },
  }
}

export default tuffexOnDemandStylePlugin
