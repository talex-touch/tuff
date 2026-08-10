# 实验：sandbox iframe 里的死循环会不会冻住应用

日期：2026-08-09 ｜ 运行时：Electron 41.10.2（仓库内 `node_modules/.pnpm/electron@41.10.2`）

## 为什么必须先做这个

arrow-js 要操作 DOM，所以模型代码必须跑在有 DOM 的线程上 —— Worker 方案（模型代码无 DOM、只吐 UI 描述）与 arrow-js 不兼容。那么"沙箱 iframe 里的 `while(true)` 会不会把整个应用冻住"就不是一个待办事项，而是**架构成立与否的前提**：如果会冻住，arrow-in-iframe 这条路直接不成立。

## 方法

父页面用 `setInterval(…, 10)` 计数（**不用 rAF** —— 隐藏或被遮挡的窗口会节流 rAF，会伪造出"被阻塞"的假象）。先注册 2000ms 的测量窗口结束定时器，**再**触发被测的阻塞行为，否则同步阻塞会落在窗口之外。窗口内理论满值 ≈ 200 tick。

`webPreferences: { backgroundThrottling: false }`，窗口 `show: true`。

复现：`<electron> research/iframe-isolation-probe.js <mode>`，mode ∈ `parent` / `plain` / `sandboxed`。

## 结果

| mode | 说明 | 父线程 ticks | 判定 |
|---|---|---|---|
| `parent` | 父线程自己跑 3s 死循环 | 1 | BLOCKED |
| `plain` | 普通同源 iframe（无 sandbox 属性）跑 3s 死循环 | 1 | BLOCKED |
| `sandboxed` | `sandbox="allow-scripts"`（无 `allow-same-origin`）跑 3s 死循环 | **200** | **ALIVE** |

补充确认（第四次运行，观测窗延长到 5s）：`scriptStarted=true`、`loopFinished=true`、`ticks=200`。

## 对照的作用

- `parent` 是**正控**：证明这把尺子测得出阻塞。没有它，200 tick 说明不了任何事。
- `plain` 是**关键对照**：普通 iframe 同样把父线程打死，说明隔离**不是 iframe 自带的**，而是 `sandbox` 属性造出的不透明源换来的。
- `scriptStarted` / `loopFinished` 排除了最危险的假阳性 —— "父线程没被冻住"是因为沙箱脚本压根没执行（比如被 CSP 拦了）。

## 结论

Electron 41 / Chromium 会把不透明源的 sandbox iframe 隔离到独立进程。**因此：**

1. 不需要 Worker 层。模型代码在 iframe 主线程上跑，可以直接用 arrow-js 操作 DOM。
2. 死循环的爆炸半径被限制在那个 widget 里，不影响应用。
3. 但 watchdog 仍然要做 —— 隔离解决的是"不冻住别人"，解决不了"这个 widget 自己卡死了"。宿主需要能检测无响应并把 iframe 拆掉。

## 有效期

这是一条**运行时行为**结论，不是规范保证。Chromium 的沙箱 iframe 进程隔离策略可能随版本变化。升级 Electron 大版本后应重跑此实验；探针已随任务保留。
