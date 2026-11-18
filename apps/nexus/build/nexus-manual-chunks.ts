const TUFFEX_CORE_STYLE_COMPONENTS = new Set([
  'base-anchor',
  'base-surface',
  'button',
  'card',
  'flow-light',
  'popover',
  'spinner',
  'status-icon',
  'text-morph',
  'text-transformer',
  'tooltip',
])

const TUFFEX_LIQUID_STYLE_COMPONENTS = new Set([
  'flat-radio',
  'liquid',
])

const TUFFEX_DATA_STYLE_COMPONENTS = new Set([
  'auto-sizer',
  'avatar',
  'card-item',
  'checkbox',
  'data-table',
  'dropdown-menu',
  'edge-fade-mask',
  'empty',
  'empty-state',
  'filter-chips',
  'input',
  'no-data',
  'number-input',
  'rating',
  'search-empty',
  'search-input',
  'select',
  'skeleton',
  'status-badge',
  'tag',
])

const HEADER_COMPONENT_PATTERN = /\/app\/components\/(?:TheHeader|HeaderControls|HeaderIconButton|DarkToggle|LanguageToggle|icon\/Logo)\.vue$/
const TUFFEX_DIST_COMPONENT_PATTERN = /\/packages\/tuffex\/dist\/es\/([^/]+)\//

/**
 * Consolidates tiny shared header SFCs and TuffEx style-only dependency entrypoints
 * into predictable family chunks without pulling unrelated app code across routes.
 */
export function resolveNexusManualChunk(id: string): string | undefined {
  const cleanId = (id.split('?')[0] ?? id).replace(/\\/g, '/')
  const isStyleAsset = cleanId.endsWith('.css') || id.includes('type=style')
  if (!isStyleAsset)
    return undefined

  if (HEADER_COMPONENT_PATTERN.test(cleanId))
    return 'nexus-header'

  const tuffexMatch = cleanId.match(TUFFEX_DIST_COMPONENT_PATTERN)
  if (!tuffexMatch)
    return undefined

  const componentName = tuffexMatch[1]!
  if (componentName === 'radio' || componentName === 'glass-surface')
    return 'tuffex-radio-styles'
  if (TUFFEX_LIQUID_STYLE_COMPONENTS.has(componentName))
    return 'tuffex-liquid-styles'
  if (TUFFEX_CORE_STYLE_COMPONENTS.has(componentName))
    return 'tuffex-core-styles'
  if (TUFFEX_DATA_STYLE_COMPONENTS.has(componentName))
    return 'tuffex-data-styles'

  return undefined
}
