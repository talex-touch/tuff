import eslintConfigPrettier from '@electron-toolkit/eslint-config-prettier'
import tseslint from '@electron-toolkit/eslint-config-ts'
import eslintPluginVue from 'eslint-plugin-vue'
import vueParser from 'vue-eslint-parser'

const baseRestrictedSyntax = [
  {
    selector: "Literal[value='@talex-touch/utils/channel']",
    message: 'Legacy channel entry has been removed. Use @talex-touch/utils/transport.'
  },
  {
    selector: "Literal[value='@talex-touch/utils/transport/legacy']",
    message: 'Legacy transport entry has been removed. Use @talex-touch/utils/transport.'
  },
  {
    selector: "Literal[value='@talex-touch/utils/permission/legacy']",
    message: 'Legacy permission entry has been removed. Use @talex-touch/utils/permission.'
  },
  {
    selector: 'Literal[value=/@(main|plugin)-process-message/]',
    message: 'Raw IPC channel strings must stay inside the internal raw IPC adapter.'
  },
  {
    selector: 'Literal[value=/\\/api\\/sync\\//]',
    message: 'Use /api/v1/sync/* instead of retired /api/sync/* paths.'
  },
  {
    selector: 'TemplateElement[value.raw=/\\/api\\/sync\\//]',
    message: 'Use /api/v1/sync/* instead of retired /api/sync/* paths.'
  },
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
  },
  {
    selector: "CallExpression[callee.type='Identifier'][callee.name='fetch']",
    message: 'Direct fetch is restricted. Use @talex-touch/utils/network or renderer NetworkSDK.'
  }
]

const rendererPlatformRestrictedSyntax = [
  {
    selector: "MemberExpression[object.name='navigator'][property.name='platform']",
    message: 'Use renderer-platform helpers instead of reading navigator.platform directly.'
  },
  {
    selector: "MemberExpression[object.name='navigator'][property.name='userAgent']",
    message: 'Use renderer-platform helpers instead of reading navigator.userAgent directly.'
  },
  {
    selector: "MemberExpression[object.name='process'][property.name='platform']",
    message: 'Use renderer-platform helpers instead of reading process.platform directly.'
  }
]

const mainRuntimeRestrictedSyntax = [
  {
    selector: "Identifier[name='ipcMain']",
    message: 'Use internal main channel adapters instead of direct ipcMain access.'
  },
  {
    selector: "MemberExpression[object.name='globalThis'][property.name='$app']",
    message: 'Use explicit module context instead of globalThis.$app.'
  },
  {
    selector: "Identifier[name='$app']",
    message: 'Use explicit module context instead of $app global access.'
  },
  {
    selector: "Property[key.name='webSecurity'][value.value=false]",
    message: 'Use named window security profiles for Electron webPreferences.'
  },
  {
    selector: "Property[key.name='nodeIntegration'][value.value=true]",
    message: 'Use named window security profiles for Electron webPreferences.'
  },
  {
    selector: "Property[key.name='nodeIntegrationInSubFrames'][value.value=true]",
    message: 'Use named window security profiles for Electron webPreferences.'
  },
  {
    selector: "Property[key.name='contextIsolation'][value.value=false]",
    message: 'Use named window security profiles for Electron webPreferences.'
  },
  {
    selector: "Property[key.name='sandbox'][value.value=false]",
    message: 'Use named window security profiles for Electron webPreferences.'
  },
  {
    selector: "Property[key.name='webviewTag'][value.value=true]",
    message: 'Use named window security profiles for Electron webPreferences.'
  }
]

const preloadRuntimeRestrictedSyntax = [
  {
    selector: "Identifier[name='ipcRenderer']",
    message: 'Use the preload bridge boundary instead of direct ipcRenderer access.'
  }
]

const rendererRuntimeRestrictedSyntax = [
  ...rendererPlatformRestrictedSyntax,
  {
    selector: "MemberExpression[object.name='window'][property.name='touchChannel']",
    message: 'Use TuffTransport/domain SDKs instead of window.touchChannel.'
  },
  {
    selector: "MemberExpression[object.name='window'][property.name=/^\\$(t|i18n)$/]",
    message: 'Use i18n hooks instead of window.$t/window.$i18n.'
  },
  {
    selector:
      "MemberExpression[object.type='MemberExpression'][object.object.name='window'][object.property.name='electron'][property.name='ipcRenderer']",
    message: 'Use renderer channel adapter or domain SDKs instead of window.electron.ipcRenderer.'
  }
]

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
    ignores: ['src/shared/ipc/raw-channel.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@talex-touch/utils/channel',
              message: 'Legacy channel API is restricted. Use @talex-touch/utils/transport.'
            },
            {
              name: 'packages/utils/channel',
              message: 'Legacy channel API is restricted. Use @talex-touch/utils/transport.'
            },
            {
              name: '@talex-touch/utils/transport/legacy',
              message: 'Legacy transport API has been removed. Use @talex-touch/utils/transport.'
            },
            {
              name: '@talex-touch/utils/permission/legacy',
              message: 'Legacy permission API has been removed. Use @talex-touch/utils/permission.'
            },
            {
              name: 'axios',
              message:
                'Direct axios usage is restricted. Use @talex-touch/utils/network or renderer NetworkSDK.'
            }
          ]
        }
      ],
      'no-restricted-syntax': ['error', ...baseRestrictedSyntax]
    }
  },
  {
    files: ['src/renderer/**/*.{ts,mts,tsx,vue}'],
    ignores: ['src/renderer/src/modules/platform/renderer-platform.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...baseRestrictedSyntax,
        ...rendererPlatformRestrictedSyntax
      ]
    }
  },
  {
    files: ['src/main/**/*.{ts,mts,tsx,js,mjs,cjs}'],
    ignores: [
      'src/main/core/channel-core.ts',
      'src/main/core/window-security-profile.ts',
      'src/main/utils/perf-monitor.ts',
      '**/*.{test,spec}.{ts,mts,tsx,js,mjs,cjs}'
    ],
    rules: {
      'no-restricted-syntax': ['error', ...baseRestrictedSyntax, ...mainRuntimeRestrictedSyntax]
    }
  },
  {
    files: ['src/preload/**/*.{ts,mts,tsx,js,mjs,cjs}'],
    ignores: ['src/preload/index.ts', '**/*.{test,spec}.{ts,mts,tsx,js,mjs,cjs}'],
    rules: {
      'no-restricted-syntax': ['error', ...baseRestrictedSyntax, ...preloadRuntimeRestrictedSyntax]
    }
  },
  {
    files: ['src/renderer/**/*.{ts,mts,tsx,vue,js,mjs,cjs}'],
    ignores: [
      'src/renderer/src/modules/channel/channel-core.ts',
      'src/renderer/src/modules/platform/renderer-platform.ts',
      'src/renderer/src/views/test/**',
      '**/*.{test,spec}.{ts,mts,tsx,js,mjs,cjs}'
    ],
    rules: {
      'no-restricted-syntax': ['error', ...baseRestrictedSyntax, ...rendererRuntimeRestrictedSyntax]
    }
  },
  {
    files: ['src/**/*.{ts,mts,tsx,vue,js,mjs,cjs}'],
    ignores: [
      'src/preload/index.ts',
      'src/main/utils/logger.ts',
      'src/main/plugins/internal/internal-plugin-logger.ts',
      'src/main/modules/box-tool/search-engine/search-logger.ts',
      'src/main/modules/box-tool/search-engine/search-logger-test.ts',
      'src/shared/ipc/raw-channel.ts',
      'src/renderer/src/base/axios.ts',
      'src/renderer/src/modules/channel/channel-core.ts',
      'src/renderer/src/utils/dev-log.ts',
      'src/renderer/src/utils/renderer-log.ts',
      'src/renderer/src/views/test/**',
      '**/*.{test,spec}.{ts,mts,tsx,js,mjs,cjs}'
    ],
    rules: {
      'no-console': 'error'
    }
  },
  eslintConfigPrettier
)
