# Design — 记忆独立子页

以父任务 `design.md` §6 为准。

## 文件

| 文件（`apps/core-app/src/renderer/src/`） | 职责 |
|---|---|
| `views/base/intelligence/IntelligenceMemoryPage.vue` | split 页编排：搜索 / 筛选 / 分页状态、选中项、编辑态、删除确认 |
| `components/intelligence/memory/MemoryList.vue` | aside 列表：行渲染、选中、首次加载骨架（`TxRowSkeleton` + `useDeferredLoading`）、键盘导航 |
| `components/intelligence/memory/MemoryDetail.vue` | detail：全文、注入说明、来源与审计字段、启停 / 编辑 / 删除动作 |
| `components/intelligence/memory/MemoryEditor.vue` | 新建 / 编辑表单与评估结果卡，从 `IntelligenceMemoryReview.vue:376-523` 迁出，逻辑不变 |
| `components/intelligence/memory/memory-scope.ts` | `memoryScopeEffect(item)` 与默认值常量 |
| `modules/settings/categories.ts` | 新子页条目 |
| `base/router.ts` | `childLoaders['intelligence/memory']` |
| `apps/core-app/uno.config.ts` | `SETTINGS_CATEGORY_ICONS` 加 `i-ri-brain-line` |

- 页面文件名与目录受 `categories.smoke.test.ts:177-190` 约束：拆出的组件不得放进 `views/base/intelligence/`。

## 状态与 SDK 调用

| 动作 | SDK | 之后 |
|---|---|---|
| 加载 / 搜索 / 筛选 / 翻页 | `contextListMemories({ query, type, scope, status, offset, limit: 20 })` | 换条件 offset 归零；保持选中项若仍在当前页 |
| 评估 | `contextEvaluateMemory` | 任一字段变化使评估失效（保留原逻辑） |
| 新建保存 | `contextSaveMemory` | 选中新建的条目、重载列表 |
| 替换 | `contextReplaceMemory({ memoryId, expectedUpdatedAt, evaluationFingerprint, replacement })` | 选中 `replaced.memory.id`；`MEMORY_REPLACE_CONFLICT` → 重载并保持或重选 |
| 启停 | `contextSetMemoryEnabled` | 只更新本地行的 `enabled / updatedAt`，不重排 |
| 删除 | 确认后 `contextDeleteMemory({ memoryId, reason: 'user-memory-review-delete' })` | 提示「后续回答不会再使用这条记忆」，选中同位置下一条 |

## 范围生效规则（镜像主进程）

| 范围 | 条件 | 结果 | 列表 / 详情标记 |
|---|---|---|---|
| `global` | — | `effective` | 无 |
| `session` | 有 `sourceSessionId` | `source-session-only` | 「仅在来源会话中使用」 |
| `session` | 无 `sourceSessionId` | `inactive` | 「暂不生效」 |
| `workspace` / `project` | — | `inactive` | 「暂不生效」（主进程在 `scopeRef` 稳定前 fail-closed） |

注释写明出处 `intelligence-context-hygiene.ts:1143-1166`，以及主进程规则变化时需同步本文件。

## 键盘与 KeepAlive

- 如用 `useKeyboardNavigation`，用 `enabled` 绑定页面激活态（`onActivated` / `onDeactivated`），避免缓存页继续响应方向键。
- `onActivated` 刷新列表，首次挂载之外的刷新不显示骨架。
