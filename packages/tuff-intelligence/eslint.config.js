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
      'perfectionist/sort-exports': 'off',
      'perfectionist/sort-imports': 'off',
      'ts/explicit-function-return-type': 'off',
      'ts/method-signature-style': 'off',
    },
  },
)
