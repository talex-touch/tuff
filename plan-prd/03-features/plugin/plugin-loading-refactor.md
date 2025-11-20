# 插件加载优化说明

## 核心问题

### 死循环场景
- 两个目录有相同 `manifest.name` → 同名检测标记失败 → 但仍写入 manifest → 触发文件监听 → 再次加载 → 循环

### Dev 模式问题
- DevPluginLoader 每次覆写本地 manifest → 触发 LocalPluginProvider 监听 → 重复加载

---

## 解决方案

### 方案 A: 早期阻断 (推荐)
```typescript
private loadingPlugins = new Set<string>()

async function loadPlugin(path: string) {
  const pluginId = path.split('/').pop()!

  // 1. 防止重复加载
  if (this.loadingPlugins.has(pluginId)) {
    logger.warn('插件正在加载中,跳过重复触发', { pluginId })
    return
  }

  this.loadingPlugins.add(pluginId)

  try {
    const manifest = await this.parseManifest(path)

    // 2. 同名检测: 直接返回,阻断后续流程
    if (this.plugins.has(manifest.name)) {
      this.issues.add({
        code: 'DUPLICATE_PLUGIN_NAME',
        message: `插件名称 "${manifest.name}" 已存在`,
        suggestion: `请修改 ${path}/manifest.json 中的 name 字段`,
        timestamp: Date.now()
      })
      return // ✅ 关键: 不继续写入
    }

    // 后续正常加载...
  } finally {
    this.loadingPlugins.delete(pluginId)
  }
}
```

### 方案 B: Source 模式优化
```typescript
// Source 模式不应监听本地文件
class LocalPluginProvider {
  watch(path: string, plugin: Plugin) {
    // 如果是 Source 模式,不监听
    if (plugin.dev?.source === true) {
      logger.info('Source 模式不监听本地文件变更')
      return
    }

    // 正常监听逻辑
    const watcher = chokidar.watch(path, { ... })
  }
}
```

### 方案 C: Dev 模式区分
```typescript
class DevPluginLoader {
  async load(config: DevConfig): Promise<Plugin> {
    if (config.path) {
      // 有路径: 使用本地 manifest,支持监听
      return this.loadFromPath(config.path)
    }
    else {
      // 无路径: 仅 manifest 文本,不支持热更新
      throw new Error('Dev 模式无路径时无法热更新,请手动 reload')
    }
  }
}
```

---

## Dev 模式说明

### dev.source 开关
- `dev.source: false` (调试模式): 加载本地资源,监听本地文件变更
- `dev.source: true` (源码开发模式):
  - 所有请求通过 HTTP 指向 `dev.address`
  - 不监听本地文件,仅依赖心跳检测 Dev Server
  - UI 显示红色警告横幅

### Reload 触发规则
仅以下场景触发热更新:
1. LocalPluginProvider 监听到变更 (非 Source 模式)
2. Dev 心跳检测到版本更新 (Source 模式)
3. 用户手动执行 disable/reload
4. 插件崩溃触发自动恢复

---

## 待补充校验

- [ ] Provider 在 Dev 模式下明确返回 path/文本的差异提示
- [ ] `/_tuff_devkit/update` 心跳策略实现
- [ ] 同名冲突时自动忽略失败目录或提示移除

---

**参考**: `plan-prd/03-features/view/view-mode-prd.md` (View Mode 与开发模式增强)
