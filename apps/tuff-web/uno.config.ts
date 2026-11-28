import {
  defineConfig,
  presetAttributify,
  presetIcons,
  presetWind,
  transformerDirectives,
  transformerVariantGroup,
} from 'unocss'

export default defineConfig({
  blocklist: [/^m\[pascalCase\(component\)\]$/, /^i-cib-/, /^i-twemoji-/],
  content: {
    pipeline: {
      include: [
        /\/apps\/tuff-web\/(?:app|content)\/.*\.(?:vue|[jt]sx?|md[cx]?|html)($|\?)/,
        /\/(?:app|content)\/.*\.(?:vue|md[cx]?|html)($|\?)/,
      ],
      exclude: [
        /\/apps\/nexus\//,
        /\/apps\/tuffex-docs\//,
        /\/node_modules\//,
        /\/\.output\//,
        /\/\.dist-cf\//,
      ],
    },
  },
  shortcuts: [
    ['btn', 'px-4 py-1 rounded inline-block bg-teal-600 text-white cursor-pointer hover:bg-teal-700 disabled:cursor-default disabled:bg-gray-600 disabled:opacity-50'],
    ['icon-btn', 'inline-block cursor-pointer select-none opacity-75 transition duration-200 ease-in-out hover:opacity-100 hover:text-teal-600'],
    ['apple-card', 'rounded-2xl border border-black/[0.04] bg-white/80 shadow-sm dark:border-white/[0.06] dark:bg-white/[0.04]'],
    ['apple-card-lg', 'rounded-3xl border border-black/[0.04] bg-white/80 shadow-sm dark:border-white/[0.06] dark:bg-white/[0.04]'],
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
  preflights: [
    {
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
  postprocess: [
    (util) => {
      const isIcon = util.entries.some(([property, value]) => property === '--un-icon'
        || (property === 'background' && typeof value === 'string' && value.startsWith('url("data:image/svg+xml')))
      if (isIcon)
        util.selector = `:where(${util.selector})`
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
  ],
  transformers: [
    transformerDirectives(),
    transformerVariantGroup(),
  ],
})
