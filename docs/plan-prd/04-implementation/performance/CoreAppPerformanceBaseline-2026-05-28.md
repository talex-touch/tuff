# CoreApp 性能基线与优化执行计划

> 更新时间：2026-05-28
> 状态：当前参考 / 第一轮观测闭环
> 适用范围：`apps/core-app` 启动性能、CoreBox 搜索响应、常驻 CPU/内存、构建速度与包体。
> 非目标：本文件不宣称任何性能问题已经修复；不替代真实设备 benchmark、packaged smoke、Windows/macOS release-blocking evidence。

## 1. Final Goal

### 业务目标

- CoreApp 启动、CoreBox 搜索和后台常驻任务必须能用可复现数据解释性能变化，避免凭体感做高风险改动。
- 对用户可感知路径建立 p50 / p95 / p99：启动首屏、CoreBox 输入到首帧、CoreBox layout stable、idle 常驻占用。

### 工程目标

- 先建立统一输出格式和采集命令，再推进低风险优化。
- 所有中高风险性能重构必须有门槛：基线数据、回归矩阵、失败回滚、行为兼容说明。
- 不改变现有 `build` / `quality:release` 语义；新增快速构建和包体分析脚本仅用于性能分析。

## 2. Scope / Non-goals

### Scope

1. 启动性能：主进程入口、`TouchApp`、`TouchWindow`、`ModuleManager`、重点启动模块。
2. CoreBox：renderer 输入、IPC、`SearchEngineCore`、provider gather、排序、增量结果、列表渲染、窗口 resize。
3. 常驻性能：`PollingService`、`PerfMonitor`、Clipboard、OCR、Terminal、Storage/Database、Watcher。
4. 构建与包体：typecheck、`electron-vite build`、`electron-builder --dir`、`out` / `dist` / `app.asar.unpacked` 体积。

### Non-goals

- 不直接并行化全部启动模块。
- 不跳过 Storage hydration 或 onboarding 判定。
- 不绕过插件权限、SDK hard-cut、secure-store 或 typed transport 约束。
- 不以 dev-only / memory fallback / mock 数据作为生产性能完成证据。
- 不把 quick build 用作 release gate。

## 3. 统一输出格式

第一轮所有性能证据应尽量落到 `docs/engineering/reports/` 下，建议结构：

```text
docs/engineering/reports/coreapp-performance-baseline-YYYY-MM-DD/
  README.md
  startup/
    dev-summary.json
    packaged-hot-summary.json
    packaged-cold-summary.json
  corebox/
    search-trace-stats.json
    input-to-paint-samples.jsonl
  runtime/
    idle-30m-snapshot.json
    clipboard-10m-snapshot.json
    watcher-event-storm-snapshot.json
  build/
    typecheck-node.txt
    typecheck-web.txt
    electron-vite-build.txt
    bundle-size-report.json
```

建议 JSON 顶层字段：

```json
{
  "generatedAt": "2026-05-28T00:00:00.000Z",
  "git": {
    "branch": "<branch>",
    "sha": "<sha>",
    "dirty": true
  },
  "environment": {
    "os": "darwin",
    "arch": "arm64",
    "node": "22.16.0",
    "electron": "41.3.0",
    "profile": "dev|packaged-hot|packaged-cold|idle|stress"
  },
  "metrics": {},
  "gate": {
    "passed": false,
    "warnings": [],
    "failures": []
  }
}
```

## 4. 启动性能基线

### 关键文件

- `apps/core-app/src/main/index.ts`
- `apps/core-app/src/main/core/index.ts`
- `apps/core-app/src/main/core/touch-app.ts`
- `apps/core-app/src/main/core/touch-window.ts`
- `apps/core-app/src/main/core/module-manager.ts`
- `apps/core-app/src/main/core/startup-module-loader.ts`

### 必采阶段

| 指标 | 起点 | 终点 | 目的 |
| --- | --- | --- | --- |
| `main.entry.to.whenReady` | main bundle 入口 | `app.whenReady()` callback | 识别顶层 import / Electron ready 前成本 |
| `startup.guard.duration` | `enforceDevReleaseStartupConstraint()` 前 | guard 完成 | 避免把 guard 误记为 Electron ready |
| `touchApp.create.duration` | `genTouchApp()` 前 | `genTouchApp()` 后 | 拆分构造期同步 IO / 窗口创建 |
| `touchWindow.create.duration` | `new TouchWindow()` 前 | BrowserWindow 创建完成 | 判断 Mica/Vibrancy/窗口创建成本 |
| `renderer.load.duration` | `loadFile/loadURL` 前 | load promise resolve | 页面资源加载耗时 |
| `renderer.firstUsable.duration` | renderer script start | Vue mounted / first interactive | 用户可感知首屏 |
| `modules.total.duration` | `loadStartupModules()` 前 | 所有模块 loaded | 启动健康完成 |
| `module.<name>.*` | construct/ensureDir/created/init/start | phase 完成 | 找到串行模块长尾 |

### 第一轮命令

```bash
pnpm -C "apps/core-app" run startup:bench:dev
pnpm -C "apps/core-app" run startup:bench:packaged:hot
pnpm -C "apps/core-app" run startup:bench:packaged:cold
pnpm -C "apps/core-app" run startup:bench:analyze
```

### P0 观测改动候选

- 在 `ModuleManager.loadModule()` 增加 lifecycle phase 指标，但不调整模块顺序。
- 在 `TouchApp.constructor` 拆分 root dir ensure、app-setting 读取、bounds resolve、window create、channel/config create。
- 在 renderer mount 后通过 typed transport 回传 `renderer_script_start`、`vue_mounted`、`first_interactive`。

## 5. CoreBox 搜索基线

### 关键文件

- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useSearch.ts`
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useResize.ts`
- `apps/core-app/src/renderer/src/views/box/CoreBox.vue`
- `apps/core-app/src/main/modules/box-tool/core-box/ipc.ts`
- `apps/core-app/src/main/modules/box-tool/core-box/manager.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/search-gather.ts`
- `apps/core-app/src/main/modules/box-tool/search-engine/sort/tuff-sorter.ts`

### 必采指标

| 指标 | 说明 |
| --- | --- |
| `input.to.querySent` | 用户输入到 renderer 发出 search IPC |
| `querySent.to.mainReceived` | IPC 调度成本 |
| `search.start.to.firstResult` | 主进程搜索首批结果 |
| `input.to.firstResultApplied` | renderer 收到并写入状态 |
| `input.to.firstPaint` | `nextTick + requestAnimationFrame` 后首帧 |
| `input.to.layoutStable` | 最后一次有效 layout update 后稳定 |
| `provider.duration/resultCount/status/layer` | provider 级耗时和结果数 |
| `mergeRank.duration` | 排序和合并同步成本 |
| `update.apply.duration` | 增量 update 写入 renderer 状态耗时 |
| `resize.measure.duration` | `useResize` DOM 测量成本 |

### 第一轮命令

```bash
pnpm -C "apps/core-app" run search:trace:stats -- --input <search-log> --output <report-json>
pnpm -C "apps/core-app" run search:trace:verify -- --input <trace-json-or-log>
```

### 查询样本

- 空查询推荐。
- App 查询：英文、中文、缩写、拼音。
- 插件 feature 查询。
- 文件名查询：小目录、大目录、Everything available/unavailable。
- 连续快速输入：`a` -> `ap` -> `app`。
- provider filter：`@provider query`。

## 6. 常驻 CPU / 内存基线

### 关键文件

- `packages/utils/common/utils/polling.ts`
- `apps/core-app/src/main/utils/perf-monitor.ts`
- `apps/core-app/src/main/modules/clipboard.ts`
- `apps/core-app/src/main/modules/clipboard/clipboard-capture-pipeline.ts`
- `apps/core-app/src/main/modules/storage/index.ts`
- `apps/core-app/src/main/modules/database/index.ts`
- `apps/core-app/src/main/modules/ocr/ocr-service.ts`
- `apps/core-app/src/main/modules/terminal/terminal.manager.ts`
- `apps/core-app/src/main/service/file-watch.service.ts`

### 必采指标

| 类别 | 指标 |
| --- | --- |
| Process | RSS、heapUsed、external、arrayBuffers、CPU delta |
| Event loop | p50/p95/p99/max delay、lag burst count |
| Polling | task count、lane queue depth、inFlight、duration、scheduler delay、dropped、coalesced |
| Watcher | watcher count、watched path count、event rate、reload count |
| Clipboard | poll interval、source、duration、no-change ratio、image bytes、OCR enqueue count |
| OCR | queue depth、activeJobs、worker duration、timeout count |
| DB/Storage | write queue depth、WAL size、checkpoint duration、dirty config count、flush duration |
| Terminal | process count、age、output bytes、destroyed sender count |

### 第一轮场景

```bash
pnpm -C "apps/core-app" run clipboard:stress
pnpm -C "apps/core-app" run clipboard:stress:verify
pnpm -C "apps/core-app" run app-index:diagnostic:verify
pnpm -C "apps/core-app" run everything:diagnostic:verify
pnpm -C "apps/core-app" run update:diagnostic:verify
```

另外需要人工采集：

- 30 分钟 idle。
- 10 分钟高频剪贴板文本 / 图片 / 文件。
- 文件事件风暴。
- dev plugin 热重载。
- OCR 大图。
- Terminal 长任务。

## 7. 构建与包体基线

### 关键文件

- `package.json`
- `pnpm-workspace.yaml`
- `apps/core-app/package.json`
- `apps/core-app/electron.vite.config.ts`
- `apps/core-app/electron-builder.yml`
- `apps/core-app/scripts/build-target/runtime-modules.js`

### 新增脚本

`apps/core-app/package.json` 新增：

```json
{
  "build:vite": "electron-vite build",
  "perf:bundle:size": "node scripts/bundle-size-report.mjs"
}
```

说明：

- `build:vite` 只用于快速 bundle 分析，不替代 `build`、`quality:pr` 或 `quality:release`。
- `perf:bundle:size` 只扫描既有 `out` / `dist` 产物，默认输出 Markdown，可用 `--json --output <file>` 写入基线报告。

### 第一轮命令

```bash
# 完整质量路径，仍保留 typecheck
/usr/bin/time -p pnpm -C "apps/core-app" run build

# 快速 bundle 分析，不跑 typecheck
/usr/bin/time -p pnpm -C "apps/core-app" run build:vite

# 分别观察类型检查耗时
/usr/bin/time -p pnpm -C "apps/core-app" run typecheck:node
/usr/bin/time -p pnpm -C "apps/core-app" run typecheck:web

# 生成 unpacked 后再统计包体
pnpm -C "apps/core-app" run build:unpack
pnpm -C "apps/core-app" run perf:bundle:size -- --json --output ../../docs/engineering/reports/coreapp-performance-baseline-YYYY-MM-DD/build/bundle-size-report.json
```

## 8. 第一批低风险优化排序规则

只有在基线报告能证明收益时才进入实现。

| 优先级 | 候选 | 进入条件 | 风险控制 |
| --- | --- | --- | --- |
| P0 | 补启动 / CoreBox / runtime 指标 | 当前指标无法解释 p95 长尾 | 默认关闭详细日志，避免性能日志反噬 |
| P1 | CoreBox `search.update` 合并与去重 | update 次数高、renderer apply 或 resize 成本高 | 保持结果语义，只减少重复状态更新 |
| P1 | 延后非首屏任务 | 首屏前 update/plugin/analytics/watcher 任务明显占用 | 保留 IPC handler 注册，延后网络/扫描/调度 |
| P1 | `PollingService.unregister()` 清理动态统计 | dynamic task id 增长 | 不清理 in-flight task stats |
| P1 | Terminal transport disposer | 模块 reload 或测试出现重复 handler | destroy 阶段释放，不改变终端进程语义 |
| P1 | `useResize` 测量降本 | forced layout 或 layout update 高频 | 先缓存/采样，再考虑虚拟化 |
| P1 | 快速构建 / 包体报告 | 构建分析耗时高 | 不改变 release gate |

## 9. 高风险重构门槛

### 模块加载 DAG

- 必须先显式声明 `critical`、`renderer-ready`、`after-first-paint`、`idle`、`on-demand`。
- 必须证明串行模块加载是 p95 最大瓶颈。
- 禁止无依赖分析的全局 `Promise.all`。

### Database / Storage

- primary DB 与必要 migration 仍阻塞。
- aux DB、health report、maintenance 可后台化，但必须证明后续模块不依赖。
- 不得跳过 Storage hydration 或 onboarding 判定。

### Plugin / Search

- Manifest、permission、SDK hard-cut 保持早期可用。
- Prelude、widget compile、update scheduler 可分层延迟，但必须验证 CoreBox feature、快捷键和权限 UI。
- provider 并发、timeout、result cap 必须用真实 query 集验证召回质量。

### Renderer / 包体

- 列表虚拟化必须验证键盘导航、active item scroll、窗口高度、custom/widget render。
- `node_modules/**`、`asarUnpack`、runtime manifest 裁剪必须通过 packaged smoke：AI/MCP、libsql、OCR、sharp、ffmpeg、插件编译、terminal。

## 10. 验收清单

- [ ] 启动：dev、packaged hot、packaged cold 都有 summary。
- [ ] CoreBox：至少 200 个 paired search sessions，覆盖空查询、app、文件、插件、连续输入。
- [ ] Runtime：idle 30 分钟、clipboard 10 分钟、watcher storm、OCR、Terminal 均有 snapshot。
- [ ] Build：完整 build、`build:vite`、typecheck node/web、bundle size report 均有记录。
- [ ] 文档：README、TODO、CHANGES、INDEX、04-implementation 索引已同步。
- [ ] 质量：若后续设为门禁，必须同步 Roadmap 与 PRD Quality Baseline；当前第一轮不改变门禁。

## 11. 回滚 / 兼容

- 新增脚本可直接从 `apps/core-app/package.json` 移除，不影响现有 build/release。
- 性能文档只作为当前参考，不改变运行时行为。
- 后续任何 runtime instrumentation 必须支持关闭或采样，避免生产日志、IPC 或磁盘 IO 放大性能问题。
