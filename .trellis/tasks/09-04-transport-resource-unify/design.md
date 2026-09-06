# Design — 传输与资源协议统一

Parent: `.trellis/tasks/09-04-corebox-recommend-platform`

## 1. 边界

| 部分 | 主要文件 | 性质 |
|---|---|---|
| A 增量追加 | `search-engine/search-core.ts`(空 query 分支)、`core-box/ipc.ts` | 行为扩展 |
| B 死信道判定 | `research/` | 只调查,不改代码 |
| C tfile 控制面 | `packages/utils/transport/` + `renderer/src/utils/tfile-url.ts` | 类型搬迁 |
| D `stream:` scheme | `main/index.ts`、新建 handler | **门禁后才动** |
| E spec 修正 | `.trellis/spec/frontend/native-resource-protocols.md` | 文档 |

## 2. A — 空态推荐增量追加

### 2.1 现状形态

```ts
// search-core.ts:1012 空 query 分支(简化)
const recommendationResult = await this.recommendationEngine.recommend({ limit: 10 })
const recommendationItems = fileFilterService.filterSearchItems(recommendationResult.items)
const result = new TuffSearchResultBuilder(query).setItems(recommendationItems).build()
result.containerLayout = recommendationResult.containerLayout   // :1060
// → 作为 search.session 的 snapshot chunk 一次性下发,此后该会话不再有推荐相关 chunk
```

### 2.2 目标形态

**snapshot 语义完全不变**(保证首帧不回归),追加只作为叠加的额外 chunk:

```
唤起 CoreBox(空 query)
  │
  ├─ snapshot chunk ── recommend() 一次性结果 + containerLayout   ← 与现状逐字节一致
  │
  └─ 会话保持开启,订阅追加源
        ├─ 插件 recommend 推送        (C3 提供触发)
        └─ 索引提交(新 App / 新文件) (C3 提供触发)
              │
              └─ update chunk ── { type: 'update', sessionId, items }   ← 既有 chunk 类型,无需新增
```

关键点:**不新增 stream 事件、不改 allowlist**。`CoreBoxSearchSessionChunk` 的
`update` 分支(`transport/events/types/core-box.ts:255`)已经存在且渲染端已能处理搜索结果的 update,
空态只是复用同一条路。

### 2.3 会话与 owner

追加订阅的生命周期必须绑在**流的 owner** 上,而不是 sessionId 上:

- 订阅在 `onStream` handler 内建立,随 `AsyncIterable` 的终止(end / error / cancel)解除。
- 遵守 `channel-transport-contracts.md` §"Owner-Bound Stream And MessagePort Lifecycle":
  `ownerKey` 由宿主从真实 sender + lane 解析,**不接受 payload 中的 owner 字段**;
  同 owner 重复 streamId 抛 `stream_id_conflict`;sender 销毁清理其全部流。
- 会话关闭后到达的追加:静默丢弃。既不重建状态,也不记 warn(否则关窗时会刷屏)。

### 2.4 追加的排序问题(需在 design review 定)

`update` chunk 追加的条目**无法重排已下发的 snapshot**。三种处理:

| 方案 | 行为 | 代价 |
|---|---|---|
| 追加到末尾 | 新条目永远排在推荐末尾 | 高分新条目被埋 |
| 追加 + 让渲染端按分数插入 | 需要 chunk 携带分数 | 渲染端承担排序职责 |
| 追加 + 补发 snapshot | 语义最干净 | 视觉跳变,首帧优势被抵消 |

**倾向方案二**,但需确认渲染端当前对搜索 `update` 的处理方式是追加还是重排 —— 实施前必须确认,
若渲染端已有重排逻辑则直接复用,不要新造。

## 3. B — 死信道判定

对 `recommendation.get`(`search-core.ts:2122`)、`aggregateTimeStats`、`isPinned` 各自回答:

1. 渲染端 / 插件 / 测试中是否有调用者(grep 全仓,含 `plugins/` 与 `packages/`)
2. `legacy-alias-tombstones.ts` 中的墓碑条目说明它曾被外部使用过 —— 是否仍需为外部插件保留
3. 结论三选一:真死可删 / 刻意保留(补注释) / 应当接线(补消费者)

**本任务不执行删除。** 本仓有「刻意保留的死 IPC」先例,贸然删除会破坏未记录的外部契约。

## 4. C — tfile 控制面收敛

### 4.1 上移什么 / 不上移什么

```
packages/utils/transport/  ←── 上移(类型与纯函数)
  ├─ 资源描述符类型      TfileResourceDescriptor { url: `tfile://${string}`, ... }
  └─ URL 投影            toTfileUrl(absolutePath)   ← 纯字符串变换,无 fs、无 electron

apps/core-app/src/main/  ←── 留下(判定逻辑)
  ├─ getAllowedLocalFileRoots()      ← 依赖 app.getPath,必须留主进程
  ├─ 路径规范化与 allowlist 判定      ← 授权边界,上移即扩大攻击面
  └─ modules/file-protocol/          ← scheme 注册、session 注册、preview grant
```

判据:**只上移不需要 electron / fs 的部分**。一旦某个符号需要 `app.getPath`,它就必须留在主进程。

### 4.2 强制断言

- 静态测试:`packages/utils` 内不得出现 `getAllowedLocalFileRoots` 的实现。
- 静态测试:transport stream protocol 的 payload 类型不含
  `Buffer` / `ArrayBuffer` / base64 / 图像字节字段。
- 运行时冒烟:`cache/app-icons` 图标 `naturalWidth > 0`,`.tuff-icon__empty` 计数为 0。
  这条是 `native-resource-protocols.md` 明确记载过的回归模式(收窄 allowlist 导致全部图标 403)。

## 5. D — `stream:` scheme 门禁

### 5.1 门禁问题

必须先回答:**有什么资源是 tfile 覆盖不到的?**

tfile 的形态是「主进程把字节物化到 allowlist 目录下的文件,再返回 `tfile://` URL」。
覆盖不到的只可能是:

- 体积大到不宜落盘的资源
- 生命周期极短、落盘再删得不偿失的资源
- 真正的持续流(音频 / 视频实时流),没有「完整文件」这个中间态

若当前及可预见的需求都能用「物化 + tfile」满足,则 `stream:` 无消费者。

### 5.2 两条分支

**通过** → 需交付:scheme 注册、handler、URL 契约(形态 / 参数 / 生命周期)、
owner 归属、allowlist 规则(**复用** tfile 的路径规范化,不新建 path policy)、
400/403/404 矩阵、spec 契约段。

**不通过** → 交付一份「为何不建立」的记录,并把 spec 的 `stream` 行改为
「未注册、未实现;标识符保留」。这不是失败结论 —— 空转注册一个无消费者的 privileged scheme,
比不注册的风险更高。

### 5.3 结论回报

门禁结论属于**用户决策的修订**(用户在信息不完整时选择了「启用」)。
结论必须回报用户确认,不得由实施者单方面决定砍或不砍。

## 6. 兼容性与回滚

- A 部分:snapshot 路径不变 → 追加逻辑出问题时,禁用订阅即完全回到现状。
- C 部分:类型搬迁为纯重构,`toTfileUrl` 在原位置保留 re-export,渲染端调用点可分批迁移。
- D 部分:门禁前不动任何代码。
- 无 schema 变更;无 `recommendation.source` 联合类型变更 → 不触发父任务三文件同步约束。

## 7. 测试策略

| 层 | 断言 |
|---|---|
| 空态会话 | snapshot 内容与改造前一致;update chunk 可追加;首帧耗时无回归(有数字) |
| Owner 绑定 | 两 sender 同 streamId 互不干扰;跨 owner 取消无效;sender 销毁只清自己 |
| 关闭后追加 | 静默丢弃,无状态重建,无日志 |
| 类型边界 | `packages/utils` 无 allowlist 实现;stream payload 无字节字段 |
| 资源回归 | app-icons 图标加载成功,占位符计数 0 |
| `stream:` (若建立) | 400/403/404 矩阵;与 tfile 共用 path policy 的证明 |
