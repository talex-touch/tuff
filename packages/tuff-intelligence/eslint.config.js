import antfu from '@antfu/eslint-config'

export default antfu(
  {
    type: 'lib',
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
      'no-cond-assign': 'off',
      'perfectionist/sort-exports': 'off',
      'perfectionist/sort-imports': 'off',
      'ts/explicit-function-return-type': 'off',
      'ts/method-signature-style': 'off',
    },
  },
)
