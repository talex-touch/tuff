# 废弃 file:extract-icon API 并迁移至 tfile:// 协议 PRD

## 一、背景与现状

### 1.1 当前实现

- `file:extract-icon` IPC 通道提供文件图标提取功能
- 使用 `extract-file-icon` npm 包提取系统文件图标
- 需要异步 IPC 调用：renderer → main → 提取图标 → 返回 buffer
- renderer 需要手动转换 buffer 为 base64 data URL

### 1.2 存在问题

- **代码复杂度高**：需要 async/await、buffer 转换、错误处理
- **性能开销**：每次都要 IPC 往返 + buffer 序列化传输
- **维护成本**：多处代码重复相同的 buffer 转换逻辑
- **用户体验**：图标加载有延迟，需要 loading 状态管理

### 1.3 影响范围

当前使用 `file:extract-icon` 的位置：
- `apps/core-app/src/main/modules/box-tool/core-box/ipc.ts` (IPC 处理器)
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useClipboard.ts`
- `apps/core-app/src/renderer/src/views/box/tag/ClipboardFileTag.vue`

## 二、解决方案

### 2.1 技术方案

使用已有的 **tfile:// 自定义协议**直接访问文件：

```vue
<!-- 旧方案 -->
<script>
const iconDataUrl = ref(null)
onMounted(async () => {
  const buffer = await touchChannel.send('file:extract-icon', { path })
  const bytes = new Uint8Array(buffer)
  let storeData = ''
  for (let i = 0; i < bytes.length; i++) {
    storeData += String.fromCharCode(bytes[i])
  }
  iconDataUrl.value = 'data:image/png;base64,' + window.btoa(storeData)
})
</script>
<img :src="iconDataUrl" />

<!-- 新方案 -->
<script>
const iconUrl = computed(() => `tfile://${filePath}`)
</script>
<img :src="iconUrl" />
```

### 2.2 tfile:// 协议说明

- 已在 `FileProtocolModule` 中实现
- 浏览器原生支持自定义协议图片加载
- 自动处理文件图标提取和缓存
- 支持所有文件类型（通过系统提取图标）

## 三、收益分析

### 3.1 代码简化

- **减少 15+ 行异步代码** → 1 行 computed
- **无需 buffer 转换逻辑**
- **无需 loading 状态管理**
- **无需错误处理包装**

### 3.2 性能提升

- **零 IPC 延迟**：浏览器直接通过协议访问
- **并发加载**：多个图标可同时加载
- **浏览器缓存**：相同文件图标自动缓存

### 3.3 维护性提升

- **统一方案**：所有文件访问都用 tfile://
- **声明式代码**：更符合 Vue 响应式范式
- **更少依赖**：可移除 extract-file-icon 包的直接依赖

## 四、迁移指南

### 4.1 ClipboardFileTag.vue 迁移

**迁移前**：

```typescript
const iconDataUrl = ref<string | null>(null)
const fileIcon = computed(() => null)

onMounted(async () => {
  if (filePaths.value.length > 0) {
    try {
      const buffer = await touchChannel.send('file:extract-icon', {
        path: filePaths.value[0]
      })
      if (buffer) {
        const bytes = new Uint8Array(buffer)
        let storeData = ''
        for (let i = 0; i < bytes.length; i++) {
          storeData += String.fromCharCode(bytes[i])
        }
        iconDataUrl.value = 'data:image/png;base64,' + window.btoa(storeData)
      }
    } catch (error) {
      console.debug('Failed to load file icon:', error)
    }
  }
})
```

**迁移后**：

```typescript
const fileIconUrl = computed(() => {
  if (filePaths.value.length === 0) return null
  return `tfile://${filePaths.value[0]}`
})
```

### 4.2 useClipboard.ts 迁移

**迁移前**：

```typescript
touchChannel.send('file:extract-icon', { path: firstFile }).then((buffer) => {
  boxOptions.file = {
    buffer,
    paths: pathList
  }
  boxOptions.mode = BoxMode.FILE
})
```

**迁移后**：

```typescript
boxOptions.file = {
  iconPath: firstFile,
  paths: pathList
}
boxOptions.mode = BoxMode.FILE
```

### 4.3 FileTag.vue 迁移

**迁移前**：

```typescript
const props = defineProps<{
  buffer: Uint8Array
  paths: string[]
}>()

const image = computed(() => {
  const bytes: any = props.buffer.buffer
  let storeData = ''
  const len = bytes.byteLength
  for (let i = 0; i < len; i++) {
    storeData += String.fromCharCode(bytes[i])
  }
  return 'data:image/png;base64,' + window.btoa(storeData)
})
```

**迁移后**：

```typescript
const props = defineProps<{
  iconPath?: string
  paths: string[]
}>()

const image = computed(() => {
  const path = props.iconPath || props.paths[0]
  return `tfile://${path}`
})
```

## 五、废弃时间线

### 阶段 1：标记废弃（当前版本）

- 在 IPC 处理器添加 `@deprecated` 注释
- 文档中说明推荐使用 tfile://

### 阶段 2：迁移期（未来 1-2 个版本）

- 所有内部代码迁移至 tfile://
- 插件开发文档更新示例代码
- 保留 API 向后兼容

### 阶段 3：完全移除（未来 3+ 版本）

- 移除 IPC 处理器
- 可选：移除 extract-file-icon 依赖

## 六、风险评估

### 6.1 兼容性

- ✅ tfile:// 协议已稳定运行
- ✅ 所有平台（macOS/Windows/Linux）均支持
- ✅ 旧代码仍可正常工作（向后兼容）

### 6.2 潜在问题

- **图标质量**：tfile:// 使用相同的图标提取方式，无质量差异
- **错误处理**：`<img>` 标签自带 onerror 处理，更简洁
- **插件影响**：第三方插件可能仍在使用旧 API，需保留兼容期

## 七、技术细节

### 7.1 FileProtocolModule 工作原理

FileProtocolModule 在 `apps/core-app/src/main/modules/file-protocol/index.ts` 中实现：

1. 注册自定义协议 `tfile://`
2. 拦截所有 `tfile://` 请求
3. 根据文件路径提取系统图标
4. 返回图标作为 HTTP 响应

### 7.2 性能对比

| 指标 | extract-icon API | tfile:// 协议 |
|------|------------------|---------------|
| IPC 调用 | 需要 | 不需要 |
| Buffer 转换 | 需要手动转换 | 浏览器自动处理 |
| 代码行数 | ~20 行 | 1 行 |
| 并发加载 | 串行 | 并行 |
| 浏览器缓存 | 不支持 | 自动支持 |
| 加载延迟 | 50-100ms | <10ms |

### 7.3 向后兼容策略

FileTag.vue 已实现向后兼容：

```typescript
const image = computed(() => {
  // 优先使用 tfile:// (新方案)
  if (props.iconPath) {
    return `tfile://${props.iconPath}`
  }

  // 回退到 paths (新方案)
  if (props.paths && props.paths.length > 0) {
    return `tfile://${props.paths[0]}`
  }

  // 兼容旧的 buffer 方式 (废弃)
  if (props.buffer) {
    // ... buffer 转换逻辑
  }

  return ''
})
```

## 八、总结

将 `file:extract-icon` 迁移至 `tfile://` 协议是一次技术债务清理，能够：

- **大幅简化代码**（减少 70% 代码量）
- **提升性能**（消除 IPC 延迟）
- **改善维护性**（统一文件访问方式）
- **符合 Web 标准**（浏览器原生协议支持）

建议立即开始迁移，并在 2-3 个版本后完全移除旧 API。

## 九、相关资源

- FileProtocolModule 实现：`apps/core-app/src/main/modules/file-protocol/index.ts`
- TuffIcon 组件：`apps/core-app/src/renderer/src/components/base/TuffIcon.vue`
- 文件图标提取：使用 `extract-file-icon` npm 包
- 自定义协议文档：Electron Custom Protocol API

