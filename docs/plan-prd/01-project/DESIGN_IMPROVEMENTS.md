# Tuff 项目设计改进建议

> ⚠️ **Historical（历史快照，停止维护）**：2025-10 设计建议快照（适用 v2.1.0+），与当前 v2.4.13 架构已漂移。当前事实源以 `ROADMAP.md`、`docs/plan-prd/TODO.md` 与 Trellis 任务为准。

> 基于系统性分析的设计优化建议
> 生成时间: 2025-10-30
> 适用版本: 2.1.0+

---

## 📋 概述

本文档整理了通过系统性分析发现的设计不足,并提供具体的改进方案。建议按优先级逐步实施。

---

## 🟡 重要改进 (近期实施)

### 1. 托盘系统功能薄弱 🖱️

#### 问题描述
**严重度**: 🟡 Medium
**影响范围**: 用户体验

**现状不足**:
- 仅有"退出"一个菜单项,功能单一
- 依赖远程图标下载,首次启动慢
- 托盘图标点击无实际功能
- 无国际化支持

#### 改进方案: 丰富托盘菜单 + 本地资源

**新增菜单项** (共 9 项):
1. **显示/隐藏主窗口** (动态文本)
2. **打开 CoreBox** (Cmd/Ctrl+E)
3. **下载中心** (动态徽章显示任务数)
4. **剪贴板历史**
5. **终端**
6. **设置**
7. **关于** (子菜单: 版本/更新/日志/数据目录/官网)
8. **重启应用**
9. **退出**

**本地图标资源**:
```typescript
// 使用已有的本地图标
const trayIconPath = app.isPackaged
  ? path.join(process.resourcesPath, 'tray_icon.png')
  : path.join(__dirname, '../../public/mac_tray_icon.png')

// macOS: 制作 Template 图标 (黑白单色,支持深色模式)
const macIconPath = 'mac_tray_iconTemplate.png' // 需要新建
```

**窗口关闭行为**:
```typescript
// 默认: 关闭 → 最小化到托盘
mainWindow.on('close', (event) => {
  const closeToTray = storageModule.get('app.window.closeToTray', true)
  if (closeToTray) {
    event.preventDefault()
    mainWindow.hide()
  }
})

// 用户可配置: 设置 > 通用 > 窗口行为
// - 最小化到托盘 (默认)
// - 退出应用
```

---

### 2. ~~废弃 extract-icon API~~ ✅ 已完成 (2025-11)

#### 问题描述
**严重度**: 🟢 Low (但影响性能)
**影响范围**: 文件图标加载
**完成状态**: ✅ 已重构完成

**原问题**:
- `file:extract-icon` IPC 调用 + buffer 转换,代码复杂
- 每次都要 IPC 往返,性能开销大
- 图标加载有延迟,需要 loading 状态

#### 已完成的改进

**迁移成果**:
```vue
<!-- ✅ 新方案 (已全面实施) -->
<script>
const iconUrl = computed(() => `tfile://${filePath}`)
</script>

<img :src="iconUrl" />
```

**实际性能对比**:
| 指标 | extract-icon API | tfile:// 协议 (已实施) |
|------|------------------|---------------------|
| IPC 调用 | 需要 | 不需要 ✅ |
| Buffer 转换 | 需要手动转换 | 浏览器自动处理 ✅ |
| 代码行数 | ~20 行 | 1 行 ✅ |
| 并发加载 | 串行 | 并行 ✅ |
| 浏览器缓存 | 不支持 | 自动支持 ✅ |
| 加载延迟 | 50-100ms | <10ms ✅ |

**已迁移组件** (共 18 个):
- FileTag.vue
- UnifiedFileTag.vue
- ClipboardFileTag.vue
- TuffIcon.vue
- 各类 Preview 组件 (Text/Image/Video/Audio)
- useSvgContent.ts

**详见**: 已完成功能总结文档

---

## 🟢 增强改进 (中长期规划)

### 3. 能力抽象碎片化 🧩

#### 问题描述
**严重度**: 🟢 Low (但影响长期架构)
**影响范围**: 插件开发者体验、代码复用

**现状问题**:
- 通用能力分散在 SDK、CoreBox、工具模块
- 缺乏统一抽象,开发者难以发现
- 无权限管理,无使用统计

#### 改进方案: 平台能力体系

**核心设计**:
```typescript
// 1. 能力定义
interface CapabilityDefinition {
  id: string                    // 唯一标识
  version: string               // 版本
  handler: (context, payload) => Promise<any>
  metadata: {
    description: string
    scope: 'system' | 'plugin' | 'ai'
    sensitive?: boolean
  }
}

// 2. 能力注册
class PlatformCoreService {
  private registry = new Map<string, CapabilityDefinition>()

  register(capability: CapabilityDefinition): void {
    this.registry.set(capability.id, capability)
  }

  async invoke<T>(capabilityId: string, method: string, payload: any): Promise<T> {
    const capability = this.registry.get(capabilityId)
    if (!capability) throw new Error('Capability not found')

    // 权限检查
    this.assertPermission(capabilityId, context.pluginId)

    // 日志记录
    logger.info('调用能力', { capabilityId, method, pluginId: context.pluginId })

    // 执行
    return await capability.handler(context, payload)
  }
}

// 3. SDK 封装
class PluginSDK {
  async platform.invoke<T>(capabilityId: string, method: string, payload: any): Promise<T> {
    return await channel.send('platform:invoke', { capabilityId, method, payload })
  }
}
```

**使用示例**:
```typescript
// 插件中使用
const text = await sdk.platform.invoke('system.clipboard.read', 'getText', {})
await sdk.platform.invoke('system.notification.show', 'notify', {
  title: '提示',
  body: '操作成功'
})
```

**参考**: `plan-prd/02-architecture/platform-capabilities-prd.md`

---

### 4. AI 能力接入混乱 🤖

#### 问题描述
**严重度**: 🟢 Low (规划阶段)
**影响范围**: AI 功能扩展

**现状问题**:
- 插件与系统各自接入不同 AI 模型
- 重复造轮子,无成本控制

#### 改进方案: AI 能力泛化接口

**核心设计**:
```typescript
// 1. 能力分类
enum AiCapabilityType {
  CHAT = 'chat',
  COMPLETION = 'completion',
  EMBEDDING = 'embedding',
  TTS = 'tts',
  STT = 'stt',
  VISION = 'vision'
}

// 2. 统一调用接口
class AiService {
  async invoke(capabilityId: string, payload: any, options?: InvokeOptions): Promise<any> {
    // 策略路由: 根据成本/延迟/质量选择模型
    const provider = this.strategyManager.selectProvider(capabilityId, options)

    // 执行调用
    const result = await provider.execute(payload)

    // 日志与计费
    this.logUsage(capabilityId, provider.name, result.usage)

    return result
  }
}

// 3. 语法糖
await ai.text.chat({ messages: history })
await ai.embedding.create({ text: 'Hello' })
await ai.tts.synthesize({ text: 'Hello', voice: 'alloy' })
```

**参考**: `plan-prd/02-architecture/ai-power-generic-api-prd.md`

---

## 📊 改进优先级总结

| 改进项 | 严重度 | 工期 | 影响范围 | 优先级 |
|--------|--------|------|----------|--------|
| 托盘系统薄弱 | 🟡 Medium | 5-7 天 | 用户体验 | P1 |
| 废弃 extract-icon | 🟢 Low | 1-2 天 | 性能优化 | P1 |
| 能力抽象碎片化 | 🟢 Low | 20-30 天 | 插件开发体验 | P3 |
| AI 能力混乱 | 🟢 Low | 15-20 天 | AI 功能扩展 | P3 |

---

## 🎯 实施建议

### 近期规划 (Week 1-4)
1. **托盘系统优化** - UI 团队 1 人
2. **废弃 extract-icon** - 核心团队 0.5 人

### 中长期规划 (Q1 2026)
3. **平台能力体系** - 架构团队 2-3 人
4. **AI 能力接口** - AI 团队 1-2 人

---

## 📝 附录

### 技术债务清单

| 债务项 | 严重度 | 建议处理时间 |
|--------|--------|-------------|
| 缺少自动化测试 | 🟡 High | Week 5-8 |
| API 文档不完整 | 🟢 Low | Week 8-12 |
| 性能监控缺失 | 🟢 Low | Q1 2026 |

### 参考资料

- `CHANGES.md` - 已完成功能清单
- `CALENDAR-PRD.md` - 开发排期计划
- `plan-prd/*.md` - 各项 PRD 文档

---

**文档版本**: v2.0 (精简版)
**生成时间**: 2025-11-20
**负责人**: Architecture Team
