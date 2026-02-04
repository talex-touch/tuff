import type { LayoutAtomConfig } from '@talex-touch/utils'

const shadowMap = {
  none: 'none',
  sm: '0 1px 2px rgba(0,0,0,0.05)',
  md: '0 4px 12px rgba(0,0,0,0.08)',
  lg: '0 10px 24px rgba(0,0,0,0.12)'
} as const

/**
 * Resolves LayoutAtomConfig to a flat record of CSS custom property names and values.
 * Used by LayoutShell / LayoutAtomProvider to inject atom styles.
 *
 * @param atom - Layout atom configuration
 * @param isDisplayMode - If true, applies display/preview specific variables like --nav-width
 */
export function resolveLayoutAtomsToCSSVars(
  atom: LayoutAtomConfig,
  isDisplayMode = false
): Record<string, string> {
  const [tl, tr, br, bl] = atom.view.radius
  const radius = `${tl}px ${tr}px ${br}px ${bl}px`

  const headerBorder =
    atom.header.border === 'solid'
      ? '1px solid var(--el-border-color)'
      : atom.header.border === 'gradient'
        ? '1px solid var(--el-border-color-lighter)'
        : 'none'

  const asideBorder = atom.aside.border === 'solid' ? '1px solid var(--el-border-color)' : 'none'

  const vars: Record<string, string> = {
    '--layout-view-radius': radius,
    '--layout-view-shadow': shadowMap[atom.view.shadow],
    '--layout-view-padding': `${atom.view.padding}px`,
    '--layout-view-background': atom.view.background,

    '--layout-header-border': headerBorder,
    '--layout-header-fake-opacity': String(atom.header.opacity),
    '--layout-header-height': `${atom.header.height}px`,
    '--layout-header-blur': atom.header.blur ? '1' : '0',

    '--layout-aside-border': asideBorder,
    '--layout-aside-opacity': String(atom.aside.opacity),
    '--layout-aside-position': atom.aside.position,
    '--layout-aside-collapsed': atom.aside.collapsed ? '1' : '0',
    '--layout-dock-height': atom.aside.position === 'bottom' ? '56px' : '0',

    '--layout-nav-style': atom.nav.style,
    '--layout-nav-active-indicator': atom.nav.activeIndicator
  }

  // Only set nav-width in display/preview mode to avoid affecting real layout
  if (isDisplayMode) {
    vars['--layout-display-ctr-height'] = `${atom.header.height}px`
    vars['--layout-display-nav-width'] = `${atom.aside.width}px`
    vars['--nav-width'] = `${atom.aside.width}px`
    vars['--layout-display-padding'] = `${Math.max(0, atom.view.padding)}px`
    vars['--layout-display-header-gap'] = '8px'
    vars['--layout-display-aside-padding'] = '4px'
    vars['--layout-display-footer-height'] = '32px'
    vars['--layout-display-menu-opacity'] = '0.35'
    vars['--layout-display-placeholder-opacity'] = '0.6'
  }

  return vars
}
