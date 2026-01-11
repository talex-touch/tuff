#图标 Icon

TuffEx 使用 UnoCSS preset-icons 方案，提供丰富的图标支持。

## 基础用法

使用 UnoCSS 图标类名直接渲染图标：

```vue
<template>
  <!-- Remix Icon -->
  <i class="i-ri-home-line" />
  <i class="i-ri-search-line" />
  <i class="i-ri-settings-3-line" />
  <!-- Carbon -->
  <i class="i-carbon-user" />
  <i class="i-carbon-folder" />
  
  <!-- Simple Icons (品牌) -->
  <i class="i-simple-icons-github" />
  <i class="i-simple-icons-visualstudiocode" />
</template>
```

## TuffIcons 常量

`@talex-touch/utils` 提供预定义的图标常量，确保一致性：

```typescript
import { TuffIcons } from '@talex-touch/utils'

// 在模板中使用
<i :class="TuffIcons.Search" />
<i :class="TuffIcons.Settings" />
<i :class="TuffIcons.Home" />
```

## 图标分类

### 导航图标

| 名称 | 类名 | 预览 |
|------|------|------|
| Home | `i-ri-home-line` | <i class="i-ri-home-line" /> |
| Back | `i-ri-arrow-left-line` | <i class="i-ri-arrow-left-line" /> |
| Forward | `i-ri-arrow-right-line` | <i class="i-ri-arrow-right-line" /> |
| Menu | `i-ri-menu-line` | <i class="i-ri-menu-line" /> |

### 操作图标

| 名称 | 类名 | 预览 |
|------|------|------|
| Search | `i-ri-search-line` | <i class="i-ri-search-line" /> |
| Add | `i-ri-add-line` | <i class="i-ri-add-line" /> |
| Delete | `i-ri-delete-bin-line` | <i class="i-ri-delete-bin-line" /> |
| Edit | `i-ri-edit-line` | <i class="i-ri-edit-line" /> |
| Copy | `i-ri-file-copy-line` | <i class="i-ri-file-copy-line" /> |
| Save | `i-ri-save-line` | <i class="i-ri-save-line" /> |
| Download | `i-ri-download-line` | <i class="i-ri-download-line" /> |
| Upload | `i-ri-upload-line` | <i class="i-ri-upload-line" /> |
| Refresh | `i-ri-refresh-line` | <i class="i-ri-refresh-line" /> |

### 状态图标

| 名称 | 类名 | 预览 |
|------|------|------|
| Check | `i-ri-check-line` | <i class="i-ri-check-line" /> |
| Close | `i-ri-close-line` | <i class="i-ri-close-line" /> |
| Warning | `i-ri-error-warning-line` | <i class="i-ri-error-warning-line" /> |
| Info | `i-ri-information-line` | <i class="i-ri-information-line" /> |
| Error | `i-ri-close-circle-line` | <i class="i-ri-close-circle-line" /> |

### 文件图标

| 名称 | 类名 | 预览 |
|------|------|------|
| File | `i-ri-file-line` | <i class="i-ri-file-line" /> |
| Folder | `i-ri-folder-line` | <i class="i-ri-folder-line" /> |
| FileCode | `i-ri-file-code-line` | <i class="i-ri-file-code-line" /> |
| FileImage | `i-ri-image-line` | <i class="i-ri-image-line" /> |

### UI 元素图标

| 名称 | 类名 | 预览 |
|------|------|------|
| Settings | `i-ri-settings-3-line` | <i class="i-ri-settings-3-line" /> |
| User | `i-ri-user-line` | <i class="i-ri-user-line" /> |
| Star | `i-ri-star-line` | <i class="i-ri-star-line" /> |
| Heart | `i-ri-heart-line` | <i class="i-ri-heart-line" /> |
| Lock | `i-ri-lock-line` | <i class="i-ri-lock-line" /> |
| Eye | `i-ri-eye-line` | <i class="i-ri-eye-line" /> |

### 品牌图标

| 名称 | 类名 | 预览 |
|------|------|------|
| GitHub | `i-simple-icons-github` | <i class="i-simple-icons-github" /> |
| VSCode | `i-simple-icons-visualstudiocode` | <i class="i-simple-icons-visualstudiocode" /> |
| Chrome | `i-simple-icons-googlechrome` | <i class="i-simple-icons-googlechrome" /> |
| Discord | `i-simple-icons-discord` | <i class="i-simple-icons-discord" /> |

## 自定义样式

```vue
<template>
  <!--尺寸 -->
  <i class="i-ri-home-line text-sm" />  <!-- 14px -->
  <i class="i-ri-home-line text-base" /> <!-- 16px -->
  <i class="i-ri-home-line text-xl" />  <!-- 20px -->
  <i class="i-ri-home-line text-2xl" /> <!-- 24px -->
  
  <!-- 颜色 -->
  <i class="i-ri-star-line text-yellow-500" />
  <i class="i-ri-heart-fill text-red-500" />
  <i class="i-ri-check-circle-fill text-green-500" />
  
  <!-- 动画 -->
  <i class="i-ri-loader-4-line animate-spin" />
</template>
```

## 图标集

TuffEx 内置了以下图标集：

| 图标集 | 前缀 | 描述 |
|--------|------|------|
| Remix Icon | `i-ri-` | 通用 UI 图标，线条/填充风格 |
| Carbon | `i-carbon-` | IBM 设计系统图标 |
| Simple Icons | `i-simple-icons-` | 品牌/Logo 图标 |

## 图标搜索

访问 [Icônes](https://icones.js.org/) 在线浏览和搜索所有可用图标。

## API

### TuffIcons 常量

```typescript
import { TuffIcons, AppIcons } from '@talex-touch/utils'

// 通用 UI 图标
TuffIcons.Home// 'i-ri-home-line'
TuffIcons.Search// 'i-ri-search-line'
TuffIcons.Settings  // 'i-ri-settings-3-line'

// 应用品牌图标
AppIcons.VSCode     // 'i-simple-icons-visualstudiocode'
AppIcons.GitHub     // 'i-simple-icons-github'
```

### classIcon 函数

```typescript
import { classIcon, getIcon } from '@talex-touch/utils'

// 创建 ITuffIcon 对象
const icon = classIcon('i-ri-star-line')
// { type: 'class', value: 'i-ri-star-line' }

// 从常量获取 ITuffIcon
const searchIcon = getIcon('Search')
// { type: 'class', value: 'i-ri-search-line' }