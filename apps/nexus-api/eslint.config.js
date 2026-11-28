// @ts-check
import antfu from '@antfu/eslint-config'

export default antfu(
  {
    ignores: ['.nitro/**', '.output/**', 'dist/**'],
    vue: false,
    unocss: false,
    pnpm: false,
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
).append({
  rules: {
    'antfu/if-newline': 'off',
    'import/consistent-type-specifier-style': 'off',
    'no-undef': 'off',
    'no-console': 'off',
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
    'unused-imports/no-unused-vars': 'off',
    'prefer-const': 'off',
  },
})
