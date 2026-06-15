# IPC 系统统一迁移计划：TouchChannel → TuffTransport

> 创建日期：2026-06-14
> 状态：草案
> 目标完成时间：2026 H1（SDK Hard-Cut 目标的一部分）

---

## 1. 执行摘要

本计划旨在将 Tuff 的双重 IPC 系统（legacy TouchChannel + 类型安全 TuffTransport）统一为单一的 TuffTransport 通信层。当前架构中，TouchChannel 作为底层 IPC 实现，TuffTransport 包装它作为桥接层，但部分模块仍直接使用 raw channel 方法，导致三种冗余广播机制并存。本次迁移将消除技术债务，提升类型安全性、可维护性和开发体验。

---

## 2. 当前状态分析

### 2.1 双轨 IPC 架构现状

```
┌─────────────────────────────────────────────────────────────────┐
│  当前 IPC 架构                                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  TouchChannel (Legacy)        TuffTransport (Type-Safe)        │
│  ┌─────────────────────┐      ┌─────────────────────────┐      │
│  │ - 原生 IPC 封装       │      │ - 类型安全事件定义        │      │
│  │ - regChannel/send    │      │ - defineEvent/defineRaw │      │
│  │ - broadcast/broadcastTo│    │ - MessagePort streaming │      │
│  │ - 插件加密通道        │      │ - 批处理/缓存            │      │
│  └──────────┬──────────┘      └───────────┬─────────────┘      │
│             │                              │                    │
│             └──────────┬───────────────────┘                    │
│                        │                                        │
│                        ▼                                        │
│              ┌─────────────────┐                                │
│              │  Electron IPC   │                                │
│              │  (ipcMain/      │                                │
│              │   ipcRenderer)  │                                │
│              └─────────────────┘                                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 三种冗余广播机制

| 机制 | 使用场景 | 问题 |
|------|----------|------|
| `TouchChannel.broadcast` | 主进程→所有渲染进程 | Legacy，无类型安全 |
| `touchEventBus.emit` | 主进程内部跨模块 | 仅主进程内部，不跨进程 |
| `TuffTransportMain.broadcast` | 主进程→所有渲染进程 | 新一代，类型安全 |

### 2.3 模块使用现状

**已迁移到 TuffTransport 的模块**（约 60%）：
- CoreBox 搜索链
- Plugin Module（部分）
- Intelligence Module
- Sync Module

**仍使用 raw TouchChannel 的模块**（约 40%）：
- Storage Module 的广播更新
- 部分 Legacy 事件处理
- 插件 IPC 的某些路径
- 跨窗口通知机制

---

## 3. 迁移目标

### 3.1 核心目标

1. **消除 TouchChannel 直接调用**：所有模块必须通过 TuffTransport 进行 IPC 通信
2. **统一广播机制**：废弃 `TouchChannel.broadcast` 和 `touchEventBus.emit`（跨进程场景），统一使用 `TuffTransportMain.broadcast`
3. **类型安全全覆盖**：所有 IPC 事件必须在 `packages/utils/transport/events/` 中定义
4. **保持向后兼容**：迁移期间保持现有功能正常运行

### 3.2 量化指标

| 指标 | 当前值 | 目标值 |
|------|--------|--------|
| TouchChannel 直接调用点 | ~120 处 | 0 处 |
| 冗余广播机制 | 3 种 | 1 种 |
| 未定义事件的 IPC 调用 | ~15 处 | 0 处 |
| 类型安全覆盖率 | ~60% | 100% |

---

## 4. 迁移阶段

### Phase 1：基础设施准备（2 周）

**目标**：建立迁移基础设施，确保 TuffTransport 能力完整

**任务清单**：
- [ ] 审计所有 TouchChannel 直接调用点，生成完整清单
- [ ] 补充 TuffTransport 缺失的事件定义（`packages/utils/transport/events/`）
- [ ] 实现 `TuffTransportMain.broadcastTo` 方法（对标 `TouchChannel.broadcastTo`）
- [ ] 创建迁移辅助工具：自动检测 raw channel 调用的 lint 规则
- [ ] 编写迁移指南文档

**交付物**：
- `migration-audit-report.md`：完整调用点清单
- `transport-events-gap-analysis.md`：事件定义缺口分析
- 新增 TuffTransport 方法

### Phase 2：广播机制统一（3 周）

**目标**：消除跨进程广播的冗余机制

**任务清单**：
- [ ] 将 `StorageModule` 的广播更新迁移到 `TuffTransportMain.broadcast`
- [ ] 将 `PluginModule` 的存储广播迁移到 `TuffTransportMain.broadcast`
- [ ] 将 `WindowManager` 的窗口状态广播迁移到 `TuffTransportMain.broadcast`
- [ ] 废弃 `TouchChannel.broadcast/broadcastTo` 方法（标记 @deprecated）
- [ ] 更新所有文档和示例代码

**迁移策略**：
```typescript
// Before (Legacy)
touchChannel.broadcast('storage:updated', { key: 'config' })

// After (TuffTransport)
tuffTransportMain.broadcast(StorageEvents.UPDATED, { key: 'config' })
```

**交付物**：
- 更新后的模块代码
- 废弃的 TouchChannel 方法
- 更新的开发者文档

### Phase 3：模块级迁移（4 周）

**目标**：逐模块迁移所有 TouchChannel 直接调用

**迁移优先级**（按风险和影响排序）：

| 优先级 | 模块 | 调用点数 | 风险等级 |
|--------|------|----------|----------|
| P0 | Storage Module | ~25 处 | 高 |
| P0 | Plugin Module | ~30 处 | 高 |
| P1 | Auth Module | ~15 处 | 中 |
| P1 | Sync Module | ~12 处 | 中 |
| P1 | Database Module | ~8 处 | 中 |
| P2 | CoreBox Module | ~10 处 | 低 |
| P2 | Intelligence Module | ~8 处 | 低 |
| P2 | 其他模块 | ~12 处 | 低 |

**每个模块的迁移流程**：
1. 识别所有 `regChannel` 和 `send` 调用
2. 在 `packages/utils/transport/events/` 中定义缺失的事件
3. 替换 raw channel 调用为 TuffTransport SDK 调用
4. 运行类型检查和单元测试
5. 运行集成测试
6. 代码审查

**示例迁移**：
```typescript
// Before (Legacy - Storage Module)
regChannel(ChannelType.MAIN, 'storage:get', async (data) => {
  const value = await storage.get(data.key)
  data.reply(value)
})

// After (TuffTransport - Storage Module)
// 在 packages/utils/transport/events/storage.ts 中定义事件
export const StorageEvents = defineDomain('storage', {
  GET: defineEvent<StorageGetRequest, StorageGetResponse>('get'),
  SET: defineEvent<StorageSetRequest, void>('set'),
})

// 在 StorageModule 中注册处理器
tuffTransportMain.on(StorageEvents.GET, async (req) => {
  return await storage.get(req.key)
})
```

**交付物**：
- 每个模块的迁移代码
- 新增的事件定义
- 更新的测试用例

### Phase 4：清理与验证（2 周）

**目标**：完成最终清理，确保系统稳定

**任务清单**：
- [ ] 移除所有 `@deprecated` 的 TouchChannel 方法
- [ ] 移除 `touchEventBus.emit` 的跨进程使用
- [ ] 更新所有开发者文档和 API 参考
- [ ] 运行完整回归测试
- [ ] 性能基准测试
- [ ] 更新 AGENTS.md 中的 IPC 相关指南

**交付物**：
- 清理后的代码库
- 更新的文档
- 性能报告
- 迁移完成报告

---

## 5. 风险评估与缓解

### 5.1 高风险项

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 插件兼容性破坏 | 插件无法正常通信 | 保持 TouchChannel 作为内部实现，不暴露给插件 API |
| 性能回退 | IPC 延迟增加 | 迁移前后进行性能基准测试，确保无显著回退 |
| 数据丢失 | 存储更新丢失 | 迁移期间保留双写机制，验证数据一致性 |

### 5.2 中风险项

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 类型定义不完整 | 编译错误 | Phase 1 充分审计事件定义缺口 |
| 模块间依赖 | 迁移顺序错误 | 按依赖拓扑排序迁移，先基础模块后上层模块 |
| 测试覆盖不足 | 遗漏边界情况 | 增加 IPC 集成测试覆盖率 |

### 5.3 低风险项

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 文档过时 | 开发者困惑 | 同步更新文档，标记废弃 API |
| 工具链适配 | lint 规则失效 | 更新 ESLint 规则，检测 raw channel 调用 |

---

## 6. 成功标准

### 6.1 功能标准

- [ ] 所有 IPC 通信通过 TuffTransport 进行
- [ ] 无 `TouchChannel` 直接调用（lint 规则验证）
- [ ] 所有事件在 `packages/utils/transport/events/` 中定义
- [ ] 类型安全覆盖率 100%

### 6.2 质量标准

- [ ] 所有现有测试通过
- [ ] 新增 IPC 集成测试
- [ ] 性能基准测试无显著回退（<5%）
- [ ] 代码审查通过

### 6.3 文档标准

- [ ] 开发者文档更新
- [ ] API 参考更新
- [ ] 迁移指南发布
- [ ] AGENTS.md 更新

---

## 7. 时间线

```
┌─────────────────────────────────────────────────────────────────┐
│  2026 Q2 迁移时间线                                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Week 1-2: Phase 1 - 基础设施准备                                │
│  ├── 审计调用点                                                  │
│  ├── 补充事件定义                                                │
│  └── 创建迁移工具                                                │
│                                                                  │
│  Week 3-5: Phase 2 - 广播机制统一                                │
│  ├── Storage 广播迁移                                            │
│  ├── Plugin 广播迁移                                             │
│  └── WindowManager 广播迁移                                      │
│                                                                  │
│  Week 6-9: Phase 3 - 模块级迁移                                  │
│  ├── P0 模块迁移 (Storage, Plugin)                               │
│  ├── P1 模块迁移 (Auth, Sync, Database)                          │
│  └── P2 模块迁移 (CoreBox, Intelligence, 其他)                   │
│                                                                  │
│  Week 10-11: Phase 4 - 清理与验证                                │
│  ├── 移除废弃代码                                                │
│  ├── 回归测试                                                    │
│  └── 性能验证                                                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 8. 附录

### 8.1 相关文件

- `packages/utils/transport/events/` - 事件定义
- `packages/utils/transport/sdk/` - Transport SDK 实现
- `apps/core-app/src/main/core/channel-core.ts` - TouchChannel 实现
- `apps/core-app/src/main/core/channel-missing-handler-policy.ts` - 缺失处理器策略

### 8.2 参考文档

- [项目综合分析报告](../.workflow/.scratchpad/analyze-20260614213127/COMPREHENSIVE-REPORT.md)
- [AGENTS.md](../../AGENTS.md) - IPC 相关规范
- [SDK Hard-Cut 计划](./SDK-HARD-CUT-PLAN.md) - 相关迁移计划