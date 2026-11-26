import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  defineConfig,
  presetAttributify,
  presetIcons,
  presetWind,
  transformerDirectives,
  transformerVariantGroup,
} from 'unocss'
import presetWebFonts from '@unocss/preset-web-fonts'
import { MARKDOWN_EDITOR_ICON_CLASSES } from '../../packages/tuffex/packages/components/src/markdown-editor/src/toolbar-icons'

const markdownEditorToolbarIcons = fileURLToPath(
  new URL('../../packages/tuffex/packages/components/src/markdown-editor/src/toolbar-icons.ts', import.meta.url),
)

const appRootDir = fileURLToPath(new URL('./app', import.meta.url))
const ICON_TOKEN_RE = /\bi-(?:carbon|logos)-[a-z0-9-]+\b/g
const UNO_PIPELINE_FILE_RE = /\.(?:vue|svelte|[jt]sx|vine\.ts|mdx?|astro|elm|php|phtml|marko|html)$/
const UNO_DATA_MODULE_RE = /(?:^|\/)(?:data|composables|utils)\/.*\.ts$/

/**
 * Classifies icon tokens that appear exclusively inside `app/components/content/demos/*`.
 * Those icons move into their own UnoCSS layer (`demo-icons`, imported lazily by
 * `app/plugins/unocss-icons.client.ts` only on `/docs/dev/*`), keeping ~100 KB of demo-only
 * SVG masks out of the global `__uno_icons.css` sheet downloaded by public landing/store/guide pages.
 */
function collectDemoOnlyIconClasses(): Set<string> {
  if (!existsSync(appRootDir))
    return new Set()

  const demoIcons = new Set<string>()
  const appIcons = new Set<string>(MARKDOWN_EDITOR_ICON_CLASSES)

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry.startsWith('.'))
        continue
      const fullPath = path.join(dir, entry)
      const stats = statSync(fullPath)
      if (stats.isDirectory()) {
        walk(fullPath)
        continue
      }
      const rel = path.relative(appRootDir, fullPath).replace(/\\/g, '/')
      if (!UNO_PIPELINE_FILE_RE.test(rel) && !UNO_DATA_MODULE_RE.test(rel))
        continue
      const source = readFileSync(fullPath, 'utf8')
      const target = rel.startsWith('components/content/demos/') ? demoIcons : appIcons
      for (const match of source.matchAll(ICON_TOKEN_RE))
        target.add(match[0])
    }
  }

  walk(appRootDir)
  for (const token of appIcons)
    demoIcons.delete(token)
  return demoIcons
}

const demoOnlyIconClasses = collectDemoOnlyIconClasses()

const useWebFonts = process.env.NUXT_DISABLE_WEB_FONTS !== 'true'
  && process.env.UNOCSS_WEBFONTS === 'true'

export default defineConfig({
  // Block `i-cib-*` so the retired `cib` brand collection can never emit CSS back into the
  // global icons stylesheet even before `@iconify-json/cib` is uninstalled at integration.
  blocklist: [/^m\[pascalCase\(component\)\]$/, /^i-cib-/],
  content: {
    pipeline: {
      // Uno's default pipeline only scans template-ish files, so icon classes
      // declared in plain .ts data modules (SDK cards, search index, plugin
      // categories) were never extracted and rendered as empty tiles. The first
      // entry restores Uno's default set; the second adds those modules.
      include: [
        /\.(vue|svelte|[jt]sx|vine\.ts|mdx?|astro|elm|php|phtml|marko|html)($|\?)/,
        /\/app\/(data|composables|utils)\/.*\.ts($|\?)/,
      ],
    },
  },
  // The editor's own table, imported rather than copied so the two cannot
  // drift; `configDeps` re-reads it when it changes.
  configDeps: [markdownEditorToolbarIcons],
  /*
   * TxMarkdownEditor draws its toolbar with Carbon icons, by class name, from
   * its own icon table. In dev Nexus resolves tuffex from `dist/*.js`, which
   * the pipeline above does not scan, and no Nexus file names these icons, so
   * the toolbar rendered fourteen grey squares: the preflight below sizes an
   * `i-*` box and TxIcon fills it with `currentColor`, waiting for a mask rule
   * that never came.
   */
  safelist: [...MARKDOWN_EDITOR_ICON_CLASSES],
  shortcuts: [
    // No icon aliases here. The set that used to live at this spot redirected
    // valid carbon names onto `ri`, a collection this app has never installed,
    // to share one glyph between several names and keep the entry CSS small.
    // Uno emits nothing for a collection it cannot resolve, so the aliases did
    // not shrink anything — they turned working icons into 0x0 blanks
    // (`i-carbon-data-vis-1` on /dashboard/privacy, measured).
    ['btn', 'px-4 py-1 rounded inline-block bg-teal-600 text-white cursor-pointer hover:bg-teal-700 disabled:cursor-default disabled:bg-gray-600 disabled:opacity-50'],
    ['icon-btn', 'inline-block cursor-pointer select-none opacity-75 transition duration-200 ease-in-out hover:opacity-100 hover:text-teal-600'],
    ['apple-card', 'rounded-2xl border border-black/[0.04] bg-white/80 backdrop-blur-xl shadow-sm dark:border-white/[0.06] dark:bg-white/[0.04]'],
    ['apple-card-lg', 'rounded-3xl border border-black/[0.04] bg-white/80 backdrop-blur-xl shadow-sm dark:border-white/[0.06] dark:bg-white/[0.04]'],
    ['apple-section-title', 'text-[11px] font-semibold uppercase tracking-wider text-black/40 dark:text-white/40'],
    ['apple-body', 'text-[15px] leading-relaxed text-black/70 dark:text-white/70'],
    ['apple-heading-lg', 'text-3xl font-bold tracking-tight text-black dark:text-white sm:text-4xl'],
    ['apple-heading-md', 'text-xl font-semibold tracking-tight text-black dark:text-white'],
    ['apple-heading-sm', 'text-base font-semibold text-black dark:text-white'],
  ],
  theme: {
    colors: {
      primary: '#1BB5F4',
      dark: '#121212',
      light: '#FAFAFA',
    },
  },
  /*
   * `primary` above is a second colour system running beside the tuffex tokens:
   * UnoCSS compiles it to a literal, so it never saw the high-contrast palette
   * tuffex ships behind `prefers-contrast: more`. Measured, `.text-primary` sat
   * at 2.34:1 on white on every dashboard page and stayed there with high
   * contrast switched on, while everything token-driven moved.
   *
   * Only the text colour is redirected, and only when the reader has asked for
   * more contrast — the brand cyan is untouched by default. The replacement is
   * the design system's own high-contrast primary rather than a value picked
   * here. Backgrounds keep the brand: `bg-primary/12` is a tint behind other
   * text, not a contrast surface of its own.
   */
  preflights: [
    {
      /*
       * The icons layer loads after mount (`app/plugins/unocss-icons.client.ts`), so on the
       * server-rendered page an `i-*` element has no rule of its own yet. This gives every such
       * box the size the icon rule will give it (`scale: 1.2` below → 1.2em), so the glyphs paint
       * in without shifting the layout around them. Explicit `w-*`/`h-*` utilities still win:
       * they live in a later layer, and the icon rules themselves carry no specificity (see
       * `postprocess` below).
       */
      getCSS: () => `[class^="i-"],[class*=" i-"]{width:1.2em;height:1.2em}`,
    },
    {
      getCSS: () => `
        html.contrast .text-primary,
        html.dark.contrast .text-primary {
          color: var(--tx-color-primary);
        }
        @media (prefers-contrast: more) {
          html:not([data-tx-contrast='normal']) .text-primary {
            color: var(--tx-color-primary);
          }
        }
      `,
    },
  ],
  /*
   * Icon rules carry no specificity. The icons layers ship as their own stylesheets, appended to
   * `<head>` once the app has resolved, so in the cascade they come after every other sheet. At
   * class specificity that let an icon rule's `color:inherit` and `width:1.2em` beat the
   * `text-amber-600` or `w-4` on the same element — utilities the single-sheet order used to
   * let win, because `icons` sorts before `default`. `:where()` settles it for good: any classed
   * rule on the host wins, whichever sheet arrives last. Both output modes are covered: mask
   * icons carry `--un-icon`, multi-colour ones (`i-logos-*`) an SVG `background`.
   *
   * Demo-only icons are routed into `demo-icons` so non-docs pages never download them.
   */
  postprocess: [
    (util) => {
      const isIcon = util.entries.some(([property, value]) => property === '--un-icon'
        || (property === 'background' && typeof value === 'string' && value.startsWith('url("data:image/svg+xml')))
      if (isIcon) {
        const bareSelector = util.selector.startsWith('.') ? util.selector.slice(1) : util.selector
        if (demoOnlyIconClasses.has(bareSelector))
          util.layer = 'demo-icons'
        util.selector = `:where(${util.selector})`
      }
    },
  ],
  presets: [
    presetWind(),
    presetAttributify({ prefixedOnly: true }),
    presetIcons({
      scale: 1.2,
      collections: {
        carbon: () => import('@iconify-json/carbon/icons.json', { with: { type: 'json' } }).then(m => m.default),
        logos: () => import('@iconify-json/logos/icons.json', { with: { type: 'json' } }).then(m => m.default),
      },
    }),
    presetWebFonts({
      provider: useWebFonts ? 'google' : 'none',
      fonts: {
        sans: 'DM Sans',
        serif: 'DM Serif Display',
        mono: 'DM Mono',
      },
    }),
  ],
  transformers: [
    transformerDirectives(),
    transformerVariantGroup(),
  ],
})
