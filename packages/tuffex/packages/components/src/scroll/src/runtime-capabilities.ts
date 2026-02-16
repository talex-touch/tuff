import { hasNavigator } from '@talex-touch/utils/env'

interface UADataBrand {
  brand: string
  version: string
}

interface NavigatorWithUAData extends Navigator {
  userAgentData?: {
    platform?: string
    brands?: UADataBrand[]
    fullVersionList?: UADataBrand[]
  }
}

const CHROMIUM_NON_ROOT_OVERSCROLL_BOUNCE_MIN_VERSION = 145

function parseMajorVersion(version: string | undefined): number | null {
  if (typeof version !== 'string' || version.length === 0)
    return null

  const majorSegment = version.split('.')[0]
  const major = Number.parseInt(majorSegment, 10)
  return Number.isFinite(major) ? major : null
}

function getChromiumMajorFromProcessVersion(): number | null {
  const proc = (globalThis as { process?: { versions?: { chrome?: string } } }).process
  return parseMajorVersion(proc?.versions?.chrome)
}

function getChromiumMajorFromUAData(nav: NavigatorWithUAData): number | null {
  const uaData = nav.userAgentData
  if (!uaData)
    return null

  const brands = uaData.fullVersionList ?? uaData.brands
  if (!Array.isArray(brands))
    return null

  const chromiumBrand = brands.find(item => /chrom(e|ium)/i.test(item?.brand || ''))
  if (!chromiumBrand)
    return null

  return parseMajorVersion(chromiumBrand.version)
}

function getChromiumMajorFromUserAgent(nav: Navigator): number | null {
  const ua = nav.userAgent || ''
  const matched = ua.match(/(?:Chrome|Chromium|Edg|EdgA|EdgiOS|CriOS)\/(\d+)/i)
  if (!matched)
    return null

  return parseMajorVersion(matched[1])
}

function isMacOS(nav: NavigatorWithUAData): boolean {
  const platform = nav.userAgentData?.platform || nav.platform || ''
  const isTouchCapableMacLike = /mac/i.test(platform)
    && typeof nav.maxTouchPoints === 'number'
    && nav.maxTouchPoints > 1

  if (isTouchCapableMacLike)
    return false

  if (/mac/i.test(platform))
    return true

  return /macintosh|mac os x/i.test(nav.userAgent || '')
}

function isSafariBrowser(nav: Navigator): boolean {
  const ua = nav.userAgent || ''
  if (!/safari/i.test(ua))
    return false

  return !/(chrome|chromium|crios|edg|edga|edgios|opr|opera|firefox|fxios|android)/i.test(ua)
}

export function isMacOSSafari(): boolean {
  if (!hasNavigator())
    return false

  const nav = navigator as NavigatorWithUAData
  return isMacOS(nav) && isSafariBrowser(nav)
}

export function supportsNativeNonRootOverscrollBounce(): boolean {
  if (!hasNavigator())
    return false

  const nav = navigator as NavigatorWithUAData
  if (!isMacOS(nav))
    return false

  const chromiumMajor = getChromiumMajorFromProcessVersion()
    ?? getChromiumMajorFromUAData(nav)
    ?? getChromiumMajorFromUserAgent(nav)

  return chromiumMajor !== null && chromiumMajor >= CHROMIUM_NON_ROOT_OVERSCROLL_BOUNCE_MIN_VERSION
}
