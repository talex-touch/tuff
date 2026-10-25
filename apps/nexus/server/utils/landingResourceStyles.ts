import { isLandingRoute, isStaticHtmlRoute } from './landingResourceHints'

const STATIC_STYLESHEET_RE = /<link\b[^>]*\brel=(['"])stylesheet\1[^>]*>/gi
const DEFERRED_LANDING_STYLE_RE = /\/_nuxt\/(?:TuffLanding(?:Stats|Plugins|AiOverview|InstantPreview|FeatureShowcase|DesignSystem|Faq|Section|Hairline)|TuffShowcase|CoreBoxMock|TuffPromoVideoModal|shown-box|ordinal|data-table-demo-labels|shiki-runtime|TxCardItem|highlight|admin-client-list|guarded-close|TxDropdownSubmenu|uid|use-fresh-chunks|types|addon-fit|TxDivider|TxDrawer|DocsOutline|focus-trap|virtual_nuxt_[^/]+)\.[^\s"']+\.css(?:\?[^\s"']*)?$/
const STATIC_CORE_STYLE_RE = /\/_nuxt\/(?:entry|TheHeader|Logo|LanguageToggle|docs|store|pricing|license|privacy|protocol|updates|AuthLegalFooter|AuthVisualShell|index)\.[^\s"']+\.css(?:\?[^\s"']*)?$/

function hrefOfStylesheetTag(tag: string): string | null {
  const match = tag.match(/\bhref=(['"])([^'"]+)\1/i)
  return match?.[2] ?? null
}

function shouldDeferStaticStyle(href: string, routePath: string | null | undefined) {
  if (isLandingRoute(routePath))
    return DEFERRED_LANDING_STYLE_RE.test(href)
  if (!isStaticHtmlRoute(routePath) || STATIC_CORE_STYLE_RE.test(href))
    return false
  return true
}

export function deferStaticStyles(html: string, routePath?: string | null): string {
  return html.replace(STATIC_STYLESHEET_RE, (tag) => {
    const href = hrefOfStylesheetTag(tag)
    if (!href || !shouldDeferStaticStyle(href, routePath) || tag.includes('data-nexus-deferred-style'))
      return tag

    return tag.replace(/>$/, ' media="print" data-nexus-deferred-style>')
  })
}
