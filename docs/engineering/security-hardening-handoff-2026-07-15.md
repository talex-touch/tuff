# 安全加固交接 Backlog — 2026-07-15

> 一轮全项目安全审计 + 修复的交接文档。目的：让下一轮（尤其能真机操作 app 的环境）无缝接手剩余项。
> 提交、push、worktree 与并行修改描述均为 2026-07-15 生成时快照；执行前必须读取当前仓库状态。技术结论与剩余 backlog 仍需按当前代码逐项复核。

## 1. 本轮范围

对整个 monorepo（core-app Electron 主进程 / nexus Cloudflare 服务端 / plugins / packages）做了四维并行安全审计（密钥、主进程/IPC/插件、数据库、nexus Web）+ 渲染层 XSS / CI 供应链补充，然后按性价比依次修复。审计发现见任务系统与各 commit message。

## 2. 已完成并提交（每项都 lint + typecheck + 单测/专项测试 或 app 启动验证）

| Commit | 类别 | 内容 |
|---|---|---|
| `2a69fa3b1` | HIGH×多 | XOR→AES-GCM 密钥加密、nexus 原子性×4(consumeCredits 双花/激活码/邀请 CAS/mergeUsers db.batch)、core-app DB(FK pragma + 5 索引)、storage 路径穿越、markdown XSS sanitizer、设备 IDOR、R2 key 穿越、密码重置 per-user 冷却 |
| `928e878bf` | HIGH | M6 弱随机→crypto.randomBytes；H4 更新验签 fail-closed + 内嵌公钥 + opt-in `TUFF_UPDATE_REQUIRE_SIGNATURE` |
| `83d292fc3` | HIGH | #6 sender 身份校验：插件视图 webContents 注册表，`__parse_raw_data` 用真实 sender 覆盖自称身份，插件不能再冒充第一方 MAIN |
| `3bd386741` | CRITICAL(缓解) | C1-A：require 收紧（初版，**后被 `b422f81fe` 修正**） |
| `b422f81fe` | 修正 | **C1-A 回归修复**：官方插件实际用 child_process/fs/os/process，初版会破坏它们；缩到只拒绝官方插件不用的 net/http/vm 等 |
| `666f82a4f` | 设计 | C1-B/H2 插件运行时隔离设计（`docs/plan-prd/03-features/plugin-runtime-isolation-prd.md`） |
| `da5a3fe14` | CRITICAL(根治·阶段1) | C1-B 阶段1：utilityProcess 宿主 + MessageChannel 骨架 + 有界重启，真机验证连通 |
| `11d31ca11` | CRITICAL(根治·阶段2) | C1-B 阶段2 实验核心：Prelude 迁入子进程 + 生命周期桥 + invoke 式 SDK 递归 Proxy RPC，合成闭环自检 OK |
| `468e9b9b1` | HIGH(部分) | H2：不安全 compat 视图透明化警告 + opt-in `TUFF_PLUGIN_SECURE_VIEWS` 强制安全 |
| `b862fb70f` | MEDIUM | #11 user_api_keys 弱 32-bit hash→SHA-256 + 拒绝碰撞歧义(不再 results[0])，旧 hash 向后兼容 |
| `9a53b0426` | — | i18n：语言名加「」 |
| `ea11105bd` | — | tuffex tabs 布局(用户确认代提交,非本轮审计范围) |

## 3. 运维前提（改动生效/不破坏的必要条件）

- **生产必配 `NUXT_INTELLIGENCE_ENCRYPT_KEY`** — `intelligenceStore` 现在 AES-256-GCM fail-closed，未配则保存新 provider key 会报错（这是有意的安全行为）。
- **`foreign_keys=ON` 是运行时行为改变** — 已 `core:dev` 冒烟验证一次无既有代码依赖 FK-off；打包发布前建议再冒烟。
- **`wrangler.toml` preview 的 `change-me*` 密钥** — 应移到 `wrangler secret put --env preview`（运维操作，非代码；未处理）。
- **Feature flags（都默认关，零默认影响）**：`TUFF_UPDATE_REQUIRE_SIGNATURE=1`(强制更新必须签名)、`TUFF_PLUGIN_ISOLATION=1`(C1-B 子进程隔离实验核心)、`TUFF_PLUGIN_SECURE_VIEWS=1`(H2 强制安全视图)。

## 4. 剩余 Backlog（#9 / #10 已关闭；其余仍撞真机墙或需决策，任务系统 #12/#15/#16/#17）

> **每项的详细实施 handoff**（现状 file:line / 步骤 / 验证 / 陷阱）见
> [`security-hardening-remaining-backlog-2026-07-15.md`](./security-hardening-remaining-backlog-2026-07-15.md)。
> 下面是概览。

### C1-B 插件隔离（根治 C1，设计+阶段1+阶段2 已落地）
- **事件式回调 RPC（#15 剩余）**：`channelBridge.onMain(evt, cb)` 是反向 callback（main→plugin），实验核心只做了 invoke 式（plugin→main）。需 callbackId 双向 RPC。
- **AbortSignal 跨进程代理**：`onFeatureTriggered(signal)` 的取消透传，实验核心未做。
- **逐官方插件真机回归（#17）**：唯一能证明"真跑通"的验证。必须实际点开每个 `plugins/*` 测 trigger/onItemAction/storageChange，比对隔离前后行为。**此环境做不到，是默认开启前的硬门槛。**
- **进程模型 / 灰度**：先单一宿主进程；`TUFF_PLUGIN_ISOLATION` 默认关→官方验证→默认开。
- 注意：**并行进程已在改进 `plugin-host-bridge.ts`**（加了 generation 守卫 + 重启稳定窗口），接手前先合并它的改动。

### H2 视图安全（#16 默认化部分）
- 默认化 trusted + compat 用户同意 UI，需 renderer + 安装流程 + legacy 插件真机回归。强制默认会破坏依赖 nodeIntegration 的 legacy 插件（同 C1-A 教训）。

### 数据层（#9 / #10 均已关闭）
- **#9 batch-ingest ✅ 2026-07-16 已修**：`pushSyncItemsV1` 使用有界批量预读与单次原子 D1 `batch()`，统一提交 oplog/item/quota/session。13 项回归、Miniflare 与隔离 Preview D1 覆盖 1001 项、冲突排序和失败回滚；远程临时表已清理。
- **#10 usage 单写者 ✅ 2026-07-16 已修**：移除 periodic log replay；`0027` 迁移保守删除有 provider sibling 的 source-type phantom rows，并只下调可证明的 execute 过计。3 files / 4 tests、typecheck、migration readiness 与临时 DB smoke 通过。

## 5. 关键教训（下一轮避坑）

1. **表面测试会骗人**。C1-A 初版基于"官方插件不用裸 Node"的调查下手，而调查漏了 `node:` 前缀——官方插件大量 `require('node:child_process'/'fs'/'os')`。dev 环境没装这些插件，app 启动"零 DeniedError"给了**虚假安全感**，直到读插件源码才暴露。**改插件运行时/加载策略，必须逐插件真机回归，不能信启动日志。**
2. **require 黑名单堵不住 RCE 又不破坏生态**——官方插件本身就用 child_process/fs。child_process 的 RCE 只能靠 C1-B 进程隔离根治，这是 C1-A 只能是"缓解"的根本原因。
3. **收紧 legacy 兼容层(compat 视图 / require)几乎必然破坏某些插件**。任何"默认收紧"都要么做成 opt-in flag(本轮 H2/H4/C1-B 的做法)，要么有真机全插件回归兜底。

## 6. 快照边界

- 本文中的 commit 数量、push 状态和工作区归属只解释 2026-07-15 当时的交接背景，不再作为实时操作指令。
- 当前状态必须从版本控制、Trellis 与对应代码重新读取；不得依据本文执行 rebase、force-push 或覆盖并行改动。
- 2026-07-16 #9 / #10 均已关闭；当前全局首要项转为 Trellis 任务与文档收敛，顺序见 [`../plan-prd/TODO.md`](../plan-prd/TODO.md)。
