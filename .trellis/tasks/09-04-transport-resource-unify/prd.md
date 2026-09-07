# 传输与资源协议统一

Parent: `.trellis/tasks/09-04-corebox-recommend-platform`

## Goal

让空态推荐在既有流式会话内支持**增量追加**(而非一次性快照);
把 tfile 的资源控制面收敛进 transport SDK;
就 `stream:` scheme 给出「建立或放弃」的带证据结论。

## 背景:两次前提校正

父任务需求 3 称「所有 IPC message 信道目前都是同步的,要升级成 Stream」。
勘察后**两层前提都不成立**,本 PRD 基于校正后的事实:

**校正一 —— Stream 基础设施早已存在。**

```ts
// packages/utils/transport/events/index.ts:1119
search.session: define<CoreBoxSearchSessionRequest, AsyncIterable<CoreBoxSearchSessionChunk>>({
  stream: { enabled: true, bufferSize: 100 }
})
```

主进程 `core-box/ipc.ts:328` 已用 `transport.onStream` 接线;
`search.session` 与 `search.indexCommitted` **均已在 `port-policy.ts` 的默认 allowlist 中**。
postMessage 握手升级同样已存在(`transport/port-handoff.ts`)。

**校正二 —— 空态推荐已经走在这条流上。**

```ts
// apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts:1012
if ((!query.text || query.text === '') && (!query.inputs || query.inputs.length === 0)) {
  const recommendationResult = await this.recommendationEngine.recommend({ limit: 10 })
  ...
  result.containerLayout = recommendationResult.containerLayout   // :1060
}
```

空 query 走搜索管线,经 `search.session` 的 `snapshot` chunk 下发,
`TuffSearchResult.containerLayout` 携带分组信息。**不存在「推荐走 bridge 60s 超时」这回事。**

**因此真实缺口是**:推荐在一条**具备流式能力的通道里,仍以一次性 `await` 快照下发**。
`CoreBoxSearchSessionChunk` 已定义 `{ type: 'update', sessionId, items }`
(`transport/events/types/core-box.ts:255`),但空态分支从不发送 update ——
所以插件推送的条目、新索引的 App / 文件都无法追加到**已经打开**的空态会话,
只能等下次重新唤起 CoreBox。这是父任务需求 5、6 的传输侧根因。

**附带发现**:`CoreBoxEvents.recommendation.get` 全仓仅有一个 main 侧注册
(`search-core.ts:2122`),渲染端与插件**均无调用者**,是死信道。
`recommendation.aggregateTimeStats` / `isPinned` 需一并核查。
注意本仓有「刻意保留的死 IPC」先例,**不得直接删除**,须先判定归属。

## 背景:资源协议现状与 spec 不符

| Scheme | `native-resource-protocols.md` §"Three Electron schemes" 的描述 | 代码实测 |
|---|---|---|
| `tfile` | 允许的数据面,registered standard/secure/fetch/stream | ✅ 一致(`main/index.ts:71`) |
| `atom` | "Legacy direct-file forwarding. No new consumer may be added" | ❌ **已退役**,`service/protocol-handler.ts:9` 返回 410 墓碑 |
| `stream` | "A privileged scheme **is registered**, but no resource handler" | ❌ **完全不存在**,既未 `registerSchemesAsPrivileged` 也无 handler |

tfile 实现分散三处:`modules/file-protocol/`(scheme + session 注册 + preview grant)、
`service/protocol-handler.ts`(atom 墓碑)、`renderer/src/utils/tfile-url.ts`(URL 投影)。

## Requirements

### A. 空态推荐增量追加

- A1 空态会话在首帧 `snapshot` 之后,支持通过既有 `{ type: 'update' }` chunk 追加条目。
  首帧不得因此变慢 —— 宫格段仍随 snapshot 一次到位。
- A2 追加触发源至少覆盖:插件 recommend 推送、索引提交(新 App / 新文件)。
  具体的推荐侧触发逻辑归 C3,本任务只负责**传输侧承接与下发**。
- A3 会话生命周期遵守 `channel-transport-contracts.md`
  §"Owner-Bound Stream And MessagePort Lifecycle":`ownerKey` 由宿主从真实 sender + lane 解析,
  不接受 payload 中的 owner 字段;同 owner 重复 streamId 抛 `stream_id_conflict`;
  sender 销毁清理其全部流。
- A4 空态会话关闭后到达的追加必须静默丢弃,不得重建会话状态。
- A5 **不新增** stream 事件,不改 `port-policy.ts` 的 allowlist —— 复用 `search.session`。
  若设计阶段证明必须新增,需在 design 中给出理由并同步 allowlist。

### B. 死信道判定

- B1 判定 `recommendation.get` / `aggregateTimeStats` / `isPinned` 三者归属:
  真死(可删)、刻意保留(补注释说明保留理由)、或应当接线(补消费者)。
- B2 判定结论写入 `research/`,**不在本任务内执行删除**(删除另行提任务,避免与推荐重构耦合)。

### C. tfile 控制面收敛

- C1 descriptor 类型、URL 投影(`toTfileUrl`)、allowlist 契约**类型**收进 transport SDK,
  成为单一来源,供主进程 / 渲染端 / 插件 SDK 共用。
- C2 **资源字节不动**:仍由 `tfile` scheme 的 streaming 响应承载;
  `transport/sdk/stream/protocol.ts` 不得携带 image/audio/video/file 字节。
- C3 路径规范化与 `getAllowedLocalFileRoots()` 的**判定逻辑留在主进程**,只有类型上移。
  收敛不得新建第二套 path policy。
- C4 `cache/app-icons` 根必须继续通过,否则全部图标 403 退化为占位符。

### D. `stream:` scheme:建立或放弃

- D1 **准入门禁**:先给出至少一个真实消费者场景 —— tfile 覆盖不到、必须动态流式生成的资源。
- D2 门禁通过 → `registerSchemesAsPrivileged` 增加 `stream`,实现 handler,
  补 owner / URL / allowlist 契约与 400/403/404 矩阵,与 tfile 共用路径规范化。
- D3 门禁不通过 → **砍掉**,并在 PRD 与 spec 记录理由。
  spec 明写 `stream:` 不得成为无契约的 blob 隧道,空转注册一个无消费者的 scheme 比不注册更糟。

### E. spec 修正(无论 D 如何取舍都必须做)

- E1 `native-resource-protocols.md` 的 `atom` 行改为「已退役,返回 410 墓碑」。
- E2 `stream` 行改为代码现状(未注册未实现),或在 D2 落地后替换为完整契约段。

## 非目标

- 不改推荐评分、维度、来源注册、缓存失效范围(属 C1 / C3)。
- 不改 `search.session` 既有的搜索路径行为。
- 不放宽 transport stream protocol 的字节禁令。
- 不重启 `atom:`。
- 不在本任务删除死信道。

## 实现记录(2026-09-04)

Step 0 的调查推翻了 A 部分的设计形态,详见 `research/step0-findings.md`。

### A 的形态变了:不是「往开着的会话里追加」,而是「让空态参与 index-commit 刷新」

`session.complete()` → `sink.complete` → `context.end()`(`core-box/ipc.ts:95-99`)——
**空态会话在 snapshot 之后立即终止**,不存在可追加的会话。

真正的缺口在两处,都不在传输层:

1. `useSearch.shouldRefreshForIndexCommit()` 有 `Boolean(searchVal.value.trim())`,
   **显式排除空 query** —— 即使主进程已经失效了推荐缓存,打开着的 CoreBox 也不会重查。
2. 主进程的失效判定(`providerIds.includes(APP_INDEXED_SOURCE_ID)`)只留在自己进程内,
   渲染端无从得知这次提交是否与推荐有关。

落地方案:`CoreBoxSearchIndexCommitPayload` 增加 `recommendationsInvalidated?: boolean`,
由主进程在做失效判定的同一处写入;渲染端空 query 仅在该标记为真时刷新。
**复用已有的长连 `indexCommitted` 流,未新增 stream 事件、未改 port allowlist**(满足 A5)。

判定留在主进程是刻意的:渲染端无法从 `providerIds` 推断相关性,而 C3 要把文件纳入推荐时,
节流与准入规则也应该长在同一处。

### `update` chunk 的排序问题不存在

`design.md` §2.4 的三选一不需要选:渲染端 `mergeRenderedItems` → `rankRenderedItems`
(`useSearch.ts:544`)**已经按 `item.scoring.final` 重排**,推荐项经
`mergeAndEnrichItems` 已带该字段。

### C 的实质是删掉重复实现

tfile URL 构造原有**两份**:`packages/utils/network/file.ts#toTfileUrl`(主进程 + 渲染端
`icon-config.ts`)与 `renderer/src/utils/tfile-url.ts#buildTfileUrl`(渲染端 6 个组件)。
两者对本地路径一致,但后者把 `https://` / `data:` / 相对路径强转成畸形 tfile URL。
已删除后者,6 个调用点改用共享实现,并移除 `useWallpaper` 中因此多余的手写守卫;
`toTfileUrl` 补了 11 条测试(此前零覆盖)。

### D 门禁:未通过,`stream:` 已砍

清点全部资源消费场景后无一需要字节流式 scheme(证据见 research §3)。
唯一的边界案例是 TTS 音频以 base64 data URL 跨 IPC ——
那是既有违规,修法是物化 + tfile,不是新建 scheme,**另提任务**。

## Acceptance Criteria

- [x] 已打开的空态在 recommendation-relevant 的索引提交后自动刷新(此前必须关掉重开)。
      形态由「追加 chunk」改为「index-commit 触发重查」,理由见上。
- [x] 索引构建期不刷新风暴:未标记的提交不触发空态刷新;debounce 窗口内
      未标记的提交不会取消已标记的(两条判别性测试,旧逻辑下均失败)。
- [x] 未新增 stream 事件,未改 `port-policy.ts` allowlist。
- [x] 三个推荐信道的归属判定落盘(`research/step0-findings.md` §1):
      `get` / `aggregateTimeStats` / `isPinned` 均为真死;`reportExposure` 活的。**未执行删除**。
- [x] tfile URL 构造收敛为单一实现;`toTfileUrl` 有 11 条测试覆盖
      (本地路径 / 非本地透传 / 空输入 / Windows 盘符编码)。
- [x] `stream:` 有带证据的结论(砍掉),spec 已改为「未注册、未实现;标识符保留」。
- [x] `native-resource-protocols.md` 的 `atom`(已退役 410)/ `stream`(不存在)描述与代码一致。
- [x] `pnpm lint`(core-app + utils)、`typecheck`(node + web)、
      renderer box + search-engine 92 文件 842 测试全绿。

**未做/超出范围**:
- 死信道删除(判定已落盘,删除另提任务)
- TTS 音频 data URL 违规(另提任务)
- tfile descriptor 类型上移 transport SDK —— 实测发现 `toTfileUrl` 已在
  `packages/utils/network`,收敛的实际内容是消除重复而非搬家;
  再往 `transport/` 搬是纯粹的位置调整,收益不足以抵消改动面,**未做**。

## 风险

- **D 的门禁是本任务最大不确定性**。「启用 `stream:`」是用户明确选择,但勘察后发现它不是
  「打开已注册的开关」而是「从零建立一套协议 + 契约」。结论须在 design 阶段带证据给出并回报用户,
  不在实施期临时决定。
- A1 的「首帧不变慢」与「支持追加」有张力:若把空态分支改成边算边推,可能推迟宫格段。
  设计上应保持 snapshot 语义不变,追加只作为额外 chunk 叠加。
- `port-policy.ts` 的 `TALEX_TRANSPORT_PORT_CHANNELS` 环境变量一旦设置就**替换**而非追加默认集合。
  即便本任务不改 allowlist,涉及该文件时也要留意这个语义。
- tfile 控制面上移 `packages/utils` 等于随 npm 发布、成为对外公开面。范围必须止于类型与 URL 投影。
