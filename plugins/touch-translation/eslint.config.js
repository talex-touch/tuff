import antfu from '@antfu/eslint-config'

export default antfu(
  {
    unocss: true,
    formatters: false,
    stylistic: false,
    unicorn: false,
    test: false,
    markdown: false,
    jsonc: false,
    yaml: false,
    toml: false,
    regexp: false,
    lessOpinionated: true,
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      // Prelude / generated / docs artifacts in this plugin folder
      'index.js',
      'index.html',
      'README.md',
      'src/pages/README.md',
    ],
  },
  {
    rules: {
      'antfu/if-newline': 'off',
      'no-undef': 'off',
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
      'no-unused-vars': 'off',
      'perfectionist/sort-imports': 'off',
      'ts/no-unused-vars': 'off',
      'ts/no-use-before-define': 'off',
      'unocss/order': 'off',
      'unocss/order-attributify': 'off',
      'unused-imports/no-unused-vars': 'off',
      'vue/valid-template-root': 'off',
    },
  },
)
