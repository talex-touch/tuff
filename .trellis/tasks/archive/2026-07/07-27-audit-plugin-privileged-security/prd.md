# 审计插件高权限能力与隐私安全

## Goal

对 CoreApp 与插件运行时做一次证据驱动的安全与隐私全量审计，优先验证插件 SQLite 能力开放后是否仍满足最小权限、按插件隔离、逐调用鉴权、可撤销和可审计，并发现其他涉及敏感权限、敏感数据与宿主信任边界的潜在问题。

## Source Request

- 重点关注向插件开放 SQLite 后的隐私、权限控制和数据隔离。
- 全量扫描 App 与插件的其他潜在问题，尤其是安全、敏感权限和敏感数据相关问题。
- 不把仅有 manifest 声明、UI 提示或 TypeScript 类型视为安全边界；必须验证运行时强制控制。

## Confirmed Facts

- 仓库已有插件 Package Policy、Security Scan、签名信任链、Nexus admission 和真实安装证据；本任务复核其残余风险，不重复报告已闭环项。
- Application configuration 已以主 SQLite 为运行期真源，但其既有任务明确排除了 plugin storage、secure storage、renderer override 和业务数据表。
- 插件 manifest 的权限结构已经纳入共享 package policy 校验；这只能证明声明格式和发布准入，不能单独证明运行时授权、对象级隔离或撤销生效。
- Clipboard、截图/OCR、文件索引、搜索 query、AI/翻译输入、API key/token 和本地数据库都可能承载敏感数据，必须按数据流而非单一模块审计。
- 本任务当前处于 planning；先产出审计证据、风险 backlog 和修复任务图，不直接实施广泛修复。

## Threat Model

审计至少覆盖以下主体与入口，最终以仓库可实现的信任边界为准：

- 已安装但不可信、被供应链替换或被攻陷的第三方插件。
- 被远程内容、XSS、恶意剪贴板/文件/HTML 输入控制的插件或宿主渲染页面。
- 借宿主 SDK、IPC、MessagePort、protocol 或 native helper 形成 confused deputy 的调用方。
- 尝试读取其他插件或宿主数据、持久化秘密、外传数据、执行任意 SQL/文件/命令或制造资源耗尽的插件。
- 可访问当前用户目录但不应读取应用秘密的同机低权限进程。

## Requirements

### R1. 权限与能力清单

- 盘点所有插件可触达的敏感能力：SQLite/storage、文件系统、剪贴板、截图/OCR、搜索/索引、网络、AI、shell/进程、系统设置、通知、窗口、协议、本地资源、原生模块和秘密存储。
- 对每项能力记录声明位置、授权时机、调用方身份来源、main-process enforcement、对象级 scope、撤销路径、生命周期清理、日志/审计和测试。
- 检查默认权限、通配权限、隐式授权、权限组合升级、缓存授权在撤销后的失效，以及 UI 声明与运行时行为漂移。

### R2. SQLite 与插件数据隔离

- 追踪插件 SQLite/数据库 API 从 SDK 到 transport/IPC handler、数据库路径、连接和文件生命周期的完整链路。
- 验证数据库名称和路径不能 traversal、绝对路径或符号链接越界，插件不能打开宿主或其他插件数据库。
- 验证 SQL/参数边界、事务和 statement 生命周期、危险 `PRAGMA`、`ATTACH`、extension load、导入导出、迁移和备份能力是否受控。
- 验证按插件配额、查询/事务超时、并发/连接上限、结果/行/字节上限、磁盘耗尽保护、卸载/禁用/撤权清理与崩溃恢复。
- 明确插件数据的所有权、保留、删除、备份和用户可见性；敏感字段不得因诊断、镜像或错误日志泄漏。

### R3. 隔离与调用者真实性

- 审计 Electron sandbox、contextIsolation、nodeIntegration、preload/contextBridge、WebContents/BrowserWindow、导航/新窗口和外部链接策略。
- 审计 typed transport、IPC、MessagePort、事件订阅与 protocol handler 是否绑定真实 sender、窗口、插件实例和 activation generation。
- 验证跨插件对象引用、事件、缓存、stream、URL scheme、本地资源 allowlist 和文件 path 不会泄露或越权。
- 检查 native helper、shell、child process 和 OS adapter 是否只接受规范化、有界、授权后的输入。

### R4. 敏感数据与隐私生命周期

- 对剪贴板、截图/OCR、文件索引、搜索、AI/翻译、token/API key、配置、日志、遥测和缓存建立采集到删除的数据流。
- 验证默认采集和联网是否符合用户预期；敏感内容不进入非必要日志、错误、遥测、搜索索引、跨插件缓存或远程请求。
- 验证存储加密/系统秘密存储、日志脱敏、保留期限、手动删除、插件卸载、权限撤销和备份恢复语义。
- 对 HTML、富文本、文件名/路径、OCR 文本和远程响应检查注入、XSS、协议跳转和内容混淆风险。

### R5. 安装、更新与发布残余风险

- 复核 `.tpex` 构建、policy、scan、签名、Nexus admission、下载、解压、安装、升级、降级、禁用、撤销和开发者模式。
- 只报告现有供应链任务未覆盖、代码已漂移或真实安装边界仍可绕过的问题。
- 检查宿主 OTA、remote content、CSP、安全头、依赖和原生二进制的信任根与 fail-closed 行为。

### R6. 证据与处置

- 每个发现必须给出严重度、可信影响、利用/误用前提、准确 `file:line`、现有缓解、最小复现或缺失测试；无可达性证据的条目不得标为 confirmed。
- 结果分为：已证实缺陷、需要动态验证的高风险、隐私/产品决策、既有已缓解项。
- P0/P1 或跨边界发现拆为独立修复子任务；中低风险进入可追踪 backlog，并标明 owner、依赖和验收方式。
- 不记录或上传真实 token、API key、剪贴板内容、用户路径内容、数据库内容或其他隐私数据。

## Acceptance Criteria

- [ ] 形成 App/插件敏感能力矩阵，覆盖声明、授权、运行时 enforcement、对象 scope、撤销、清理、审计与测试。
- [ ] SQLite 链路完成静态审计，并对路径隔离、跨插件访问、危险 SQL 能力、资源上限和卸载/撤权语义给出可执行验证方案。
- [ ] Electron/transport/protocol/native 边界完成 caller identity 与 confused-deputy 审计。
- [ ] 关键敏感数据形成采集、存储、使用、联网、日志、保留和删除的数据流图或等价表格。
- [ ] 供应链既有闭环得到复核，重复发现被标为已缓解而非重新立项。
- [ ] 所有高危发现有 `file:line` 证据、最小复现/测试、影响说明和建议修复边界；假设与确认缺陷严格分离。
- [x] 每个 P0/P1 发现均转化为可独立验证的公开 Issue；审计 parent 保留最终集成验收。
- [ ] 审计过程与产物不泄露真实秘密或用户内容。

## GitHub Issue Tracking

- Parent: [#302 Track plugin privileged capability and privacy hardening](https://github.com/talex-touch/tuff/issues/302)
- P0: [#299 Harden plugin SQLite isolation and fail-closed authorization](https://github.com/talex-touch/tuff/issues/299)
- P1: [#296 Make plugin permission revocation invalidate session grants](https://github.com/talex-touch/tuff/issues/296)
- P1: [#297 Complete out-of-process isolation for plugin Prelude](https://github.com/talex-touch/tuff/issues/297)
- P1: [#298 Enforce secure defaults for plugin views](https://github.com/talex-touch/tuff/issues/298)
- P2: [#300 Correct transport caller verification semantics](https://github.com/talex-touch/tuff/issues/300)
- P2: [#301 Define retention and deletion controls for sensitive local and plugin data](https://github.com/talex-touch/tuff/issues/301)

公开 Issue 仅记录影响、稳定代码证据和验收标准；SQLite 动态复现的可武器化 SQL、真实路径和用户数据未公开。

## Out of Scope

- 在规划/审计阶段直接实施跨模块安全重构。
- 未经明确确认访问生产系统、真实用户数据、真实秘密或执行破坏性 exploit。
- 将第三方依赖的所有上游 CVE 无差别复制为本项目漏洞；必须证明版本、可达性和影响。
- 以“完全阻止本机管理员或已攻陷宿主进程”为安全目标。

## Open Decisions

- 插件生态的目标信任模型尚需由代码证据和产品选择收敛：第三方插件是否必须被视为对宿主数据完全不可信，还是安装后拥有部分受声明约束的高信任能力。
- SQLite 数据在插件卸载后的默认保留/删除策略，以及用户是否需要可见的导出、清理和占用管理入口，待审计现状后确认。
