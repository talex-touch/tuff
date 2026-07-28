# 收敛 nexus 文档内容端点的缓存与降级策略

## Goal

让 nexus 文档站在内容库不可用时**明确失败**而不是返回「成功的空结果」，并保证降级响应永远不进缓存；同时把这套策略收敛成一处共享声明，避免四个端点各写一遍且各自跑偏。

## Confirmed Facts

本轮排查已验证（2026-07-27）：

- 根因是 `better-sqlite3` 原生模块从未编译（`build/` 目录缺失，Node v24.18.0 / ABI node-v137），所有 Nuxt Content 查询返回 500。已用 `pnpm rebuild -r better-sqlite3` 修复。
- `navigation.get.ts` 在 dev 下把该错误吞成 `[]`，侧边栏渲染成空白且无错误态；该 `[]` 被 `defineCachedEventHandler` 缓存 300s（stale 3600s），内容库恢复后侧边栏仍会继续空一小时。该端点已在本轮先行修复（`defineCachedFunction` + 空树抛错逃逸缓存 + 503），10 项测试通过。
- 同一策略共有 4 个调用点，行为各不相同：

  | 端点 | 内容库不可用 | 结果为空 |
  |---|---|---|
  | `navigation.get.ts` | 503（已修） | 不缓存（已修） |
  | `page.get.ts` | dev 下回退读本地 Markdown | `null` 被缓存 300s/3600s |
  | `sidebar-components.get.ts` | 抛 500 | `[]` 被缓存 300s/3600s |
  | `search.get.ts` | 抛 500 | `{items:[]}` 被缓存 300s/3600s |

- `page.get.ts:139` 已有私有熔断窗口 `devDocsContentFallbackUntil`，但另外三个端点看不见这个状态。
- 三个端点各自复制了一份 `*_CACHE_CONTROL` / `MAX_AGE` / `STALE_MAX_AGE` 常量。
- 四个端点都有测试：`test/api/docs/{navigation,page,search,sidebar-components}.get.test.ts`，均以 stub `defineCachedEventHandler` 的方式驱动 handler。

## Requirements

### 失败语义

- 内容库不可用必须响应 5xx（503），不得响应 200 + 空载荷。前端据此进入既有错误态，而不是渲染成「这个分类没有页面」。
- dev 环境的 503 必须携带可执行的修复提示（`pnpm rebuild -r better-sqlite3`）；生产环境不泄漏内部细节。
- 与内容库无关的错误（如 `database is locked`）继续原样抛出，不被降级逻辑吞掉。

### 缓存语义

- 缓存只包住成功路径：降级/失败响应永远不写入缓存。
- 集合级查询（navigation / search / sidebar-components）：空结果永远视为不可用，不缓存。
- 单页查询（page）：`null` 是合法 404，正常缓存；但当共享的「内容库降级」标记生效时，空结果不缓存。
- 保持现有对外缓存语义不变：`public, max-age=300, stale-while-revalidate=3600`，缓存键格式不变（`locale:zh:scope:all` 等）。

### 策略收敛

- 上述策略在 `server/utils/` 下声明一次，四个端点复用；不接受把 navigation 的补丁复制三遍。
- `page.get.ts` 的私有降级窗口提升为共享状态，供四个端点共用。
- 重复的缓存常量收敛到共享模块。

### 可观测性

- 增加启动期健康探针：内容库查询不通时打出醒目且可执行的日志，把「静默几小时」变成一行启动日志。
- 探针不得让应用启动失败，也不得在正常路径上增加每请求开销。

## Acceptance Criteria

- [ ] 四个文档端点共用同一份缓存/降级策略声明，端点内不再各自实现 try/catch 与常量。
- [ ] 内容库不可用时，四个端点均返回 503；dev 下日志与响应含 `pnpm rebuild -r better-sqlite3` 提示。
- [ ] 内容库不可用或结果为空（集合级）时，缓存中不产生对应条目；恢复后首个请求即返回真实数据，无需等待 TTL 过期。
- [ ] `page.get.ts` 对真实不存在的页面仍然缓存 404，且保留 dev 下读取本地 Markdown 的回退能力。
- [ ] 任一端点探测到内容库不可用后，其余端点在降级窗口内共享该判断。
- [ ] 启动期健康探针在内容库不通时输出可执行日志；内容库正常时不产生噪音，且不阻断启动。
- [ ] 四个端点的测试更新到新契约并通过；新增共享工具的单元测试覆盖「空不入缓存」「不可用报 503」「无关错误透传」。
- [ ] `pnpm lint` 对改动文件干净；`vitest run test/api/docs` 全绿。

## Out of Scope

- 前端 `DocsSidebar.vue` 的错误态样式改造（已有 `docsSidebar.error` 分支，本轮只保证它能被触发）。
- 内容库本身的构建/导入流程与 Nuxt Content 版本升级。
- `content-policy` 等非文档内容端点的缓存策略。
- 本地 dev server 进程卫生（同目录并行两个 dev server）——属于环境操作，不产生代码改动。
