# 扩展经典效率与 AI 插件套件

## Goal

在不重复已有内置插件、也不扩大插件信任边界的前提下，补齐 uTools / Raycast 类高频入口：Hosts 配置、开发工作区、Orca 状态与 AI 会话检索；系统功能继续复用现有 `touch-quick-actions`、`touch-system-actions` 与 `touch-quickops`，不新增同义插件。

## Background

- 现有 `touch-system-actions` 已覆盖关机、重启、锁屏、音量、亮度和主窗口；`touch-quick-actions` 覆盖常用设置；`touch-quickops` 覆盖本地系统、网络、文件和会话摘要。新增系统插件会造成入口、权限和行为重复。
- 仓库没有 Hosts 文件编辑、VS Code 最近工作区、Orca 运行时或插件可用的 AI session history facade。
- `LocalAiCli`、Conversation API、Intelligence 低层 `agentSession*` / workflow control-plane 均明确 host-only；不能用 raw channel、shell 或伪造的插件身份绕过。
- 高隐私源（VS Code 最近工作区、AI 会话元数据）默认 disabled/ask；权限、路径、生命周期和 degraded reason 必须由宿主控制。

## Requirements

- **R1 Hosts 快捷配置**：新增 `touch-hosts`，提供 Hosts 文件只读预览、按受限 hostname/IP 规则添加/更新/删除、显式确认、原子替换与可恢复备份。Prelude 只消费 typed host facade；不得接收任意路径、命令、环境变量或原始文件内容之外的秘密。
- **R2 系统功能辅助**：不新增同义 manifest；对现有三类系统/QuickOps 插件完成主路径审计与测试补齐，保持动作确认、平台 unsupported、权限 denied 和 capability unavailable 的稳定结果。
- **R3 VS Code 最近项目**：新增 `touch-vscode-projects`，从宿主 allowlist 的 VS Code `storage.json` 读取最近工作区/文件夹，返回上限明确的脱敏 DTO；打开动作只接受宿主签发的短期 opaque token，不把原始路径放进 plugin item、日志或持久化数据。提供 enable/disable/clear/rebuild/degraded 语义。
- **R4 Orca 编排入口**：新增 `touch-orca`，首版只做受治理的 Orca 状态/工作区/终端摘要和打开 Orca 入口；任何创建任务、终端、worktree、消息或自动化的 mutation 必须独立的显式确认和宿主 typed API，不能在首版通过任意 shell 参数执行。
- **R5 AI Sessions**：新增 `touch-ai-sessions`，只读列出/搜索允许的本地 AI session 元数据（平台、时间、项目短名、状态、计数），支持复制脱敏引用；默认不展示原始 transcript，不执行模型、不写会话、不读取 token/cookie/API key。索引不可用、权限拒绝和路径不支持必须显示 degraded reason。
- **R6 共享宿主边界**：新增能力必须有固定 capability id、严格 request/result normalizer、verified activation identity、权限绑定、超时/取消/资源清理和 opaque token owner check；禁止新增 raw `ipcMain` / `ipcRenderer` / `channel.raw`。
- **R7 插件交互一致性**：每个新 Prelude 采用现有 `TuffItemBuilder` + `feature.clearItems/pushItems` 模式；结果为空、权限缺失、平台不支持、宿主能力不可用和执行失败都返回稳定可见 item，不抛出未处理异常导致插件 CRASHED。
- **R8 版本与清单**：每个可加载插件有合法 `manifest.json`、当前支持的 `sdkapi`、准确 permission reason、显式 `searchProviders`；有 package 的目录遵守 `@talex-touch/<directory>-plugin` 命名。
- **R9 图片工具**：将无法激活的旧 `touch-image` Surface 干净切换为官方隔离 Prelude，支持用户显式提供的一张图片修改分辨率、无损 PNG 优化、WebP/JPEG 有损压缩及 PNG-backed ICO 输出。宿主只向 child 发 activation-local opaque token 和 basename；32 MiB、64 MP、8192 边长、单页/非 SVG/PDF 限制必须 fail-closed，原始/输出路径及图片字节不得进入 item、日志或普通 storage。

## Acceptance Criteria

- [x] `touch-hosts` 在本地隔离测试中完成：空/合法/非法条目解析，预览不写入，确认拒绝不写入，确认接受原子写入并生成可恢复备份，路径/hostname/IP/大小上限和 symlink/权限失败均 fail-closed。
- [x] `touch-vscode-projects` 在 fixture storage.json 上完成：按平台解析、去重/排序/上限、权限拒绝与 unsupported 降级、opaque token 只能由签发 activation 使用，打开不存在或被替换路径不伪成功。
- [x] `touch-orca` 完成只读状态主路径：能力不可用显示 degraded，正常状态只输出脱敏摘要；未经确认不创建 worktree/terminal/task/message，不把任意 CLI 参数传给宿主。
- [x] `touch-ai-sessions` 完成元数据列表/关键词过滤/脱敏引用复制；fixture 中的 secret-like 内容、原始路径和 transcript 正文不出现在 item、日志或普通 storage；权限/索引失败可见且可恢复。
- [x] 现有系统功能插件的 focused tests 覆盖匹配、平台过滤、确认/权限/取消/超时和 capability unavailable；没有新增同义系统插件或未经批准的跨插件重构。
- [x] 所有新旧相关插件通过插件自身测试（若存在）、构建、`pnpm plugins:validate`；宿主 capability focused tests、CoreApp 相关 typecheck 和 `git diff --check` 通过。
- [x] 独立插件宿主 smoke 证明：manifest 与 feature id 一致、权限拒绝不调用 handler、activation revoke 后 token/资源失效、插件 disable/destroy 清理监听器/临时文件；不得将 local-only/fixture 结果标记为 Production 证据。
- [x] `touch-image` 对 image/files 输入完成 token 化隔离，支持可选 `WIDTHxHEIGHT` 与 `q1..100`，并真实产出 PNG、WebP、JPEG、ICO；保存取消不写入，提交前撤权/取消清理临时文件，原子 rename 后的 `saved` 终态保持真实，伪造/过期/跨 activation token、symlink/替换文件、超限/动画/SVG/PDF 均 fail-closed。

验收证据均为本地/fixture：五项插件交付的构建产物与 bundled 投影一致；29 个 manifest/package 校验、相关 Prelude 与 CoreApp 聚焦测试、真实 Sharp/Worker 格式 smoke 及独立 Electron plugin-host isolation smoke 均通过。Windows Hosts 提权取消与 VS Code 外部打开前 TOCTOU 仍保留为 §9 的两项 medium 风险，不作为 Production 绝对安全承诺。

## Out of Scope

- 不重写插件运行时、搜索引擎、Conversation/Intelligence control plane 或 Orca 本身。
- 不允许插件执行任意 shell、任意网络请求、任意路径读写、任意 worktree/terminal/task mutation。
- 不把完整 Hosts 文件、VS Code 原始数据库、AI transcript、prompt/response、provider secret、token、cookie 写入日志、普通插件 storage、同步载荷或分析事件。
- 不新增第二套系统动作实现；已有系统动作的行为变化必须有独立产品需求和回归证据。

## Decisions

- 2026-09-01：系统功能复用现有插件；新增能力集中在宿主 typed facade，插件只接收受限 DTO。
- 2026-09-01：首轮 Orca 与 AI Sessions 以只读/脱敏为默认，mutation 与 transcript 访问不作为首版隐式能力。
