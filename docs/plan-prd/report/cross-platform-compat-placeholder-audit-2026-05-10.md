# 跨平台兼容与占位实现审计报告（2026-05-10）

> 审计范围：`apps/core-app`、`apps/nexus`、`retired AI app`、`packages/*`、`plugins/*` 的生产源码与关键文档入口。
> 当前版本基线：根包与 CoreApp 为 `2.4.10-beta.18`。
> 结论口径：本文只记录可从代码直接验证的事实，不把 UI placeholder、测试 mock、Tuffex `.fake-background` 视觉类名等常规实现误判为假功能。

## 1. 总体结论

整体跨平台策略已经从“乐观支持”转向“显式能力合同”：

- CoreApp 平台能力已集中到 runtime patch 口径，macOS / Windows / Linux 的限制会通过 `supportLevel / issueCode / reason / limitations` 暴露，不再静默冒充 supported。
- Windows App 索引、Everything、Start Menu、UWP、registry uninstall 与启动参数链路已有较多回归覆盖，但仍缺真实 Windows 设备体验证据。
- Linux 目前是 documented best-effort：`xdotool` 与 desktop environment 是明确依赖，不应作为 `2.4.10` blocker。
- 当前最大工程风险不再是单一 legacy runtime 分支，而是 retained raw event 定义、AI 假数据/兼容支付、插件侧 localStorage 持久化、以及若干超长多职责模块。复核口径需要区分“生产 raw send 违规”和“保留的 raw event 定义”：本次扫描未发现生产 `channel.send('x:y')` / `transport.send('x:y')` 直连违规，`ipcRenderer.sendSync` 仅剩负向测试断言；但仍有 342 处 `defineRawEvent` 定义需要后续迁移或解释。

质量判断：主线架构方向正确，但 `2.4.11` 前必须把“假值成功、隐式兼容、不可观测降级”继续收口，否则跨平台体验会在真实设备上表现为不可解释失败。

## 2. 跨平台兼容性

### CoreApp 平台能力

关键事实：

- `apps/core-app/src/main/modules/platform/capability-adapter.ts` 已为 active app、selection capture、auto paste、native share、permission deep-link、Everything、Tuff CLI 等能力做平台分流。
- macOS 侧把 Automation / Accessibility 归为权限相关 best-effort。
- Windows 侧把 PowerShell、Win32 foreground APIs、Everything、`explorer.exe shell:*` 作为明确依赖。
- Linux 侧通过 `apps/core-app/src/main/modules/system/linux-desktop-tools.ts` 探测 `xdotool`，缺失时返回 unsupported reason。

风险：

- Linux 的 best-effort 口径仍缺真实 smoke 与用户提示截图证据。
- Windows / macOS 的 release-blocking 回归仍需要人工矩阵证据，尤其是应用搜索启动、托盘、更新、插件权限与退出释放。
- 平台能力分散在多个业务模块中仍可见，如 `clipboard.ts`、`omni-panel/index.ts`、`flow-bus/native-share.ts`、`app-provider.ts`；长期应继续把平台探测和用户可见诊断集中到 capability runtime。

### Native 能力

关键事实：

- `packages/tuff-native/binding.gyp` 仅在 macOS / Windows 替换 OCR stub；非 macOS/Windows 会保留 `native/src/platform/stub/ocr_stub.cpp`。
- Linux OCR 当前是显式 unsupported stub，返回 `ERR_OCR_UNSUPPORTED_PLATFORM`。

风险：

- 这是可接受的显式不支持，不是伪成功；但用户体验侧需要保证 UI 看到的是 unavailable + reason，而不是空结果或泛化失败。

## 3. 占位、假值、不优雅实现

### P0：AI 系统状态接口返回硬编码假数据

文件：`retired AI app/server/api/system/serve/stat.get.ts`

事实：

- CPU brand 为 `Mock CPU`，model 为 `ai-mock`。
- 磁盘、内存、CPU load 均为固定构造值。

风险：

- 如果该接口进入管理后台或监控面，会形成错误运维判断。
- 这是“假值成功”类型，不应继续作为生产默认返回。

建议：

- 改为真实 runtime metrics provider；不可用时返回 `unavailable` 状态、reason 与 partial data。
- 不要在生产路径继续返回固定 CPU / disk / memory。

### P0：AI 兼容支付仍使用 mock 聊天应用 URL / DUMMY 订单

文件：`retired AI app/server/utils/ai-payment-service.ts`、`retired AI app/server/api/order/price/dummy.get.ts`

事实：

- 订单 URL 形态为 `chatapp://wxpay/ai/mock/${order.id}`。
- `createDummyOrder()` 写入 `type: 'DUMMY'`，并把 `dummy` 价格信息放进订单 meta。

风险：

- 当前文档已说明支付链路本地 mock，但代码仍是生产 API 可达形态；需要明确环境门控和 UI 标识，避免被误认为真实支付。

建议：

- 保留本地开发 mock，但要求 `AI_PAYMENT_MODE=mock` 或等价显式开关。
- 非 mock 环境若真实支付未配置，应返回 `PAYMENT_PROVIDER_UNAVAILABLE`，不要返回 mock URL。

### P1：插件 touch-image 直接使用 localStorage 保存本地图片路径

文件：`plugins/touch-image/src/App.vue`

事实：

- `historyImgs` 从 `localStorage.getItem('historyImgs')` 初始化。
- 新图片路径通过 `localStorage.setItem('historyImgs', JSON.stringify(...))` 保存。

风险：

- 插件侧存储绕过隔离 storage quota / schema / 迁移路径。
- 本地绝对路径属于敏感元数据，长期留在 renderer localStorage 不符合当前 Storage/Security 口径。

建议：

- 改用 plugin storage SDK 或显式插件域 SQLite/加密元数据存储。
- 至少增加路径数量上限、存在性校验与清理策略。

### P1：retained raw event 定义仍大量存在

事实：

- `apps/core-app/src`、`packages` 与 `plugins` 当前扫描到 342 处 `defineRawEvent` 命中。
- `channel.send('x:y')` / `transport.send('x:y')` 生产直连扫描未见命中；`ipcRenderer.sendSync` 仅剩 `plugin-channel-send-sync-hard-cut.test.ts` 的负向断言。
- 这与当前文档中的 `raw channel 13/46` 不是同一指标：后者更接近历史 raw send violation 清册，前者是 retained non-conforming event definition 面。

风险：

- 若统计口径不区分，会误判 SDK hard-cut 进度。
- 新能力若继续复制 raw event 定义，会绕过 typed builder 的 namespace/module/action 约束。

建议：

- 文档与 guard 统一拆成两个指标：`raw send violation` 与 `retained raw event definition`。
- 下一轮优先迁移 CoreBox / terminal / auth / sync / openers 等 shared events 中可表达为 typed builder 的事件。

### P1：超长多职责模块仍是架构健壮性主风险

当前抽样行数：

- `apps/core-app/src/main/modules/clipboard.ts`：3343 行。
- `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts`：2728 行。
- `apps/core-app/src/main/modules/plugin/plugin.ts`：2230 行。
- `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.ts`：3323 行。
- `apps/core-app/src/main/modules/update/update-system.ts`：1689 行。

风险：

- 单文件承载 capture / history / transport / automation、provider orchestration、plugin lifecycle、app source scanning 等多职责，后续兼容修复容易形成横向回归。

建议：

- `clipboard.ts` 优先拆为 capture freshness、history persistence、transport handlers、autopaste automation。
- `search-core.ts` 优先拆 routing、provider orchestration、cache/result merge。
- `plugin.ts` / plugin-module 继续拆 lifecycle、runtime repair、surface wiring、registry。
- `app-provider.ts` 拆 source scanner、launch resolver、metadata enrichment、execute handoff。

## 4. 非问题或低优先级噪声

- `.fake-background` 是 Tuffex / CoreApp 的视觉背景工具类，不等于假实现。
- Vue template 中的 `placeholder` 多为输入框占位文案，不等于占位功能。
- Vitest `vi.mock`、测试里的 `dummy` 样例、publish smoke 的 dummy 文件不计入生产假实现。
- `packages/tuff-native` 的 OCR stub 是显式 unsupported，不是 false-success；只需确保 UI/SDK 不吞掉 reason。

## 5. 下一步建议

### 立即做（2.4.10 收口）

1. 完成 Windows 真机 App 索引与启动体验验证：聊天应用、Codex、Apple Music 至少三类应用。
2. 保持 CoreApp 当前 legacy/raw/storage/sdk bypass 零新增；不要再为 2.4.10 引入新的兼容层。
3. 将本报告中的 P0 假值项纳入 `2.4.11` blocker，不在 2.4.10 中扩大范围。

### 2.4.11 必做

1. AI 系统状态接口替换固定假值；支付 mock 增加显式环境门控。
2. touch-image 插件历史路径从 localStorage 迁到插件 storage SDK。
3. 拆分 raw 指标口径并迁移 retained raw event definitions。
4. 关闭或降权 `compatibility-debt-registry.csv` 中 `2.4.11` 退场项。
5. 对超长文件按职责做小步拆分，不做大爆炸式重构。

## 6. 本次未执行

- 未修改业务代码。
- 未执行 git commit / push。
- 未运行完整 typecheck/test/build；本次工作重点是静态审计与文档同步。
