import antfu from '@antfu/eslint-config'

export default antfu(
  {
    type: 'lib',
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
      'import/consistent-type-specifier-style': 'off',
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'axios',
              message: 'Direct axios usage is restricted. Use injected fetcher or shared network client.',
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.type='Identifier'][callee.name='fetch']",
          message: 'Direct fetch is restricted. Use injected fetcher or shared network client.',
        },
      ],
      'perfectionist/sort-exports': 'off',
      'perfectionist/sort-imports': 'off',
      'ts/explicit-function-return-type': 'off',
      'ts/no-empty-object-type': 'off',
      'vue/block-order': 'off',
      'vue/require-default-prop': 'off',
    },
  },
)
