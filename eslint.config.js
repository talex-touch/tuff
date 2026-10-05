import antfu from '@antfu/eslint-config'

export default antfu(
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/release/**',
      '**/.cache/**',
      '**/.temp/**',
      '**/*.tsbuildinfo',
      '**/.eslintcache',
      '.husky/**',
      '.kiro/**',
      '.serena/**',
      // Vendored Comet bundles are installed from the pinned CLI, not maintained source.
      '.agents/skills/comet*/**',
      '.claude/skills/comet*/**',
      '.omp/skills/comet*/**',
      '.omp/hooks/pre/comet-hook-router.ts',
      // Frozen pre-cutover records retain their original research probes as evidence.
      'docs/engineering/workflow/handoffs/**',
      '**/.nuxt/**',
      '**/.output/**',
      '**/.wrangler/**',
      '**/node_modules/**',
      '**/*.min.js',
      'apps/core-app/scripts/**',
      'apps/core-app/electron.vite.config.*.mjs',
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
      '@typescript-eslint/no-unused-vars': 'off',
      'no-console': 'off',
      'no-unused-vars': 'off',
      'node/prefer-global/buffer': 'off',
      'node/prefer-global/process': 'off',
      'ts/no-unused-vars': 'off',
    },
  },
  {
    files: ['plugins/touch-intelligence/widgets/**/*.vue'],
    rules: {
      // Host widget event names are wire contracts and remain kebab-case.
      'vue/custom-event-name-casing': 'off',
    },
  },
  {
    files: ['**/*.{ts,tsx,mts,js,jsx,vue}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'UnaryExpression[operator=\'typeof\'][argument.name=\'window\']',
          message: 'Use hasWindow() from @talex-touch/utils/env instead of typeof window.',
        },
        {
          selector: 'UnaryExpression[operator=\'typeof\'][argument.name=\'document\']',
          message: 'Use hasDocument() from @talex-touch/utils/env instead of typeof document.',
        },
        {
          selector: 'UnaryExpression[operator=\'typeof\'][argument.name=\'navigator\']',
          message: 'Use hasNavigator() from @talex-touch/utils/env instead of typeof navigator.',
        },
      ],
    },
  },
)
