import antfu from '@antfu/eslint-config'

export default antfu(
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/release/**',
      '**/.cache/**',
      '**/.temp/**',
      '**/node_modules/**',
      '**/*.min.js',
      'apps/core-app/tuff/**',
      'apps/core-app/.electron-builder-cache/**',
    ],
  },
  {
    rules: {
      '@typescript-eslint/no-this-alias': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
)
