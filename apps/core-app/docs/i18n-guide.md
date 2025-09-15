# TalexTouch 国际化指南

## 概述

TalexTouch 使用 Vue I18n 实现国际化功能，支持简体中文（zh-CN）和英语（en-US）两种语言。

## 目录结构

```
apps/core-app/src/renderer/src/modules/lang/
├── zh-CN.json          # 中文语言包
├── en-US.json          # 英文语言包
├── i18n.ts            # 国际化配置
├── useLanguage.ts     # 语言管理 composable
└── index.ts           # 模块导出
```

## 基本使用

### 在 Vue 组件中使用翻译

```vue
<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<template>
  <div>
    <h1>{{ t('app.title') }}</h1>
    <p>{{ t('app.description') }}</p>
  </div>
</template>
```

### 带参数的翻译

```vue
<template>
  <p>{{ t('appList.appsOnDevice', { count: appList.length }) }}</p>
</template>
```

对应的语言文件：

```json
{
  "appList": {
    "appsOnDevice": "此设备上有 {count} 个应用。"
  }
}
```

## 语言切换功能

### 使用 useLanguage composable

```vue
<script setup lang="ts">
import { useLanguage } from '~/modules/lang'

const {
  currentLanguage,
  followSystemLanguage,
  supportedLanguages,
  switchLanguage,
  setFollowSystemLanguage,
  initializeLanguage
} = useLanguage()

// 初始化语言设置
onMounted(() => {
  initializeLanguage()
})

// 切换到指定语言
function handleLanguageChange(lang: string) {
  switchLanguage(lang as SupportedLanguage)
}

// 设置跟随系统语言
function handleFollowSystemChange(follow: boolean) {
  setFollowSystemLanguage(follow)
}
</script>

<template>
  <div>
    <!-- 语言选择器 -->
    <select @change="handleLanguageChange($event.target.value)">
      <option 
        v-for="lang in supportedLanguages" 
        :key="lang.key"
        :value="lang.key"
        :selected="currentLanguage === lang.key"
      >
        {{ lang.name }}
      </option>
    </select>
    
    <!-- 跟随系统语言开关 -->
    <label>
      <input 
        type="checkbox" 
        :checked="followSystemLanguage"
        @change="handleFollowSystemChange($event.target.checked)"
      />
      跟随系统语言
    </label>
  </div>
</template>
```

## 添加新的翻译

### 1. 在语言文件中添加翻译键

**zh-CN.json:**
```json
{
  "newFeature": {
    "title": "新功能",
    "description": "这是一个新功能的描述"
  }
}
```

**en-US.json:**
```json
{
  "newFeature": {
    "title": "New Feature",
    "description": "This is a description of the new feature"
  }
}
```

### 2. 在组件中使用

```vue
<template>
  <div>
    <h2>{{ t('newFeature.title') }}</h2>
    <p>{{ t('newFeature.description') }}</p>
  </div>
</template>
```

## 命名规范

### 翻译键命名规则

1. 使用 camelCase 命名法
2. 按功能模块分组
3. 层级不超过 3 层

```json
{
  "moduleName": {
    "componentName": {
      "elementName": "翻译文本"
    }
  }
}
```

### 示例

```json
{
  "settings": {
    "language": {
      "title": "语言设置",
      "followSystem": "跟随系统语言",
      "chooseLanguage": "选择语言"
    },
    "theme": {
      "title": "主题设置",
      "lightMode": "浅色模式",
      "darkMode": "深色模式"
    }
  }
}
```

## 支持的语言

目前支持的语言：

- `zh-CN` - 简体中文
- `en-US` - 英语

## 添加新语言支持

### 1. 创建语言文件

在 `apps/core-app/src/renderer/src/modules/lang/` 目录下创建新的语言文件，如 `ja-JP.json`。

### 2. 更新支持的语言列表

在 `useLanguage.ts` 中更新 `SUPPORTED_LANGUAGES` 数组：

```typescript
export const SUPPORTED_LANGUAGES = [
  { key: 'zh-CN', name: '简体中文' },
  { key: 'en-US', name: 'English' },
  { key: 'ja-JP', name: '日本語' }
] as const
```

### 3. 更新系统语言检测

在 `getSystemLanguage()` 函数中添加新语言的检测逻辑。

## 最佳实践

### 1. 翻译文本规范

- 保持翻译的准确性和一致性
- 避免过长的文本，考虑 UI 布局
- 使用占位符处理动态内容

### 2. 组件开发规范

- 所有用户可见的文本都应该使用翻译函数
- 避免在代码中硬编码文本
- 及时添加新的翻译键

### 3. 测试

- 在不同语言环境下测试 UI 布局
- 确保所有翻译键都有对应的翻译
- 验证语言切换功能的正确性

## 故障排除

### 常见问题

1. **翻译不显示**
   - 检查翻译键是否正确
   - 确认语言文件中是否存在对应的翻译

2. **语言切换不生效**
   - 检查 `useLanguage` composable 是否正确初始化
   - 确认本地存储中的语言设置

3. **新添加的翻译不显示**
   - 确认语言文件格式正确
   - 重启开发服务器以重新加载语言文件

4. **路由名称国际化问题**
   - 路由配置在应用启动时就需要确定，此时 i18n 可能还没有初始化
   - 建议路由名称使用静态字符串，在组件内部使用翻译函数显示本地化的标题

### 调试技巧

- 使用浏览器开发者工具查看本地存储中的语言设置
- 在控制台中检查 `useLanguage` 的状态
- 使用 Vue DevTools 查看 i18n 的状态

## 参考资料

- [Vue I18n 官方文档](https://vue-i18n.intlify.dev/)
- [国际化最佳实践](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl)