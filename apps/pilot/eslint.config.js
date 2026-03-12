import antfu from '@antfu/eslint-config'

export default antfu({
  vue: true,
  typescript: true,
}, {
  rules: {
    'no-console': 'off',
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
  },
})
