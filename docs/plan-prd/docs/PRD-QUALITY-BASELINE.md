# PRD 质量基线

> 更新时间：2026-05-16
> 定位：活跃 PRD 的最小质量约束。压缩前完整规则快照见 `./archive/PRD-QUALITY-BASELINE-pre-compression-2026-05-14.md`。

## 1. 适用范围

适用于：

- `docs/plan-prd/02-architecture`
- `docs/plan-prd/03-features`
- `docs/plan-prd/04-implementation`
- `docs/plan-prd/06-ecosystem`

活跃 PRD 指仍影响当前或未来 2 个版本行为、接口、架构、发布或质量门禁的文档。历史 PRD 必须标注 `Archived/Historical` 与替代入口。

## 2. 当前强口径

- 当前基线：`2.4.10-beta.25`。
- `2.4.10` release blocker 只聚焦 Windows 真机 evidence、性能 evidence、final acceptance gate 与 Nexus Release Evidence。
- `2.4.11` 必须关闭或显式降权剩余 legacy/compat/size 债务；Windows/macOS 为 release-blocking，Linux 为 documented best-effort。
- `2.5.0` AI Stable 只承诺文本 + OCR；Workflow/Skills/Automation 为 Beta；Assistant、多模态生成编辑、Nexus Scene runtime orchestration 为 Experimental 或后续。
- Provider / Scene 必须解耦：新增供应商进入 Provider registry，新增使用场景进入 Scene，不新增孤立 provider model。
- 质量入口：PR 使用 `pnpm quality:pr`，其中 lint 阶段只检查 PR 修改的 JS/TS/Vue 文件；release/milestone 使用 `pnpm quality:release` 并保留全仓 lint；若既有失败阻断，必须记录失败项与最近路径替代验证。
- 当前质量状态：`apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts` 已恢复完整 `fileProvider` 导出，`pnpm -C "apps/core-app" run typecheck:node` 已通过；2026-05-16 live-tree 审计未发现新的 P0 fixed fake-success；`quality:release` 仍保留全仓 lint，若既有失败阻断，必须记录失败项与最近路径替代验证；旧 compat registry / legacy allowlist / size allowlist 已不在 live tree，不能再作为当前门禁或事实来源引用。

## 3. 活跃 PRD 必须包含

1. **Final Goal / North Star**：至少 1 个业务目标 + 1 个工程目标，且可验证。
2. **Scope / Non-goals**：明确做什么、不做什么，避免范围膨胀。
3. **Quality Constraints**：类型安全、错误处理、性能预算、安全/数据约束、回归验证。
4. **Acceptance Criteria**：功能验收 + 质量验收 + 文档验收。
5. **Rollback / Compatibility**：失败回滚、旧接口/旧数据/旧行为影响与退场策略。

## 4. 必守质量规则

### 4.1 类型与跨层调用

- 不新增未类型化跨层通信。
- 优先 domain SDK / typed transport，禁止新增 raw event 字符串分发。
- 禁止新增 legacy transport/permission/channel import、旧 storage protocol、旧 SDK bypass 或伪成功兼容分支。
- 新增可表达为 `namespace/module/action` 的事件必须使用 typed builder。
- retained raw event 必须区分：生产 raw send violation 与 retained definition；迁移需走 canonical event + legacy alias registry + dual listen + hit evidence + hard-cut 条件。

### 4.2 Runtime / 网络 / i18n

- CoreApp `main/preload/renderer` 禁止新增裸 `console.*`、宽松 WebPreferences、裸 `ipcRenderer/ipcMain`、`window.touchChannel`。
- i18n 必须走 `useI18n` / `useLanguage` / `useI18nText`，禁止新增 `window.$t/window.$i18n`。
- 业务层禁止新增 direct `fetch/axios`，统一走 `@talex-touch/utils/network` 或注入网络客户端。
- 旧 `/api/sync/*` 只允许迁移期只读，新增同步能力必须走 `/api/v1/sync/*` 及 keys/devices 配套接口。

### 4.3 Storage / Sync / Secret

- SQLite 是本地 SoT；JSON 只允许作为同步载荷格式，且必须是密文或引用。
- 禁止敏感信息明文进入 localStorage、普通 JSON、日志或同步 payload。
- `deviceId` 只能做设备标识或 AAD，不得作为密钥材料。
- Provider metadata 可普通存储；API key、secret、token、refresh token 必须进入 secure store、plugin secret capability 或 `authRef`。POSIX `0600` JSON 只能作为 CLI 过渡缓解，系统 credential backend / degraded health 必须在 PRD 中显式说明。
- Sync 输出只允许 `payload_enc` / `payload_ref` 等密文引用；旧 `b64:` 只保留只读迁移语义。

### 4.4 平台与真实能力

- 生产路径不得返回固定假值成功、mock 支付 URL、伪成功空结果或可消费业务 payload。
- 不可用能力必须返回明确 status、`unavailable + reason`、`unsupported/degraded reason` 或 migration target。
- Windows/macOS release-blocking 能力必须有真实设备证据；Linux 差异可 best-effort，但必须有用户可见 reason 与 smoke 记录。
- 动态执行能力必须有明确输入约束、sandbox/facade、审计或替换计划；PreviewSDK ability 必须声明 parser/sandbox/network/cache 依赖、输入长度、语法约束、是否网络/缓存/动态执行与替换计划。BasicExpression 已替换为小型 parser，单位公式已统一为静态转换核心；`new Function` 仅允许出现在 widget runtime sandbox 等已声明运行时边界中。

### 4.5 Windows 2.4.10 release evidence

正式 `2.4.10` 不得只凭 unit test、macOS 代跑或口头确认放行。必须具备：

- Windows acceptance collection plan。
- Windows required cases 与 capability evidence。
- Everything target probe。
- App Index diagnostic evidence。
- common app launch manual evidence。
- copied app path / local launch area evidence。
- update install evidence。
- DivisionBox detached widget evidence。
- time-aware recommendation evidence。
- search trace `200` 样本与 `search-trace-stats/v1`。
- clipboard stress `120000ms` 与 `clipboard-stress-summary/v1`。
- `windows:acceptance:verify` final gate passed。
- Nexus Release Evidence 写入。

模板占位、`N/A`、`TODO`、`TBD`、`-`、`待补`、`无` 不得作为有效 evidence。

### 4.6 启动与性能

- CoreApp 启动 critical path 不得新增非首屏必要的串行 await。
- renderer mount 前不得新增 plugin list、远程探测、extension load、telemetry hydrate、agent/workflow runtime、update cache hydrate、OCR/native watcher 等可后台化任务。
- 启动治理需采集：Electron ready → first window show、renderer script start → app mount、app mount → plugin list ready、all modules loaded → providers ready。
- SQLite 高频写必须具备单写者/物理分库/QoS/drop/backoff/latest-wins 等策略，禁止无上限重试灌队列。

### 4.7 SRP / Size

- 不再维护 size allowlist 作为唯一门禁；超长文件治理回到 code review、targeted refactor 与最近路径测试。
- 不再维护旧 `compatibility-debt-registry.csv`、`legacy-boundary-allowlist.json` 或 `large-file-boundary-allowlist.json` 作为 live SoT；若要恢复自动债务门禁，必须重新立项并同步脚本、清册和入口文档。
- 新增大文件或显著增长必须说明职责边界、拆分计划与验证命令。
- 已完成拆分的模块不得回潮：Clipboard、AppProvider、SearchCore、UpdateSystem、OmniPanel、Provider Registry、Tuffex FlipOverlay 等继续按最近路径测试防回归。

## 5. PRD 验收模板

```md
## 验收清单

- [ ] 功能验收：核心场景通过，失败路径可见
- [ ] 质量验收：typecheck/lint/test/build 通过，或记录既有失败项
- [ ] 性能验收：关键指标在预算范围内
- [ ] 安全验收：敏感数据、权限、同步载荷符合规则
- [ ] 文档验收：README/TODO/CHANGES/INDEX/Roadmap/Quality Baseline 按影响同步
- [ ] 回滚验收：回滚开关、数据兼容或降级策略明确
```

## 6. 文档同步矩阵

| 变更类型 | 必须同步 |
| --- | --- |
| 行为/接口/架构变化 | `README` / `TODO` / `CHANGES` / `INDEX` 至少一处 |
| 目标或质量门禁变化 | 同步 Roadmap 与本文件 |
| 发布 gate 或 evidence 变化 | `TODO`、`CHANGES`、Roadmap、Quality Baseline |
| 历史事实归档 | `CHANGES` 或 archive，入口文档只保留索引 |

## 7. 关联入口

- PRD 主入口：`docs/plan-prd/README.md`
- 当前执行清单：`docs/plan-prd/TODO.md`
- 产品路线图：`docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`
- 变更日志：`docs/plan-prd/01-project/CHANGES.md`
- 全局索引：`docs/INDEX.md`
