// @ts-check
import antfu from '@antfu/eslint-config'

// Mirrors the other official plugins (see touch-translation): the standalone repo enabled the
// `pnpm` and `jsonc` rule sets, which demand a workspace catalog entry for every dependency.
// Plugin packages in this monorepo pin versions directly, so those rule sets are off here too
// rather than this one plugin diverging.
export default antfu(
  {
    unocss: true,
    formatters: false,
    jsonc: false,
    pnpm: false,
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      'index.js',
      'index.html',
      'src/auto-imports.d.ts',
      'src/components.d.ts',
      'src/typed-router.d.ts',
    ],
  },
  {
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'axios',
              message: 'Direct axios usage is restricted. Use @talex-touch/utils/network.',
            },
          ],
        },
      ],
    },
  },
)
