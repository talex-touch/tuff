import antfu from '@antfu/eslint-config'

export default antfu(
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/release/**',
      '**/.cache/**',
      '**/.temp/**',
      '**/.nuxt/**',
      '**/.output/**',
      '**/.wrangler/**',
      '**/node_modules/**',
      '**/*.min.js',
      'scripts/**',
      'apps/core-app/scripts/**',
      'apps/core-app/electron.vite.config.*.mjs',
      'plugins/**',
      'apps/.workflow/**',
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
  {
    files: ['scripts/**', 'plugins/**', 'apps/.workflow/**'],
    rules: {
      'no-console': 'off',
    },
  },
)
