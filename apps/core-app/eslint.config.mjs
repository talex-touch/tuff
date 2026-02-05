import eslintConfigPrettier from '@electron-toolkit/eslint-config-prettier'
import tseslint from '@electron-toolkit/eslint-config-ts'
import eslintPluginVue from 'eslint-plugin-vue'
import vueParser from 'vue-eslint-parser'

export default tseslint.config(
  { ignores: ['**/node_modules', '**/dist', '**/out', 'tuff/**'] },
  tseslint.configs.recommended,
  eslintPluginVue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        ecmaFeatures: {
          jsx: true
        },
        extraFileExtensions: ['.vue'],
        parser: tseslint.parser
      }
    }
  },
  {
    files: ['src/renderer/**/*.{ts,mts,tsx,vue}'],
    rules: {
      'vue/require-default-prop': 'off',
      'vue/multi-word-component-names': 'off',
      'vue/block-lang': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-this-alias': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'no-undef': 'off', // Disable no-undef for auto-imported globals since TypeScript handles this
      'no-constant-binary-expression': 'off',
      'no-prototype-builtins': 'off',
      'no-useless-escape': 'off',
      'prefer-rest-params': 'off',
      'vue/no-dupe-keys': 'off',
      'vue/no-mutating-props': 'off',
      'vue/no-ref-as-operand': 'off',
      'vue/no-unused-components': 'off',
      'vue/require-v-for-key': 'off',
      'vue/valid-template-root': 'off'
    }
  },
  {
    files: ['**/*.{ts,mts,tsx}'],
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'warn'
    }
  },
  {
    files: ['**/*.{ts,mts,tsx,js,mjs,cjs}'],
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_'
        }
      ],
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-this-alias': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'off',
      'no-prototype-builtins': 'off',
      'no-useless-catch': 'off',
      'prefer-const': 'off',
      'prefer-rest-params': 'off',
      'no-case-declarations': 'off',
      'no-empty': 'off',
      'no-useless-escape': 'off',
      'require-yield': 'off'
    }
  },
  {
    files: ['src/**/*.{ts,mts,tsx,vue,js,mjs,cjs}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "UnaryExpression[operator='typeof'][argument.name='window']",
          message: 'Use hasWindow() from @talex-touch/utils/env instead of typeof window.'
        },
        {
          selector: "UnaryExpression[operator='typeof'][argument.name='document']",
          message: 'Use hasDocument() from @talex-touch/utils/env instead of typeof document.'
        },
        {
          selector: "UnaryExpression[operator='typeof'][argument.name='navigator']",
          message: 'Use hasNavigator() from @talex-touch/utils/env instead of typeof navigator.'
        }
      ]
    }
  },
  eslintConfigPrettier
)
