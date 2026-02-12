/**
 * Layout atom configuration for app layout customization.
 * Used for atomic layout styling (header, aside, view, nav).
 */
export interface LayoutAtomConfig {
  preset: string | 'custom'

  header: {
    border: 'solid' | 'none' | 'gradient'
    opacity: number
    height: number
    blur: boolean
  }

  aside: {
    position: 'left' | 'right' | 'bottom' | 'hidden'
    width: number
    border: 'solid' | 'none'
    opacity: number
    collapsed: boolean
  }

  view: {
    radius: [number, number, number, number]
    shadow: 'none' | 'sm' | 'md' | 'lg'
    padding: number
    background: 'transparent' | 'solid' | 'blur'
  }

  nav: {
    style: 'icon' | 'icon-text' | 'text'
    activeIndicator: 'dot' | 'bar' | 'background' | 'none'
  }

  customCSS?: string
}

/**
 * CoreBox theme configuration for search box UI customization.
 */
export interface CoreBoxThemeConfig {
  preset: string | 'custom'

  logo: {
    position: 'left' | 'right' | 'hidden'
    size: number
    style: 'default' | 'circle' | 'rounded'
  }

  input: {
    border: 'none' | 'bottom' | 'full'
    radius: number
    background: 'transparent' | 'subtle' | 'solid'
  }

  results: {
    itemRadius: number
    itemPadding: number
    divider: boolean
    hoverStyle: 'background' | 'border' | 'scale'
  }

  container: {
    radius: number
    shadow: 'none' | 'sm' | 'md' | 'lg'
    border: boolean
  }

  customCSS?: string
}

export type ThemeWindowStyle = 'Default' | 'Mica' | 'Filter'
export type ThemeRouteTransitionStyle = 'slide' | 'fade' | 'zoom'

/**
 * Theme-level preset fields used by preset v2.
 */
export interface ThemePresetConfig {
  window?: ThemeWindowStyle
  style?: {
    dark: boolean
    auto: boolean
  }
  addon?: {
    contrast: boolean
    coloring: boolean
  }
  transition?: {
    route: ThemeRouteTransitionStyle
  }
  palette?: {
    primary?: string
    accent?: string
    surface?: string
    text?: string
  }
}

export interface LayoutCanvasItem {
  id: string
  area: 'header' | 'aside' | 'view' | 'nav' | 'plugins' | 'title' | 'icon'
  x: number
  y: number
  w: number
  h: number
  minW?: number
  minH?: number
  maxW?: number
  maxH?: number
  visible?: boolean
}

export interface LayoutCanvasConfig {
  enabled: boolean
  preset: string | 'custom'
  columns: number
  rowHeight: number
  gap: number
  items: LayoutCanvasItem[]
  colorVars?: Record<string, string>
  customCSS?: string
}

export interface CoreBoxCanvasItem {
  id: string
  area: 'logo' | 'input' | 'tags' | 'actions' | 'results' | 'footer' | 'addon'
  x: number
  y: number
  w: number
  h: number
  minW?: number
  minH?: number
  maxW?: number
  maxH?: number
  visible?: boolean
}

export interface CoreBoxCanvasConfig {
  enabled: boolean
  preset: string | 'custom'
  columns: number
  rowHeight: number
  gap: number
  items: CoreBoxCanvasItem[]
  colorVars?: Record<string, string>
  customCSS?: string
}
