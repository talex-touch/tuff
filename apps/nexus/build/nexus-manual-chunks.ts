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
const DOCS_LAYOUT_COMPONENT_PATTERN = /\/app\/(?:layouts\/docs|components\/DocsOutline|components\/DocsSidebar|components\/docs\/DocsAsideCardsShell|components\/docs\/DocsCopyPromptButton)\.vue$/
const DOCS_DEMO_SHELL_COMPONENT_PATTERN = /\/app\/components\/content\/(?:TuffDemoWrapper|TuffDemoClientRenderer\.client|TuffDocSourceLink)\.vue$/
const DOCS_SURFACE_STYLE_PATTERN = /\/app\/(?:layouts\/docs|components\/DocsOutline|components\/DocsSidebar|components\/docs\/(?:DocsAsideCardsShell|DocsCopyPromptButton|DocApiTable)|components\/content\/(?:TuffDemoWrapper|TuffDocSourceLink|TuffCodeBlockRenderer))\.vue$/
const LANDING_IMAGE_ASSET_PATTERN = /\/app\/images\/assets\//
const TUFFEX_DIST_COMPONENT_PATTERN = /\/packages\/tuffex\/dist\/es\/([^/]+)\//

/**
 * Consolidates tiny shared header/docs SFCs and TuffEx style-only dependency entrypoints
 * into predictable family chunks without pulling unrelated app code across routes.
 * Landing image URL stubs stay isolated so `experimentalMinChunkSize` never folds them
 * into shared Nuxt runtime chunks loaded by non-landing routes.
 */
export function resolveNexusManualChunk(id: string): string | undefined {
  const cleanId = (id.split('?')[0] ?? id).replace(/\\/g, '/')
  if (LANDING_IMAGE_ASSET_PATTERN.test(cleanId))
    return 'nexus-landing-assets'

  const isStyleAsset = cleanId.endsWith('.css') || id.includes('type=style')
  if (!isStyleAsset) {
    if (HEADER_COMPONENT_PATTERN.test(cleanId))
      return 'nexus-header-controls'
    if (DOCS_LAYOUT_COMPONENT_PATTERN.test(cleanId))
      return 'docs-layout'
    if (DOCS_DEMO_SHELL_COMPONENT_PATTERN.test(cleanId))
      return 'docs-demo-shell'
    return undefined
  }

  if (HEADER_COMPONENT_PATTERN.test(cleanId))
    return 'nexus-header'
  if (DOCS_SURFACE_STYLE_PATTERN.test(cleanId))
    return 'docs-surface'

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
