import tdsTokensJson from '../../../../docs/design/tds/tokens.json'

export type TdsThemeKey = 'light' | 'dark' | 'highContrastLight' | 'highContrastDark'
export type TdsSurfaceMode = 'opaque' | 'refraction'
export type TdsBackdropKey = 'light' | 'dark'
export type TdsPrimitiveCategory = 'surface' | 'display' | 'data' | 'form' | 'navigation' | 'overlay' | 'ai'
export type TdsPrimitiveSuite = 'base' | 'pro' | 'ai'
export type WcagGrade = 'AAA' | 'AA' | 'AA Large' | 'Fail'

export type Rgb = [number, number, number]
export type Rgba = [number, number, number, number]

export interface TdsContrastPairSpec {
  id: string
  fg: string
  bg: string
  backdrop?: string
  minRatio: number
  measured: number
}

export interface TdsConvergenceMapping {
  role: string
  shell: string
  tuffex: string
  bui?: string
  status: string
  value?: string
  note?: string
}

export interface TdsSwatchEntry {
  token: string
  rawValue: string
  resolvedHex: string
  resolvedCss: string
  alpha: number
  isAlias: boolean
}

export interface TdsContrastEvaluation {
  id: string
  fgToken: string
  bgToken: string
  fgHex: string
  bgHex: string
  fgCss: string
  bgCss: string
  ratio: number
  opaqueRatio: number
  delta: number
  minRatio: number
  grade: WcagGrade
  passAA: boolean
  passAAA: boolean
  passLarge: boolean
  meetsContract: boolean
}

export interface TdsCorePrimitiveItem {
  slug: string
  component: string
  category: TdsPrimitiveCategory
  suite: TdsPrimitiveSuite
  docPath: string
  role: {
    en: string
    zh: string
  }
}

export const TDS_TOKENS = tdsTokensJson

export const TDS_THEME_KEYS: readonly TdsThemeKey[] = [
  'light',
  'dark',
  'highContrastLight',
  'highContrastDark',
] as const

export const TDS_REFRACTION_OPACITY = 0.85

export const TDS_BACKDROPS: Record<TdsBackdropKey, { hex: string, rgb: Rgb }> = {
  light: { hex: '#e8e8ec', rgb: [232, 232, 236] },
  dark: { hex: '#0b0b0d', rgb: [11, 11, 13] },
}

export const TDS_PRIMITIVE_CATEGORIES: readonly TdsPrimitiveCategory[] = [
  'surface',
  'display',
  'data',
  'form',
  'navigation',
  'overlay',
  'ai',
] as const

interface PrimitiveMeta {
  component: string
  category: TdsPrimitiveCategory
  suite: TdsPrimitiveSuite
  role: { en: string, zh: string }
}

const PRIMITIVE_META: Record<string, PrimitiveMeta> = {
  'base-surface': {
    component: 'TxBaseSurface',
    category: 'surface',
    suite: 'pro',
    role: { en: 'Unified refraction material host', zh: '统一琉光折射材质容器' },
  },
  'card': {
    component: 'TxCard',
    category: 'surface',
    suite: 'base',
    role: { en: 'Object container (no nesting)', zh: '独立对象容器（禁止嵌套）' },
  },
  'flex': {
    component: 'TxFlex',
    category: 'surface',
    suite: 'base',
    role: { en: '1D row/column layout with 4px steps', zh: '一维行列排布与 4px 间距' },
  },
  'grid': {
    component: 'TxGrid',
    category: 'surface',
    suite: 'base',
    role: { en: 'Responsive multi-column grid', zh: '等分与响应式多列栅格' },
  },
  'divider': {
    component: 'TxDivider',
    category: 'surface',
    suite: 'base',
    role: { en: '1px structural section hairline', zh: '1px 分区与列表分割线' },
  },
  'text': {
    component: 'TxText',
    category: 'display',
    suite: 'base',
    role: { en: '13–14px typography & truncation', zh: '13–14px 文本原语与溢出截断' },
  },
  'icon': {
    component: 'TxIcon',
    category: 'display',
    suite: 'base',
    role: { en: 'Aligned glyph & status icon host', zh: '统一图标渲染与基线对齐' },
  },
  'avatar': {
    component: 'TxAvatar',
    category: 'display',
    suite: 'base',
    role: { en: 'Subject avatar & stacked groups', zh: '主体头像与堆叠头像组' },
  },
  'status-badge': {
    component: 'TxStatusBadge',
    category: 'display',
    suite: 'base',
    role: { en: 'Color + icon + label status pill', zh: '色相+图标+文案三重状态胶囊' },
  },
  'tag': {
    component: 'TxTag',
    category: 'display',
    suite: 'base',
    role: { en: 'Metadata & removable taxonomy chip', zh: '分类元数据与可移除标签' },
  },
  'data-table': {
    component: 'TxDataTable',
    category: 'data',
    suite: 'base',
    role: { en: 'Structured table with skeleton load', zh: '结构化数据表与骨架屏首屏' },
  },
  'stat-card': {
    component: 'TxStatCard',
    category: 'data',
    suite: 'base',
    role: { en: 'Tabular-nums KPI display card', zh: '等宽数值 KPI 指标卡' },
  },
  'button': {
    component: 'TxButton',
    category: 'form',
    suite: 'base',
    role: { en: 'Native button action family', zh: '原生语义按钮动作家族' },
  },
  'form': {
    component: 'TxForm',
    category: 'form',
    suite: 'base',
    role: { en: 'Field validation & structured rows', zh: '表单校验与字段分组' },
  },
  'input': {
    component: 'TxInput',
    category: 'form',
    suite: 'base',
    role: { en: '14px text field with inset focus ring', zh: '14px 单行输入与内嵌聚焦环' },
  },
  'textarea': {
    component: 'TxTextarea',
    category: 'form',
    suite: 'base',
    role: { en: 'Multi-line text input with states', zh: '多行文本输入与状态校验' },
  },
  'select': {
    component: 'TxSelect',
    category: 'form',
    suite: 'base',
    role: { en: 'Refraction dropdown selector', zh: '默认琉光面板的单/多选下拉' },
  },
  'checkbox': {
    component: 'TxCheckbox',
    category: 'form',
    suite: 'base',
    role: { en: 'Independent boolean selection', zh: '独立或多选布尔勾选框' },
  },
  'radio': {
    component: 'TxRadioGroup',
    category: 'form',
    suite: 'base',
    role: { en: 'Mutually exclusive & segmented pick', zh: '互斥单选与分段选项组' },
  },
  'switch': {
    component: 'TxSwitch',
    category: 'form',
    suite: 'base',
    role: { en: 'Immediate binary setting toggle', zh: '即时生效的二元设置开关' },
  },
  'slider': {
    component: 'TxSlider',
    category: 'form',
    suite: 'base',
    role: { en: 'Continuous numeric range control', zh: '连续区间数值调节滑杆' },
  },
  'tabs': {
    component: 'TxTabs',
    category: 'navigation',
    suite: 'base',
    role: { en: 'In-view section switcher with glide', zh: '视图内滑动指示器分页切换' },
  },
  'sidebar-nav': {
    component: 'TxSidebarNav',
    category: 'navigation',
    suite: 'base',
    role: { en: 'Grouped vertical rail navigation', zh: '侧边栏分组导航轨' },
  },
  'dropdown-menu': {
    component: 'TxDropdownMenu',
    category: 'navigation',
    suite: 'base',
    role: { en: '90ms+90ms confirmed command menu', zh: '90ms+90ms 激活确认命令菜单' },
  },
  'command-palette': {
    component: 'TxCommandPalette',
    category: 'navigation',
    suite: 'pro',
    role: { en: 'Global Cmd+K command overlay', zh: '全局 ⌘K 快捷命令面板' },
  },
  'modal': {
    component: 'TxModal',
    category: 'overlay',
    suite: 'base',
    role: { en: 'Teleported refraction confirmation', zh: 'Teleport 琉光模态确认弹窗' },
  },
  'drawer': {
    component: 'TxDrawer',
    category: 'overlay',
    suite: 'base',
    role: { en: 'Side detail sheet with z-index stack', zh: '侧边详情抽屉与层级栈' },
  },
  'popover': {
    component: 'TxPopover',
    category: 'overlay',
    suite: 'base',
    role: { en: 'Anchored refraction floating card', zh: '锚定式琉光弹出卡片' },
  },
  'tooltip': {
    component: 'TxTooltip',
    category: 'overlay',
    suite: 'base',
    role: { en: 'Lightweight non-critical hover hint', zh: '轻量悬停短文本说明' },
  },
  'alert': {
    component: 'TxAlert',
    category: 'overlay',
    suite: 'base',
    role: { en: 'Persistent in-page semantic banner', zh: '页内持久语义提示横幅' },
  },
  'skeleton': {
    component: 'TxSkeleton',
    category: 'overlay',
    suite: 'base',
    role: { en: 'Layout-mirroring loading placeholder', zh: '布局镜像加载骨架屏' },
  },
  'empty-state': {
    component: 'TxEmptyState',
    category: 'overlay',
    suite: 'base',
    role: { en: 'Unified empty, search & retry view', zh: '统一空态、无结果与重试容器' },
  },
  'stream-text': {
    component: 'TxStreamText',
    category: 'ai',
    suite: 'ai',
    role: { en: 'Compositor-paced selectable stream', zh: '合成器节拍且可划选的流式文本' },
  },
  'stream-markdown': {
    component: 'TxStreamMarkdown',
    category: 'ai',
    suite: 'ai',
    role: { en: 'Streaming Markdown & code blocks', zh: '流式 Markdown 与代码块渲染' },
  },
  'tool-call-card': {
    component: 'TxToolCallCard',
    category: 'ai',
    suite: 'ai',
    role: { en: 'Reflow-free agent tool call trace', zh: '无回流折叠的智能体工具调用卡' },
  },
  'approval-card': {
    component: 'TxApprovalCard',
    category: 'ai',
    suite: 'ai',
    role: { en: 'Human-in-the-loop approval gate', zh: '人机协同审批与确认卡片' },
  },
}

function slugToComponentName(slug: string): string {
  const pascal = slug
    .split('-')
    .filter(Boolean)
    .map(part => part[0]!.toUpperCase() + part.slice(1))
    .join('')
  return `Tx${pascal}`
}

export const TDS_CORE_PRIMITIVES: readonly TdsCorePrimitiveItem[] = TDS_TOKENS.corePrimitives.modules.map((slug) => {
  const meta = PRIMITIVE_META[slug]
  return {
    slug,
    component: meta?.component ?? slugToComponentName(slug),
    category: meta?.category ?? 'surface',
    suite: meta?.suite ?? 'base',
    docPath: `/docs/dev/components/${slug}`,
    role: meta?.role ?? { en: `TDS Core primitive (${slug})`, zh: `TDS 核心原语（${slug}）` },
  }
})

export const TDS_CONVERGENCE_MAPPINGS: readonly TdsConvergenceMapping[] = TDS_TOKENS.convergence.mappings

export function parseHexColor(hex: string): Rgba | null {
  const normalized = hex.trim().toLowerCase()
  if (normalized === 'white')
    return [255, 255, 255, 1]
  if (normalized === 'black')
    return [0, 0, 0, 1]
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(normalized)
  if (!match)
    return null
  const digits = match[1]!
  if (digits.length === 3) {
    return [
      Number.parseInt(digits[0]! + digits[0]!, 16),
      Number.parseInt(digits[1]! + digits[1]!, 16),
      Number.parseInt(digits[2]! + digits[2]!, 16),
      1,
    ]
  }
  const r = Number.parseInt(digits.slice(0, 2), 16)
  const g = Number.parseInt(digits.slice(2, 4), 16)
  const b = Number.parseInt(digits.slice(4, 6), 16)
  const a = digits.length === 8 ? Number.parseInt(digits.slice(6, 8), 16) / 255 : 1
  return [r, g, b, a]
}

export function compositeOver(fg: Rgba, bg: Rgb, alphaOverride?: number): Rgb {
  const alpha = alphaOverride !== undefined ? fg[3] * alphaOverride : fg[3]
  return [
    fg[0] * alpha + bg[0] * (1 - alpha),
    fg[1] * alpha + bg[1] * (1 - alpha),
    fg[2] * alpha + bg[2] * (1 - alpha),
  ]
}

/** WCAG 2.1 sRGB relative luminance (IEC 61966-2-1 threshold 0.04045). */
export function relativeLuminance([r, g, b]: Rgb): number {
  const linearize = (channel: number) => {
    const s = channel / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b)
}

export function contrastRatioRgb(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

export function rgbToHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map(channel => Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, '0')).join('')}`
}

export function rgbaToCss([r, g, b, a]: Rgba): string {
  const rr = Math.round(r)
  const gg = Math.round(g)
  const bb = Math.round(b)
  if (a >= 0.999)
    return rgbToHex([rr, gg, bb])
  return `rgba(${rr}, ${gg}, ${bb}, ${Number(a.toFixed(3))})`
}

export function resolveColorExpression(
  expr: string,
  tokens: Record<string, string>,
  depth = 0,
): Rgba | null {
  if (depth > 8)
    return null
  const trimmed = expr.trim()

  if (trimmed.toLowerCase().startsWith('var(') && trimmed.endsWith(')')) {
    const inner = trimmed.slice(4, -1).trim()
    const commaIdx = inner.indexOf(',')
    const target = (commaIdx >= 0 ? inner.slice(0, commaIdx) : inner).trim()
    const fallback = commaIdx >= 0 ? inner.slice(commaIdx + 1).trim() : ''
    if (/^--[a-z0-9-]+$/i.test(target)) {
      if (target in tokens)
        return resolveColorExpression(tokens[target]!, tokens, depth + 1)
      if (fallback)
        return resolveColorExpression(fallback, tokens, depth + 1)
      return null
    }
  }

  if (trimmed.toLowerCase().startsWith('color-mix(') && trimmed.endsWith(')')) {
    const inner = trimmed.slice('color-mix('.length, -1).trim()
    const srgbPrefix = /^in\s+srgb\s*,/i.exec(inner)
    if (srgbPrefix) {
      const rest = inner.slice(srgbPrefix[0].length)
      let parenDepth = 0
      let splitIdx = -1
      for (let i = 0; i < rest.length; i++) {
        if (rest[i] === '(')
          parenDepth++
        else if (rest[i] === ')')
          parenDepth--
        else if (rest[i] === ',' && parenDepth === 0) {
          splitIdx = i
          break
        }
      }
      if (splitIdx > 0) {
        const left = rest.slice(0, splitIdx).trim()
        const right = rest.slice(splitIdx + 1).trim()
        const pctMatch = /(\d+(?:\.\d+)?)%$/.exec(left)
        if (pctMatch) {
          const c1Expr = left.slice(0, pctMatch.index).trim()
          const c1 = resolveColorExpression(c1Expr, tokens, depth + 1)
          const c2 = resolveColorExpression(right, tokens, depth + 1)
          if (!c1 || !c2)
            return null
          const w1 = Number.parseFloat(pctMatch[1]!) / 100
          const w2 = 1 - w1
          const outAlpha = c1[3] * w1 + c2[3] * w2
          if (outAlpha <= 0)
            return [0, 0, 0, 0]
          return [
            (c1[0] * c1[3] * w1 + c2[0] * c2[3] * w2) / outAlpha,
            (c1[1] * c1[3] * w1 + c2[1] * c2[3] * w2) / outAlpha,
            (c1[2] * c1[3] * w1 + c2[2] * c2[3] * w2) / outAlpha,
            outAlpha,
          ]
        }
      }
    }
  }

  return parseHexColor(trimmed)
}

/** Builds the complete effective token map for a theme ramp strictly from `tokens.json`. */
export function getEffectiveThemeTokens(theme: TdsThemeKey): Record<string, string> {
  const { light, dark, highContrastLight, highContrastDark } = TDS_TOKENS.themes
  switch (theme) {
    case 'light':
      return {
        ...light.tuffexReference,
        ...light.shell,
      }
    case 'dark':
      return {
        ...light.tuffexReference,
        ...dark.tuffexReference,
        ...light.shell,
        ...dark.shell,
      }
    case 'highContrastLight':
      return {
        ...light.tuffexReference,
        ...highContrastLight.tuffexResolved,
        ...light.shell,
        ...highContrastLight.shell,
      }
    case 'highContrastDark':
      return {
        ...light.tuffexReference,
        ...dark.tuffexReference,
        ...highContrastDark.tuffexResolved,
        ...light.shell,
        ...dark.shell,
        ...highContrastDark.shell,
      }
  }
}

export function getThemeSelector(theme: TdsThemeKey): string {
  return TDS_TOKENS.themes[theme].selector
}

const SWATCH_TOKEN_ORDER: readonly string[] = [
  '--shell-bg',
  '--shell-surface',
  '--shell-surface-2',
  '--shell-border',
  '--shell-border-strong',
  '--shell-text-primary',
  '--shell-text-regular',
  '--shell-text-secondary',
  '--shell-text-muted',
  '--shell-primary',
  '--shell-primary-soft',
  '--shell-on-primary',
  '--shell-success',
  '--shell-success-soft',
  '--shell-warning',
  '--shell-warning-soft',
  '--shell-danger',
  '--shell-danger-soft',
  '--shell-info',
  '--shell-info-soft',
]

export function getThemeRampSwatches(theme: TdsThemeKey): TdsSwatchEntry[] {
  const effective = getEffectiveThemeTokens(theme)
  const bgRgba = resolveColorExpression('var(--shell-bg)', effective) ?? [20, 20, 20, 1]
  const bgRgb: Rgb = [bgRgba[0], bgRgba[1], bgRgba[2]]

  const entries: TdsSwatchEntry[] = []
  for (const token of SWATCH_TOKEN_ORDER) {
    const rawValue = effective[token]
    if (!rawValue)
      continue
    const resolved = resolveColorExpression(rawValue, effective)
    if (!resolved)
      continue
    const composited = resolved[3] < 1 ? compositeOver(resolved, bgRgb) : ([resolved[0], resolved[1], resolved[2]] as Rgb)
    entries.push({
      token,
      rawValue,
      resolvedHex: rgbToHex(composited),
      resolvedCss: rgbaToCss(resolved),
      alpha: Number(resolved[3].toFixed(2)),
      isAlias: rawValue.startsWith('var('),
    })
  }
  return entries
}

export function classifyWcag(ratio: number, minRatio = 4.5): {
  grade: WcagGrade
  passAA: boolean
  passAAA: boolean
  passLarge: boolean
  meetsContract: boolean
} {
  const passAAA = ratio >= TDS_TOKENS.contrastContracts.enhancedAAA
  const passAA = ratio >= TDS_TOKENS.contrastContracts.normalTextAA
  const passLarge = ratio >= TDS_TOKENS.contrastContracts.largeTextAndUiAA
  const grade: WcagGrade = passAAA ? 'AAA' : passAA ? 'AA' : passLarge ? 'AA Large' : 'Fail'
  return {
    grade,
    passAA,
    passAAA,
    passLarge,
    meetsContract: ratio >= minRatio,
  }
}

function resolvePairColors(
  pair: TdsContrastPairSpec,
  effective: Record<string, string>,
  surfaceMode: TdsSurfaceMode,
  backdropKey: TdsBackdropKey,
): { fgRgb: Rgb, bgRgb: Rgb } {
  const wallpaperRgb = TDS_BACKDROPS[backdropKey].rgb
  const bgRgba = resolveColorExpression(`var(${pair.bg})`, effective) ?? [20, 20, 20, 1]

  let effectiveBg: Rgb
  if (bgRgba[3] < 1) {
    const baseToken = pair.backdrop ?? '--shell-bg'
    const baseRgba = resolveColorExpression(`var(${baseToken})`, effective) ?? [20, 20, 20, 1]
    const surfaceBase: Rgb = surfaceMode === 'refraction'
      ? compositeOver(baseRgba, wallpaperRgb, TDS_REFRACTION_OPACITY)
      : [baseRgba[0], baseRgba[1], baseRgba[2]]
    effectiveBg = compositeOver(bgRgba, surfaceBase)
  }
  else if (surfaceMode === 'refraction' && (pair.bg === '--shell-bg' || pair.bg === '--shell-surface' || pair.bg === '--shell-surface-2')) {
    effectiveBg = compositeOver(bgRgba, wallpaperRgb, TDS_REFRACTION_OPACITY)
  }
  else {
    effectiveBg = [bgRgba[0], bgRgba[1], bgRgba[2]]
  }

  const fgRgba = resolveColorExpression(`var(${pair.fg})`, effective) ?? [255, 255, 255, 1]
  const effectiveFg: Rgb = fgRgba[3] < 1
    ? compositeOver(fgRgba, effectiveBg)
    : [fgRgba[0], fgRgba[1], fgRgba[2]]

  return { fgRgb: effectiveFg, bgRgb: effectiveBg }
}

/**
 * Evaluates all verified WCAG 2.1 contrast pairs from `tokens.json` for a given theme,
 * comparing opaque (1.0) vs Refraction glass (0.85) composited over Light (#e8e8ec) or Dark (#0b0b0d) backdrops.
 */
export function evaluateRefractionContrast(
  theme: TdsThemeKey,
  surfaceMode: TdsSurfaceMode,
  backdropKey: TdsBackdropKey,
): TdsContrastEvaluation[] {
  const effective = getEffectiveThemeTokens(theme)
  const pairs = TDS_TOKENS.contrastContracts.verifiedPairs[theme] as readonly TdsContrastPairSpec[]

  return pairs.map((pair) => {
    const opaqueColors = resolvePairColors(pair, effective, 'opaque', backdropKey)
    const opaqueRatio = contrastRatioRgb(opaqueColors.fgRgb, opaqueColors.bgRgb)

    const activeColors = surfaceMode === 'opaque'
      ? opaqueColors
      : resolvePairColors(pair, effective, 'refraction', backdropKey)
    const ratio = contrastRatioRgb(activeColors.fgRgb, activeColors.bgRgb)
    const classification = classifyWcag(ratio, pair.minRatio)

    return {
      id: pair.id,
      fgToken: pair.fg,
      bgToken: pair.bg,
      fgHex: rgbToHex(activeColors.fgRgb),
      bgHex: rgbToHex(activeColors.bgRgb),
      fgCss: rgbToHex(activeColors.fgRgb),
      bgCss: rgbToHex(activeColors.bgRgb),
      ratio: Number(ratio.toFixed(2)),
      opaqueRatio: Number(opaqueRatio.toFixed(2)),
      delta: Number((ratio - opaqueRatio).toFixed(2)),
      minRatio: pair.minRatio,
      ...classification,
    }
  })
}

export function filterCorePrimitives(
  category: TdsPrimitiveCategory | 'all',
  query: string,
): TdsCorePrimitiveItem[] {
  const needle = query.trim().toLowerCase()
  return TDS_CORE_PRIMITIVES.filter((item) => {
    if (category !== 'all' && item.category !== category)
      return false
    if (!needle)
      return true
    return (
      item.slug.toLowerCase().includes(needle)
      || item.component.toLowerCase().includes(needle)
      || item.suite.toLowerCase().includes(needle)
      || item.role.en.toLowerCase().includes(needle)
      || item.role.zh.toLowerCase().includes(needle)
    )
  })
}
