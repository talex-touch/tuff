import antfu from '@antfu/eslint-config'

export default antfu(
  {
    vue: true,
    typescript: true,
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/*.old.*',
      '**/*.old.*.*',
      'init.json',
    ],
  },
  {
    rules: {
      'no-console': 'off',
      'no-undef': 'off',
      'no-prototype-builtins': 'off',
      'no-restricted-syntax': 'off',
      'no-unused-vars': 'off',
      'prefer-rest-params': 'off',
      'style/max-statements-per-line': 'off',
      'style/no-mixed-spaces-and-tabs': 'off',
      'style/no-tabs': 'off',
      'ts/no-this-alias': 'off',
      'ts/no-unsafe-function-type': 'off',
      'unused-imports/no-unused-vars': 'off',
      'vue/no-export-in-script-setup': 'off',
      'vue/no-parsing-error': 'off',
      'vue/no-unused-vars': 'off',
      'vue/no-use-v-if-with-v-for': 'off',
      'vue/require-v-for-key': 'off',
      'vue/require-valid-default-prop': 'off',
    },
  },
)
