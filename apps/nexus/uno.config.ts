import {
  defineConfig,
  presetAttributify,
  presetIcons,
  presetTypography,
  presetWind,
  transformerDirectives,
  transformerVariantGroup,
} from 'unocss'
import presetWebFonts from '@unocss/preset-web-fonts'

const useWebFonts = process.env.NUXT_DISABLE_WEB_FONTS !== 'true'
  && process.env.UNOCSS_WEBFONTS === 'true'

export default defineConfig({
  blocklist: [/^m\[pascalCase\(component\)\]$/],
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
  presets: [
    presetWind(),
    presetAttributify({ prefixedOnly: true }),
    presetIcons({
      scale: 1.2,
    }),
    presetTypography(),
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
