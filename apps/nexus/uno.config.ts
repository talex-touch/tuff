import { createLocalFontProcessor } from '@unocss/preset-web-fonts/local'
import {
  defineConfig,
  presetAttributify,
  presetIcons,
  presetTypography,
  presetWebFonts,
  presetWind,
  transformerDirectives,
  transformerVariantGroup,
} from 'unocss'

const useWebFonts = process.env.NUXT_DISABLE_WEB_FONTS !== 'true'
  && (process.env.NODE_ENV === 'production' || process.env.UNOCSS_WEBFONTS === 'true')

export default defineConfig({
  blocklist: [/^m\[pascalCase\(component\)\]$/],
  shortcuts: [
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
  presets: [
    presetWind(),
    presetAttributify(),
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
      ...(useWebFonts ? { processors: createLocalFontProcessor() } : {}),
    }),
  ],
  transformers: [
    transformerDirectives(),
    transformerVariantGroup(),
  ],
})
