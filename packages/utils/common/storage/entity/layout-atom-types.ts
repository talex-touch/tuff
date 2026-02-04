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
