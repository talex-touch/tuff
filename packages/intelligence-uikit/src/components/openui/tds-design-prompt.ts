/**
 * Compact TDS Visual Craft Prompt for standalone HTML/SVG design artifacts.
 *
 * Kept strictly under 1200 UTF-8 bytes and built once per process so AI visual generation
 * turns stay token-frugal while adhering to the single-source TDS catalog
 * (`docs/design/tds/tokens.json`).
 */

/** Hard UTF-8 byte budget for the compact TDS design artifact prompt. */
export const TDS_DESIGN_PROMPT_MAX_BYTES = 1200

const TDS_DESIGN_ARTIFACT_PROMPT_LINES = [
  '[TDS Visual Artifact Contract]',
  'When generating standalone HTML/SVG UI mockups, prototypes, or visual previews:',
  '1. Tokens: Use `--shell-bg`, `--shell-surface`, `--shell-border`, `--shell-text-primary`, `--shell-text-secondary`, `--shell-primary` (with fallbacks). Dark neutral canvas is `#141414` (never `#000000`); light canvas is `#ffffff`.',
  '2. Offline-safe: Zero external URLs (`http://`, `https://`, CDN fonts/icons/images). Use inline `<svg>` and system font stacks only.',
  '3. Layout & contrast: Never use `100vh`/`100vw`/`h-screen` in fixed canvas frames; size with `100%`, flex, or grid. Enforce WCAG AA >= 4.5:1 text contrast, 13-14px body text, and `font-variant-numeric: tabular-nums` for numbers.',
  '4. Anti-slop craft: No neon/rainbow gradients, `background-clip: text`, heavy blur/glow shadows, thick borders (`border-width >= 3px`; use 1px hairlines), nested Card-in-Card, emoji icons, or fake placeholder metrics. Never convey status by color alone.',
] as const

let cachedTdsDesignArtifactPrompt: string | null = null

/**
 * Returns the cached, compact (< 1200 bytes) TDS Visual Craft Prompt for AI HTML/SVG generation.
 */
export function buildTdsDesignArtifactPrompt(): string {
  if (cachedTdsDesignArtifactPrompt === null) {
    cachedTdsDesignArtifactPrompt = TDS_DESIGN_ARTIFACT_PROMPT_LINES.join('\n')
  }
  return cachedTdsDesignArtifactPrompt
}

/** Process-cached compact TDS visual artifact prompt string. */
export const tdsDesignArtifactPrompt: string = buildTdsDesignArtifactPrompt()

const INTENT_SAMPLE_MAX_CHARS = 4000
const INTENT_EDGE_SLICE_CHARS = 2000

const STRONG_EN_DESIGN_ARTIFACT_RE = new RegExp(
  [
    '\\b(?:ui|ux|web|app|page|screen|mobile|desktop)\\s*(?:mockup|mock-?up|wireframe|prototype|design\\s+draft|visual\\s+preview|ui\\s+preview)\\b',
    '\\b(?:mockup|mock-?up|wireframe|design\\s+draft|landing\\s+page|pricing\\s+page|portfolio\\s+page|hero\\s+section|tds\\s+visual\\s+lint)\\b',
    '\\b(?:standalone|interactive|responsive|single-file)\\s+(?:html|svg)\\b',
    '\\b(?:html|svg)\\s+(?:mockup|mock-?up|prototype|preview|page|webpage|dashboard|card|banner|poster|diagram|flowchart|chart|icon|logo|illustration|template|artifact|draft|layout|ui)\\b',
    '\\b(?:dashboard|login|signup|sign-up|settings|profile|checkout|onboarding)\\s+(?:ui|page|screen|mockup|mock-?up|prototype|wireframe|preview|layout)\\b',
  ].join('|'),
  'i',
)

const STRONG_ZH_DESIGN_ARTIFACT_RE =
  /(?:高保真原型|界面原型|交互原型|产品原型|网页原型|原型图|设计稿|视觉稿|线框图|页面草图|落地页|着陆页|引导页|登录页|注册页|定价页|官网首页|个人主页|数据看板|页面预览|网页预览|前端原型|单页原型|UI\s*设计|界面设计|网页设计|TDS\s*视觉检查)/i

const EN_CREATE_VERB_RE =
  /\b(?:build|create|make|design|draw|draft|generate|render|craft|sketch|redesign|compose|prototype|code|write)\b/gi

const EN_VISUAL_TARGET_RE =
  /\b(?:html|svg|webpage|web\s+page|ui|user\s+interface|dashboard|prototype|mockup|mock-?up|wireframe|infographic|diagram|flowchart|illustration|poster|banner|logo|icon|landing\s+page|card\s+layout|pricing\s+card|settings\s+screen|mobile\s+screen|app\s+screen)\b/i

const EN_NON_VISUAL_INTERVENING_RE =
  /\b(?:parse|parsing|parser|scrape|scraping|scraper|strip|stripping|escape|escaping|sanitize|sanitizing|extract|extracting|decode|encode|tokenize|serialize|regex|regexp|test|tests|spec|unit|vitest|jest|playwright|api|endpoint|query|sql|schema|migration|script|cli|python|bash|shell)\b/i

const ZH_CREATE_VERB_RE =
  /(?:做|画|写|生成|设计|创建|构建|制作|搭建|重绘|改版|输出|渲染|预览)/g

const ZH_VISUAL_TARGET_RE =
  /(?:HTML|SVG|网页|页面|前端页面|界面|看板|仪表盘|原型|草图|流程图|架构图|时序图|信息图|海报|Banner|卡片|弹窗|侧边栏|导航栏|图标|UI)/i

const ZH_NON_VISUAL_INTERVENING_RE =
  /(?:解析|抓取|爬取|转义|清洗|提取|正则|单元测试|测试用例|接口|数据库|脚本|后端|函数|算法)/

function sliceIntentSample(text: string): string {
  const trimmed = text.trim()
  if (trimmed.length <= INTENT_SAMPLE_MAX_CHARS)
    return trimmed
  return `${trimmed.slice(0, INTENT_EDGE_SLICE_CHARS)}\n${trimmed.slice(-INTENT_EDGE_SLICE_CHARS)}`
}

function hasVerbTargetPair(
  text: string,
  verbRe: RegExp,
  targetRe: RegExp,
  excludedBetweenRe: RegExp,
  clauseBoundaryRe: RegExp,
  maxWindowChars: number,
): boolean {
  verbRe.lastIndex = 0
  let verbMatch = verbRe.exec(text)
  while (verbMatch !== null) {
    const start = verbMatch.index + verbMatch[0].length
    const rawWindow = text.slice(start, start + maxWindowChars)
    const boundary = clauseBoundaryRe.exec(rawWindow)
    const clause = boundary ? rawWindow.slice(0, boundary.index) : rawWindow
    const targetMatch = targetRe.exec(clause)
    if (targetMatch) {
      const between = clause.slice(0, targetMatch.index)
      if (!excludedBetweenRe.test(between))
        return true
    }
    verbMatch = verbRe.exec(text)
  }
  return false
}

/**
 * Lightweight English + Chinese intent detector for standalone HTML/SVG UI/design artifact asks.
 *
 * Returns `false` for normal chat, git, math, and general coding turns so non-design turns pay
 * zero extra system-prompt tokens.
 */
export function shouldInjectTdsDesignPrompt(userText: string): boolean {
  if (typeof userText !== 'string')
    return false
  const sample = sliceIntentSample(userText)
  if (!sample)
    return false

  if (STRONG_EN_DESIGN_ARTIFACT_RE.test(sample) || STRONG_ZH_DESIGN_ARTIFACT_RE.test(sample))
    return true

  if (
    hasVerbTargetPair(
      sample,
      EN_CREATE_VERB_RE,
      EN_VISUAL_TARGET_RE,
      EN_NON_VISUAL_INTERVENING_RE,
      /[.?!;\n]/,
      56,
    )
  ) {
    return true
  }

  if (
    hasVerbTargetPair(
      sample,
      ZH_CREATE_VERB_RE,
      ZH_VISUAL_TARGET_RE,
      ZH_NON_VISUAL_INTERVENING_RE,
      /[。！？；\n]/,
      28,
    )
  ) {
    return true
  }

  return false
}
