# 图标库

TouchX UI 提供了丰富的图标库，涵盖了各种使用场景。所有图标都经过精心设计，确保在不同尺寸下都能保持清晰和美观。

## 图标分类

### 基础图标
常用的基础界面图标：

- `home` - 首页
- `user` - 用户
- `settings` - 设置
- `search` - 搜索
- `menu` - 菜单
- `close` - 关闭
- `plus` - 加号
- `minus` - 减号
- `check` - 勾选
- `x` - 删除

### 导航图标
用于导航和方向指示：

- `arrow-up` - 向上箭头
- `arrow-down` - 向下箭头
- `arrow-left` - 向左箭头
- `arrow-right` - 向右箭头
- `chevron-up` - 向上尖括号
- `chevron-down` - 向下尖括号
- `chevron-left` - 向左尖括号
- `chevron-right` - 向右尖括号

### 文件图标
文件和文档相关：

- `file` - 文件
- `folder` - 文件夹
- `image` - 图片
- `video` - 视频
- `audio` - 音频
- `document` - 文档
- `download` - 下载
- `upload` - 上传
- `attachment` - 附件

### 通信图标
通信和社交相关：

- `mail` - 邮件
- `message` - 消息
- `phone` - 电话
- `chat` - 聊天
- `send` - 发送
- `reply` - 回复
- `forward` - 转发
- `notification` - 通知
- `bell` - 铃铛

### 操作图标
常用操作和功能：

- `edit` - 编辑
- `delete` - 删除
- `copy` - 复制
- `paste` - 粘贴
- `cut` - 剪切
- `save` - 保存
- `refresh` - 刷新
- `sync` - 同步
- `share` - 分享

### 状态图标
状态和反馈相关：

- `check-circle` - 成功
- `warning-triangle` - 警告
- `x-circle` - 错误
- `info-circle` - 信息
- `loading` - 加载中
- `spinner` - 旋转加载
- `clock` - 时间
- `calendar` - 日历

### 商务图标
商务和电商相关：

- `shopping-cart` - 购物车
- `credit-card` - 信用卡
- `wallet` - 钱包
- `dollar-sign` - 美元符号
- `chart` - 图表
- `graph` - 图形
- `analytics` - 分析
- `trending-up` - 上升趋势
- `trending-down` - 下降趋势

### 社交图标
社交媒体和互动：

- `heart` - 喜欢
- `star` - 收藏
- `thumbs-up` - 点赞
- `thumbs-down` - 踩
- `bookmark` - 书签
- `flag` - 标记
- `eye` - 查看
- `eye-off` - 隐藏

### 媒体图标
媒体播放控制：

- `play` - 播放
- `pause` - 暂停
- `stop` - 停止
- `skip-back` - 上一个
- `skip-forward` - 下一个
- `volume-up` - 音量增大
- `volume-down` - 音量减小
- `volume-mute` - 静音

## 使用方法

### 基础用法
```vue
<template>
  <TxIcon name="home" />
  <!-- 或使用 icon prop -->
  <TuffIcon :icon="{ type: 'class', value: 'i-ri-home-line' }" />
</template>
```

### 图标类型

TuffIcon 支持多种图标类型：

```vue
<script setup>
import { TuffIcon } from '@user-pkg/tuffex'
</script>

<template>
  <!-- Emoji 图标 -->
  <TuffIcon :icon="{ type: 'emoji', value: '🚀' }" />
  <!-- UnoCSS/Iconify 类名 -->
  <TuffIcon :icon="{ type: 'class', value: 'i-ri-star-line' }" />
  
  <!-- 远程 URL -->
  <TuffIcon :icon="{ type: 'url', value: 'https://example.com/icon.svg' }" />
  
  <!-- 本地文件 -->
  <TuffIcon :icon="{ type: 'file', value: '/path/to/icon.svg' }" />
  
  <!-- 内置图标 -->
  <TuffIcon name="chevron-down" />
  <TuffIcon name="close" />
  <TuffIcon name="search" />
</template>
```

### 自定义尺寸
```vue
<template>
  <TuffIcon :icon="{ type: 'class', value: 'i-ri-star-line' }" :size="24" />
  <TuffIcon :icon="{ type: 'class', value: 'i-ri-star-line' }" :size="32" />
  <TuffIcon :icon="{ type: 'class', value: 'i-ri-star-line' }" :size="48" />
</template>
```

### SVG 颜色模式

对于 SVG 图标，`colorful` prop 控制渲染方式：

```vue
<template>
  <!-- colorful=false (默认): 使用 CSS mask，继承 currentColor -->
  <TuffIcon
    :icon="{ type: 'url', value: '/icon.svg' }"
    :colorful="false"class="text-blue-500"
  />
  
  <!-- colorful=true: 保留原始 SVG 颜色 -->
  <TuffIcon
    :icon="{ type: 'url', value: '/colored-icon.svg' }"
    :colorful="true"
  />
</template>
```

### 加载状态

图标支持 loading 和 error 状态：

```vue
<template>
  <TuffIcon :icon="{ type: 'url', value: '...', status: 'loading' }" />
  <TuffIcon :icon="{ type: 'url', value: '...', status: 'error' }" />
</template>
```

### 空图标占位

当图标为空时显示占位图：

```vue
<template>
  <TuffIcon :icon="null" empty="/placeholder.png" alt="默认图标"><template #empty>
      <span>暂无图标</span>
    </template>
  </TuffIcon>
</template>
```

## 图标搜索

您可以通过以下方式快速找到需要的图标：

1. **按分类浏览** - 根据功能分类查找
2. **关键词搜索** - 使用图标名称或功能关键词
3. **视觉搜索** - 根据图标外观特征查找

## 高级配置

### URL 解析器和SVG Fetcher

TuffIcon 支持通过 provide/inject 配置全局 URL 解析和 SVG 加载逻辑。

#### 类型定义

```typescript
import type { InjectionKey } from 'vue'

// URL 解析器
type TxIconUrlResolver = (url: string, type: 'url' | 'file') => string

// SVG 加载器
type TxIconSvgFetcher = (url: string) => Promise<string>

// 配置接口
interface TxIconConfig {
  urlResolver?: TxIconUrlResolver
  svgFetcher?: TxIconSvgFetcherfileProtocol?: string
}

// Injection Key
const TX_ICON_CONFIG_KEY: InjectionKey<TxIconConfig>
```

#### Electron 应用配置示例

在 Electron 应用中，需要处理本地文件路径（如 `tfile://` 协议）：

```vue
<!-- App.vue -->
<script setup lang="ts">
import { provide } from 'vue'
import { TX_ICON_CONFIG_KEY } from '@user-pkg/tuffex'

// 配置全局 TuffIcon
provide(TX_ICON_CONFIG_KEY, {
  // 默认文件协议前缀
  fileProtocol: 'tfile://',
  
  // 自定义 URL 解析器
  urlResolver: (url: string, type: 'url' | 'file') => {
    // file 类型添加 tfile:// 协议
    if (type === 'file') {
      return `tfile://${url}`
    }
    // url 类型：本地绝对路径（非 API 路径）也添加协议
    if (type === 'url' && url.startsWith('/') && !url.startsWith('/api/')) {
      return `tfile://${url}`
    }
    
    return url
  },
  
  // 自定义 SVG 加载器（带重试逻辑）
  svgFetcher: async (url: string) => {
    const maxRetries = 3
    let lastError: Error | null = null
    
    for (let i = 0; i < maxRetries; i++) {
      try {
        const response = await fetch(url)
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return await response.text()
      } catch (e) {
        lastError = e as Error
        await new Promise(r => setTimeout(r, 100 * (i + 1)))
      }
    }
    
    throw lastError
  }
})
</script>
```

#### 组件级覆盖

可以在单个组件上覆盖全局配置：

```vue
<template>
  <TuffIcon
    :icon="{ type: 'file', value: '/custom/path/icon.svg' }"
    :url-resolver="customResolver"
    :svg-fetcher="customFetcher"
  />
</template>

<script setup>
const customResolver = (url, type) => `custom-protocol://${url}`
const customFetcher = async (url) => {
  // 自定义加载逻辑
  return await myCustomLoader(url)
}
</script>
```

### Web 应用配置示例

在普通 Web 应用中，通常不需要特殊的URL 解析：

```vue
<script setup lang="ts">
import { provide } from 'vue'
import { TX_ICON_CONFIG_KEY } from '@user-pkg/tuffex'

provide(TX_ICON_CONFIG_KEY, {
  // 可选：添加 CDN 前缀
  urlResolver: (url, type) => {
    if (type === 'file') {
      return `/assets/icons${url}`
    }
    return url
  }
})
</script>
```

## 自定义图标

如果内置图标不能满足您的需求，您可以：

1. **使用 UnoCSS 图标** - 通过 `i-` 前缀使用 Iconify 图标
2. **添加 SVG 图标** - 使用 `type: 'url'` 或 `type: 'file'`
3. **注册内置图标** -扩展 builtinIcons 对象
4. **使用Emoji** - 直接使用 `type: 'emoji'`

详细使用方法请参考 [Icon 组件文档](/guide/components/icon)。

## 设计原则

TouchX UI 的图标设计遵循以下原则：

- **一致性** - 统一的设计风格和视觉语言
- **清晰性** - 在各种尺寸下都保持清晰可辨
- **简洁性** - 去除不必要的装饰，突出核心含义
- **通用性** - 符合用户的认知习惯和国际标准

## 更新日志

图标库会持续更新，添加新的图标和改进现有图标。请关注我们的更新日志获取最新信息。
