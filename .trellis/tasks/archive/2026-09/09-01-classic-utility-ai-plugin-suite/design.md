# 技术设计：经典辅助与 AI 插件套件

## 1. 边界与组件

本任务保留现有系统动作实现，不新增同义 `system-actions` 插件。新增四个插件：

- `touch-hosts`：Hosts 受限读写。
- `touch-vscode-projects`：VS Code 最近工作区只读发现与 token 化打开。
- `touch-orca`：Orca 只读状态/摘要入口。
- `touch-ai-sessions`：本地 AI 会话元数据只读索引与脱敏引用。

特权操作全部由 CoreApp 主进程持有。Prelude 运行在隔离宿主中，只能看到对应的固定 capability facade；不新增裸 IPC、Node 内建模块、任意 shell 或远程页面。

## 2. 共享 capability 规则

每个领域使用独立的固定 capability id（不得用一个可调用任意 operation 的万能工具）：

| 领域        | capability                   | 允许插件                | 权限                                     |
| ----------- | ---------------------------- | ----------------------- | ---------------------------------------- |
| Hosts       | `system.hosts`               | `touch-hosts`           | `fs.read`、`fs.write`、`system.shell`    |
| VS Code     | `filesystem.vscode-projects` | `touch-vscode-projects` | `fs.read`、`fs.index`、`system.shell`    |
| Orca        | `orchestration.orca`         | `touch-orca`            | `system.applications`；mutation 另需确认 |
| AI Sessions | `intelligence.sessions`      | `touch-ai-sessions`     | `intelligence.basic`、`fs.read`          |

能力定义必须加入 `PLUGIN_HOST_CAPABILITIES`，并在 activation 时按插件名精确注入。每个请求在 handler 前完成：exact-record 归一化、大小/数量上限、verified activation 与 host generation 校验、权限检查、取消/超时处理。权限撤销和 disable/destroy 必须立即使活跃 token、监听器和临时资源失效。

共享 `quick-ops.invoke` 仍只接受固定 operation，但其中读取文件/目录的 operation 额外绑定 `fs.read`，保存预览额外绑定 `fs.write` 与 `clipboard.write`；普通状态和文本格式化不被整组文件权限误伤。该动态权限检查使用 manifest 声明、当前 grant 与 revoke listener，不把任意路径读取继续当作无权限公共能力。

插件可见 DTO 只包含稳定字段：标签、状态、计数、时间、短名、脱敏 reason、完整性标志和宿主签发的 opaque token。原始路径、命令、cwd、环境、完整文件文本、prompt/response、token/cookie/API key 不跨边界、不进日志、不进普通 storage。

## 3. Hosts 数据流

```text
CoreBox query
  -> touch-hosts Prelude
  -> system.hosts.read (fixed platform path, read-only)
  -> normalized entries {hostname, addresses, comment?}
  -> item projection

explicit item action
  -> system.hosts.apply {operation, hostname, addresses, expectedRevision}
  -> permission + confirmation
  -> no-follow/read-before-write + atomic temp + fsync/rename
  -> privileged expected/replacement digest + commit outcome/cancel marker
  -> bounded backup + result {status, revision, backupCreated}
```

主进程按平台解析 `/etc/hosts` 或 Windows hosts 路径，不接受调用方路径。只允许规范化 hostname、IPv4/IPv6 地址和有限注释；禁止 localhost/broadcast/控制字符、重复条目和超大文件。写入前、提权 helper 内和提交结果后均比较 revision；helper 通过私有 outcome marker 区分 conflict/cancel/commit，避免 wrapper 提前退出后把成功或冲突伪装成普通失败。

## 4. VS Code 数据流

主进程只读取明确 allowlist 中的 VS Code `User/globalStorage/storage.json`，兼容 `openedPathsList` 以及当前版 `windowsState` / `backupWorkspaces` folder 记录，限制最近项目数量、字段长度和路径类型。返回 `{token, label, kind, lastOpenedAt}`；token 绑定 activation、真实文件身份和 TTL。打开时把 `realpath/dev/ino/kind` identity proof 交给固定 launcher，并在 spawn 前二次复核；绝不接受插件传入 executable/args/path。

来源默认关闭或询问；没有授权、平台不支持、文件不存在、格式变更和路径被替换分别返回可见 degraded reason。当前实现实时读取宿主 allowlist，不持久化第二份项目索引；权限撤销/disable 直接清空 token，即等价于清理该来源的瞬态索引状态，不删除用户项目。

## 5. Orca 数据流

主进程提供固定 `OrcaService` 适配器，所有 CLI 调用（如使用）只能是预编译的 `status --json`、`worktree ps --json`、`terminal list --json`、`orchestration task-list --json`，不可拼接用户字符串。结果经过 schema 校验和脱敏，只返回运行状态、数量、短标题和状态枚举。首版动作仅为打开 Orca 与刷新摘要；创建任务、终端、worktree、消息、自动化均返回 `unsupported`，不伪造成功。

## 6. AI Sessions 数据流

主进程只扫描 canonical home 下 allowlist 的 Claude/Codex session 根，并合并 CoreApp `aiOrchestratorStore` 的 Trellis/其他运行元数据。目录遍历、单来源候选和合并结果均有硬上限；任一层触顶时 `AiSessionsSnapshot.incomplete=true`，Prelude 显示 `scan-limited`，不会把部分结果伪装成完整 ready。只保留平台、日期、状态、项目短名、轮数、稳定哈希；关键词搜索在主进程内部做 bounded matching，不返回 transcript 片段。复制动作只生成 `AI session <short-id> · <platform> · <time>` 形式引用，并经过插件 clipboard gate。

不复用 host-only `ConversationEvents`、`agentSessionHistory`、`LocalAiCli` 或 raw Intelligence control-plane；不把 touch-intelligence 的原始历史复制到新插件 storage。

## 7. 兼容与回滚

- manifest 继续使用现有 `sdkapi`、`searchProviders`、permission reason 与 feature platform 形状。
- 新插件 capability 缺失时只显示 `capability-unavailable`，不影响其他插件加载。
- 宿主能力变更可以通过不注入对应 capability 立即回滚为 disabled/degraded；Hosts 写入失败保留原文件与已验证备份。
- 不改 SQLite schema；首次实现不把高隐私源写入搜索 SoT，避免迁移和隐私清理范围扩大。

## 8. Prelude facade 合同

为避免各插件自行拼 payload，四个新增 Prelude 只依赖以下 host 注入对象；对象不存在时按 `capability-unavailable` 降级：

```ts
interface HostsFacade {
  read(): Promise<HostsSnapshot>
  apply(request: HostsMutation): Promise<HostsMutationResult>
}

interface VscodeProjectsFacade {
  list(): Promise<VscodeProjectsSnapshot>
  open(token: string): Promise<{ status: 'started' | 'blocked' | 'failed'; reason?: string }>
}

interface OrcaFacade {
  snapshot(): Promise<OrcaSnapshot>
  open(): Promise<{ status: 'started' | 'blocked' | 'unsupported'; reason?: string }>
}

interface AiSessionsFacade {
  list(request?: { query?: string; limit?: number }): Promise<AiSessionsSnapshot>
}
```

所有返回值均为 JSON-safe plain DTO；`HostsSnapshot` 不包含文件绝对路径，`VscodeProjectsSnapshot` 的项目只包含 opaque `token`、短标签、类型、时间，`OrcaSnapshot` 只包含状态枚举/计数/脱敏标题，`AiSessionsSnapshot` 只包含短哈希、平台、项目短名、时间、状态、计数和 `incomplete`。具体字段上限由 host normalizer 执行，Prelude 不自行放宽。

动作 payload 只使用固定 action id 或 host 签发 token；禁止把用户查询文本、原始路径、命令行、环境变量、会话正文或凭据放进 action payload。四个插件的测试 harness 可用同名 plain global facade 模拟，但生产宿主必须由 verified capability 注入。

## 9. 已知跨平台残余风险

- Windows Hosts 提权仍通过外层 PowerShell 启动独立的 `Start-Process -Verb RunAs` 子进程；撤权只能终止外层句柄，不能证明已提权子进程在提交点前停止。通用 helper 只会在实际收到精确 `committed` marker 时保留成功终态，但外层被终止后无法保证收到内层结果，因此 Windows revoke 既不能描述为强制取消，也不能保证返回真实提交终态。
- VS Code token 在宿主内绑定 canonical path、dev/ino、类型、edition 与 TTL，并在启动前二次复验；不过，外部同用户进程仍可在最后一次 inode 检查与 VS Code 解析 pathname 之间执行 rename/symlink 替换。跨平台彻底关闭需要稳定 OS 文件引用或可信 launcher broker。
- 以上两项均由独立安全复审确认为 medium；本任务不隐藏、不降级为“已完全解决”。在引入受 Job Object/认证 nonce 管理的 Windows helper 或稳定文件引用 broker 前，不应把这两条性质写入 Production 安全承诺。

## 10. 图片工具数据流

旧 `touch-image` Vite Surface 无 manifest/Prelude，且直接依赖 Electron、持久化原始路径，不进入正式运行时。它被干净切换为官方隔离 Prelude；不会再建立第二套 WebContent 或任意文件 API。

```text
CoreBox image/files input
  -> TouchPlugin lifecycle ingress
  -> media.image-tools activation-local token vault
  -> child query { type: image, content: opaque token, metadata: { name } }
  -> touch-image fixed PNG/WebP/JPEG/ICO items
  -> plugin.imageTools.save({ token, format, width+height?, quality? })
  -> authority + fs.read/fs.write + source identity recheck
  -> terminate-on-abort worker + sharp bounded single-page raster render
  -> abortable native save dialog + O_EXCL temp + fsync + atomic rename
  -> { status, name, format, width, height, bytes }
```

输入上限为 32 MiB、64 MP、8192 单边；拒绝 SVG/PDF 与动画。两维同时指定时使用 `contain` 生成精确画布，不裁剪、不拉伸；JPEG 用白底，PNG 使用无损优化，WebP/JPEG 使用 `q1..100`。ICO 默认封装 16/32/48/64/128/256 六个 PNG-backed 图层；明确 1–256 的方形尺寸时只生成该尺寸，其他尺寸保持标准多尺寸输出。保存结果不含输出路径，child 也不接收原始路径、data URL、缩略图或图片字节。token 绑定 activation/TTL；权限撤销、disable/destroy 与下一次 lifecycle 输入都会清理旧 token。

剪贴板原图在进入搜索/插件分发前使用 no-follow 文件句柄、`fstat`、32 MiB 上限、分块读取和读前/读后 identity 复核，禁止无界 `readFile → base64`。图片尺寸只能成对给出，Prelude、host normalizer 与 renderer 均在 Sharp 前执行 64 MP 上限。Sharp inspect/render 在独立 Worker 中执行；取消、撤权、输入替换或 disable 会终止 Worker，而不是等待最长 30 秒的原生任务。原生保存对话框也与 AbortSignal 竞争，晚到结果被忽略。data URL token 的五分钟 TTL 由 `unref` 定时器主动清除，不依赖下一次点击。
