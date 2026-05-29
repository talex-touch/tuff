# UI/兼容/占位与架构健壮性后续复核（2026-05-29）

> 范围：基于 `cross-platform-compat-placeholder-ui-architecture-audit-2026-05-29.md` 与同日 5 个治理切片后的当前 live tree，复核 `apps/core-app`、`apps/nexus`、`packages/*`、`plugins/*` 与 `docs/plan-prd`。
> 重点：UI 适配度、完整度、观感、兼容债务、占位/假实现、不优雅代码，以及下一步架构收口顺序。

## 总结

- **P0 结论**：当前未发现新的生产路径 fixed fake-success、mock 支付 URL、伪成功空结果或可消费占位 payload。已退役 AI compat 路径仍以 HTTP `410` + migration target 为合同口径。
- **已收口事项**：上午 5 个高信号切片已经落地：legacy alias telemetry、旧 snippets hidden/deprecated/replacedBy、Nexus evidence source 分层、dialog 文本/可信 HTML 分流、TuffEx visual smoke 脚本。
- **新增当前态**：工作树里已有 Windows App indexing / Everything CLI detection / CoreBox function key handling / manual file index rebuild notification 的未提交改动，方向上提升跨平台可用性与用户反馈闭环；仍需要最近路径测试与 Windows 真机 evidence。
- **UI 观感判断**：Tuff 的产品方向适合“专业工具 / Swiss minimalism / 高密度可扫描”。当前不是需要大改皮肤的问题，而是局部旧组件、证据来源、平台状态与官方插件质量不够统一。

## UI 适配度与完成度评分

| 模块 | 当前评分 | 判断 |
| --- | ---: | --- |
| CoreApp 桌面主产品 | 7.3 / 10 | CoreBox、设置、插件详情、通知反馈继续增强；函数键拦截与手动索引完成通知让交互更可控。扣分点是旧基础组件与部分 renderer `v-html` 合法场景仍需逐项标注来源。 |
| Nexus 文档与生态站 | 7.7 / 10 | TuffEx 组合 demo、dashboard chart wrapper、evidence source 分层改善明显。扣分点是真实 visual smoke 截图、生产/preview operator evidence、live storage/send 仍未闭环。 |
| TuffEx 组件体系 | 7.6 / 10 | dialog 默认文本化和 visual smoke 脚本让组件体系更符合安全默认值。扣分点是 visual smoke 尚未成为真实截图证据，组件文档和视觉验收仍需分开打标。 |
| 官方/示例插件 UI | 6.5 / 10 | 旧 snippets placeholder 已降为 hidden/deprecated，用户可见污染降低。`touch-music` 等示例插件仍有裸 console 与旧组件观感，适合继续降噪。 |

整体判断：UI “好看与否”的关键不在更炫，而在状态可信、密度克制、控件一致、失败路径可解释。当前视觉方向基本正确，下一阶段应补 evidence 与统一组件基线，不建议做大范围主题重绘。

## 当前高信号发现

### P1：Windows App indexing 改动方向正确，但需要真机 evidence

当前未提交改动已经做了几件有价值的事：

- 展开 Windows registry / StartApps 中的 `%ENV%` 路径，减少无法解析的安装路径。
- Start Menu shortcut / desktop app 构建前检查目标文件是否存在，避免把坏快捷方式作为可执行成功路径。
- 新增 `App Paths` registry 作为 Start Menu 之后的额外发现源。
- Everything CLI detection 读取 HKLM/HKCU registry `Path`，减少应用进程继承 PATH 不完整导致的 `es.exe` 探测失败。

风险与建议：

1. 这类改动必须用 Windows 真机验证，特别是 `%LOCALAPPDATA%`、`ProgramFiles(x86)`、用户级 App Paths、WOW6432Node、坏快捷方式和 Everything CLI 仅存在 registry Path 的场景。
2. registry App Paths 的 `Path` 字段当前只作为 description/alternateName，不能作为 launch working directory；这是保守且合理的 KISS 选择。
3. 后续不要继续扩展更多 registry 源，先用 diagnostic evidence 看命中率和误报率。

### P1：CoreBox function key hardening 方向正确，需补交互回归

当前改动在 renderer keyboard hook、BrowserWindow `before-input-event`、attached plugin UI view、key forwarding transport 四层拦截 `F1`-`F24`，可以避免 F11 fullscreen 和插件 UI function-key 泄漏。

风险与建议：

1. 需要补 focused test 或手工 smoke：CoreBox 主窗口、attached UI view、输入框可见/隐藏时，`Escape`、Arrow、Enter、Backspace、Ctrl/Cmd+R dev reload 仍按预期工作。
2. function key 是系统级/窗口级快捷键，不应下放给插件；该决策和 SDK 边界一致。

### P1：真实证据仍是 UI/完成度最大缺口

已完成脚本与文档口径，但以下仍不是生产完成证据：

- TuffEx visual smoke 还缺真实 Nexus/Chrome CDP 运行截图。
- Nexus Data Governance 缺生产/preview 认证 operator evidence、live send、live object storage、production D1 migration/backfill、真实 provider quota fail-closed。
- Windows App indexing / Everything detection 缺 Windows 真机结果与 performance/evidence manifest。

建议把“脚本已存在”和“截图/平台 evidence 已通过”拆成两个状态，避免文档看起来比产品实际更满。

### P2：剩余不优雅代码主要是旧边界，不是新 P0

- `apps/core-app/src/preload/index.ts` 仍有静态 overlay `innerHTML`；当前是受控静态 markup，不是用户输入路径，优先级低于平台 evidence。
- `apps/core-app/src/renderer/src/modules/plugin/widget-registry.ts` 仍有 `new Function`；仍按 Widget runtime sandbox 声明边界管理，不能扩散到 PreviewSDK 或业务 parser。
- `apps/core-app/src/renderer/src/components/render/BoxItem.vue`、`TextPreview.vue`、`CoreIntelligenceAnswer.vue`、`UpdatePromptDialog.vue`、Nexus notes、TuffEx markdown view 等仍有 `v-html`，但多为 markdown/highlight/rendered HTML 场景；后续应逐一标注 sanitized/trusted source，而不是简单全删。
- `plugins/touch-music/*` 仍有裸 `console.log`，影响官方插件观感，不阻塞当前 release，但适合小切片清理。

## 下一步建议

1. **先验证当前未提交 CoreApp Windows/CoreBox 切片**：跑最近路径 typecheck/test；然后补 Windows 真机 App indexing + Everything CLI registry Path evidence。
2. **补 TuffEx visual smoke 真实截图**：用 Nexus dev/preview + Chrome CDP 跑现有脚本，产出 375/768/1440、light/dark、reduced motion 截图与失败报告。
3. **观察 legacy alias hit=0 一个 release cycle**：telemetry 已有，下一步不是立刻删除所有 alias，而是先拿真实 hit 数据；Terminal / Sync 可作为第一批 hard-cut。
4. **清理官方示例插件噪音**：优先 `touch-music` 裸 console、旧 outdate 文件和明显调试输出，保持插件生态观感。
5. **继续 Nexus production evidence**：生产/preview operator evidence、live storage/send、D1 migration/backfill、真实 quota fail-closed 仍是完成度主线。

## 文档同步

本文是同日增量审计的 post-slice 复核，不替代 `TODO.md` 的当前执行清单。入口文档应同步强调：上午 5 个治理切片已落地，新的高优先级是“真实截图/平台 evidence + 当前 Windows/CoreBox 切片最近路径验证”，而不是再做一轮泛化 placeholder 扫描。
