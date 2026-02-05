// @ts-check
import antfu from '@antfu/eslint-config'
import nuxt from './.nuxt/eslint.config.mjs'

export default antfu(
  {
    unocss: true,
    pnpm: true,
    formatters: false,
    stylistic: false,
    markdown: false,
    jsonc: false,
    yaml: false,
    toml: false,
    regexp: false,
    unicorn: false,
    test: false,
    lessOpinionated: true,
  },
)
  .append(nuxt())
  .append({
    rules: {
      'antfu/if-newline': 'off',
      'import/consistent-type-specifier-style': 'off',
      'no-undef': 'off',
      'no-console': 'off',
      'no-alert': 'off',
      'no-unused-vars': 'off',
      'node/prefer-global/process': 'off',
      'object-shorthand': 'off',
      'perfectionist/sort-exports': 'off',
      'perfectionist/sort-imports': 'off',
      'perfectionist/sort-named-exports': 'off',
      'perfectionist/sort-named-imports': 'off',
      'prefer-template': 'off',
      'ts/no-unused-vars': 'off',
      'ts/no-use-before-define': 'off',
      'ts/no-non-null-asserted-optional-chain': 'off',
      'unocss/order': 'off',
      'unocss/order-attributify': 'off',
      'unused-imports/no-unused-vars': 'off',
      'vue/block-order': 'off',
      'vue/custom-event-name-casing': 'off',
      'vue/html-indent': 'off',
      'vue/no-unused-refs': 'off',
      'vue/no-unused-vars': 'off',
      'vue/no-multiple-template-root': 'off',
      'vue/prefer-separate-static-class': 'off',
      'vue/require-v-for-key': 'off',
      'vue/valid-v-slot': 'off',
      'prefer-const': 'off',
    },
  })
  .append({
    files: ['app/**/*.{ts,vue,js}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "UnaryExpression[operator='typeof'][argument.name='window']",
          message: 'Use hasWindow() from @talex-touch/utils/env instead of typeof window.',
        },
        {
          selector: "UnaryExpression[operator='typeof'][argument.name='document']",
          message: 'Use hasDocument() from @talex-touch/utils/env instead of typeof document.',
        },
        {
          selector: "UnaryExpression[operator='typeof'][argument.name='navigator']",
          message: 'Use hasNavigator() from @talex-touch/utils/env instead of typeof navigator.',
        },
      ],
    },
  })
