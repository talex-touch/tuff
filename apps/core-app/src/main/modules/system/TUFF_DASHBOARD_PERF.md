# 详细信息（Dashboard / LingPan）性能分析落地

## 背景与现象

「详细信息」页面通过 IPC 事件 `tuff:dashboard` 拉取快照。当前已观察到渲染进程侧的告警：

- `[Channel][send][slow] "tuff:dashboard" took 4801.7ms { payloadPreview: "{limit:50}", stack: ... }`

这类日志**仅说明“渲染进程的 send Promise 直到 resolve 的总耗时很长”**，并不等价于“主进程 handler 很慢”。总耗时可能包含：

- 主进程 handler 执行时间（构建 snapshot）
- IPC 序列化/反序列化与拷贝成本（payload 体积越大越明显）
- 渲染进程主线程阻塞（路由过渡动画、重渲染、同步计算）导致回复消息延后被处理
- 主进程事件循环阻塞（同步 CPU 任务、磁盘 IO 压力、线程池饱和）导致 handler/回复延后

因此需要拆分端到端耗时，形成“可证伪”的证据链，而不是凭感觉优化。

---

## 已落地的观测点（本次 Debug 工作流）

### 1) IPC 端到端：渲染进程 → 主进程

- 渲染进程：`core-app/src/renderer/src/modules/channel/channel-core.ts`
  - 当 `touchChannel.send(...)` 超过阈值会通过 `touch:perf-report` 上报（含 `syncId`）
- 主进程：`core-app/src/main/utils/perf-monitor.ts`
  - 记录 renderer 上报的慢调用
  - 记录 handler 侧耗时（`perfMonitor.recordIpcHandler`）
  - 记录事件循环卡顿（event loop lag）

### 2) `tuff:dashboard` handler 内部拆分

- 主进程：`core-app/src/main/modules/system/tuff-dashboard.ts`
  - 按 section 记录耗时：`indexing / ocr / config / logs / applications / workers`
  - 对日志目录扫描额外记录：dirent 数量、file 数量、`readdir/stat` 耗时

### 3) IPC 序列化成本

- 主进程：`core-app/src/main/core/channel-core.ts`
  - 对 `tuff:dashboard` reply 的 `structuredStrictStringify + JSON.parse` 做耗时与 payload 字节数记录

### 4) UI：路由过渡动画与页面渲染

- 过渡动画：`core-app/src/renderer/src/views/layout/AppLayout.vue`
  - 记录 `route-slide` enter 实际耗时（>500ms 或 `/details` 强制记录）
- 详细信息页：`core-app/src/renderer/src/views/base/LingPan.vue`
  - 记录 fetch 耗时（等待 `tuff:dashboard`）
  - 记录 render 耗时（`nextTick + rAF` 后认为 DOM 已完成一次绘制）
  - 记录总耗时（load 全链路）

---

## NDJSON Debug Log（核心证据）

调试日志以 NDJSON 写入：

- `.workflow/.debug/<sid>/debug.log`

`sid` 由 `.workflow/.debug/active-session.json` 控制（启用/切换 session 不需要改代码）。

日志字段（每行一个 JSON）：

- `sid`：session id
- `hid`：假设编号（H1/H2/...）
- `loc`：插桩位置（逻辑位置）
- `msg`：事件类型
- `data`：关键数据（已做安全截断）
- `ts`：时间戳（ms）

---

## 假设（Hypotheses）与如何证伪

### H1：主进程 `tuff:dashboard` 构建 snapshot 本身很慢

证据：
- `hid=H1` 的 `section.timing` / `snapshot.built` 中，某个 section 耗时显著偏大（接近秒级）

下一步动作：
- 针对该 section 做更细分拆解（比如 DB 查询/文件扫描的子步骤）

### H2：主进程不慢，但渲染进程被阻塞导致 `send` 看起来很慢

证据：
- `hid=H1`（handler）耗时很小，但 `hid=H2`（renderer send slow）很大
- 同时间段 `hid=H4`（event loop lag）或 `hid=H6`（UI transition/render）出现明显峰值

下一步动作：
- 优先处理 UI 侧长任务：过渡动画、巨型 DOM、同步计算、过度 watcher/计算属性

### H3：payload 太大或序列化成本太高

证据：
- `hid=H3` 的 `bytes` 明显偏大，且 `encodeDurationMs/parseDurationMs` 占比显著

下一步动作（按收益排序）：
- 分段加载：按 tab 或折叠面板懒加载（只拉取当前可见 section）
- 降低 snapshot 体积：减少 `config` 大对象、限制 `logs` 数量、移除不必要字段
- 避免在主线程做大 JSON stringify（必要时改为更轻量的数据结构或流式）

### H4：主进程事件循环卡顿导致所有耗时被放大

证据：
- `hid=H4` 的 `lagMs` 频繁出现或峰值很高（>1s）

下一步动作：
- 查找同步 CPU 任务、同步 IO、线程池饱和点（典型：大量 `stat`/hash/解析）

### H5：日志目录扫描导致耗时过大（高概率）

证据：
- `hid=H5` 的 `filesCount` 很大且 `statDurationMs` 很高

下一步动作：
- 加缓存（例如 5~15s 内复用上次结果）
- 减少 `stat` 次数（如果日志文件名含时间戳可直接排序；否则考虑分批/限流）
- 限制并发 `stat`（避免拖垮线程池影响其它 IO）

---

## 复现步骤（建议）

1. 确认 `.workflow/.debug/active-session.json` 中 `enabled=true`
2. 启动开发环境后进入「详细信息」页（`/details`），点击刷新或切换 ROWS
3. 如果要观察过渡动画，连续切换几个页面再回到 `/details`
4. 复现后检查：
   - `.workflow/.debug/<sid>/debug.log` 是否有新增行
   - 主进程控制台是否有 Perf/IPC 相关 warn/error

---

## 输出解读（最重要的 3 个对比）

1) `H2 (renderer send)` vs `H1 (handler)`：
- `H2 >> H1`：UI 卡顿/事件循环卡顿/序列化
- `H1 >> H2`：确实是 handler 慢（锁定具体 section）

2) `H3 bytes/serializeMs`：
- payload 越大越容易引发“看似随机”的卡顿（GC + JSON 处理）

3) `H6 ui.route.transition` + `ui.details.render/total`：
- 过渡动画耗时异常通常意味着主线程被长任务打断（不是 CSS 写得慢）

