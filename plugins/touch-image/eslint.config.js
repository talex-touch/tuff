import antfu from '@antfu/eslint-config'

export default antfu(
  {
    vue: true,
    typescript: true,
    stylistic: false,
    regexp: false,
    lessOpinionated: true,
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
    ],
  },
  {
    rules: {
      'perfectionist/sort-imports': 'off',
      'ts/ban-ts-comment': 'off',
      'ts/no-require-imports': 'off',
    },
  },
)
