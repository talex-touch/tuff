const sharedShadowStyles: string[] = []

/**
 * Minimal host-level styles always included when an element is created with `shadowRoot: true`.
 */
export const DEFAULT_SHADOW_HOST_CSS = `:host {
  box-sizing: border-box;
}
:host([hidden]) {
  display: none !important;
}`

/**
 * Append CSS text to the global stylesheet list applied to newly created `shadowRoot: true` elements.
 */
export function registerTuffexShadowStyles(cssText: string): void {
  const trimmed = cssText.trim()
  if (!trimmed || sharedShadowStyles.includes(trimmed))
    return
  sharedShadowStyles.push(trimmed)
}

/**
 * Replace the global stylesheet list for `shadowRoot: true` elements.
 */
export function setTuffexShadowStyles(styles: string[]): void {
  sharedShadowStyles.length = 0
  for (const style of styles)
    registerTuffexShadowStyles(style)
}

/**
 * Read the stylesheets that will be injected into `shadowRoot: true` elements.
 */
export function getTuffexShadowStyles(extraStyles?: string[]): string[] {
  const combined = [DEFAULT_SHADOW_HOST_CSS, ...sharedShadowStyles, ...(extraStyles ?? [])]
  return Array.from(new Set(combined.map(s => s.trim()).filter(Boolean)))
}

/**
 * Adopt CSS into a ShadowRoot (using `adoptedStyleSheets` when available, falling back to `<style>`).
 */
export function injectShadowStyles(shadowRoot: ShadowRoot, styles: string[]): void {
  const normalized = styles.map(s => s.trim()).filter(Boolean)
  if (!normalized.length)
    return

  if (typeof CSSStyleSheet !== 'undefined' && 'adoptedStyleSheets' in shadowRoot && typeof CSSStyleSheet.prototype.replaceSync === 'function') {
    const sheets = normalized.map((css) => {
      const sheet = new CSSStyleSheet()
      sheet.replaceSync(css)
      return sheet
    })
    shadowRoot.adoptedStyleSheets = [...shadowRoot.adoptedStyleSheets, ...sheets]
    return
  }

  for (const css of normalized) {
    const styleEl = document.createElement('style')
    styleEl.textContent = css
    shadowRoot.appendChild(styleEl)
  }
}
