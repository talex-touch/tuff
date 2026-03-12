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
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.type='Identifier'][callee.name='fetch']",
          message: 'Direct fetch is restricted. Use @talex-touch/utils/network.',
        },
      ],
      'perfectionist/sort-imports': 'off',
      'ts/ban-ts-comment': 'off',
      'ts/no-require-imports': 'off',
    },
  },
)
