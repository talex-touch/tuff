# Design — 本机代理 CLI 探测修复与去门槛

行号引用 `research/detection.md` 与 2026-10-03 工作区。`M/` = `apps/core-app/src/main/`，`R/` = `apps/core-app/src/renderer/src/`，`U/` = `packages/utils/`。

## 边界

- **契约源**：`spec/main-process/pi-provider-contracts.md` §11（查找顺序、覆盖权威、未探测不等于缺席、pie 回退、日志只写名字、spawn 时把可执行文件目录补进 PATH）。本任务让「本机代理」也归到这份契约下，不另立第二套。
- **产品定位**（父任务硬约束）：只读 CLI，只调用 CLI。不改写 CLI 的任何配置，也不替它们切换 provider。
- **不动**：C、D 两套只查 PATH 的查找（PRD Out of Scope）；聊天 provider 的参数矩阵和解析器。

## 1. 单一查找：`M/modules/ai/providers/cli/cli-executable.ts`

**顺序**

1. `TUFF_<CLI>_CLI_PATH`：权威，规则不变。
2. **设置覆盖（新增）**：`appSetting.localAiCli.providers[id].executableOverride`。
   - 可执行就用，形态按文件名判断，规则与环境变量覆盖一致。
   - 不可执行就在结果上标 `settingsOverrideRejected: true`，**继续往下搜**。
3. PATH。
4. 版本管理器根。
5. 固定 bin。
6. 第 3–5 步对主命令完整走一遍，主命令找不到才轮到 `fallbackCommands`（pie）。

**接口变化**

- `resolveCliExecutable(lookup, options?: { settingsOverride?: string })`。
- 缓存键从 `command` 改为 `command + '\0' + (settingsOverride ?? '')`。
- `getResolvedCliExecutable(command, settingsOverride?)` 的同步读取跟着改。
- `pi-cli-runtime.ts` 里四个 `getResolved*Executable()` 先同步读一次当前设置覆盖（`getMainConfig(StorageList.APP_SETTING)`），再查缓存。

**排序修正**

版本管理器根下的版本目录原先按字典序倒排，导致 `lts`、`latest` 这类别名排在最前，`24.9.0` 也排在 `24.18.0` 前面（调研 §1.5）。改为：
- 只认 `^v?\d+\.\d+\.\d+$` 形式的目录（nvm 有 `v` 前缀）；
- 按数值元组降序，最新的在前；
- 别名目录和 `24`、`24.18` 这类半截名跳过，它们都是完整版本目录的链接。

在本机的效果：pi 仍是 24.9.0，codex 仍是 24.18.0；之后的 `npx` 解析（第 6 节）落到 26.9.0。

**新增通用查找**

`findCommandInSearchRoots(command)`：只走 PATH、版本管理器根、固定 bin，不认任何覆盖，也不做回退；单独缓存。给第 6 节的 MCP 用。

**共享四个 lookup**

PI / OMP / CODEX / CLAUDE 四个 lookup 常量从 `pi-cli-runtime.ts` 导出。本机代理按 provider id 映射使用：`pi`→PI，`oh-my-pi`→OMP，`codex`→CODEX，`claude`→CLAUDE。

## 2. 本机代理状态：`M/modules/local-ai-cli/executable-resolver.ts`（重写）

**删除**以下旧实现：`pathEntries`、`resolveFromKnownPaths`、`resolveFromLoginShell`，以及做 realpath 的 `validateExecutable`。

**状态解析** `resolveLocalAiCliProviderStatus(id, settings)`：

1. 用第 1 节的查找加设置覆盖，得到**未解析的原始路径**和形态。
2. 用 `probeCliVersion(id, path)` 探测版本，并按 `path` 缓存在内存里：
   - 执行 `execFileSafe(path, ['--version'], { timeout: 5000, env: withExecutableDirOnPath(process.env, path) })`，取 stdout 和 stderr；
   - 用身份正则匹配：

     | CLI | 正则 | 本机实测输出 |
     |---|---|---|
     | codex | `/codex-cli\s+(\d+\.\d+\.\d+)/i` | `codex-cli 0.158.0` |
     | claude | `/(\d+\.\d+\.\d+)\s+\(Claude Code\)/i` | `2.1.280 (Claude Code)` |
     | omp | `/\bomp(?:\/|\s+v)(\d+\.\d+\.\d+)/i` | `omp/18.4.4` |
     | pi | `/^\d+\.\d+\.\d+/m`（不变） | `0.84.3` |

   - pie 的输出是 `Touch Pie v0.1.46`，pi 的正则匹配不上，所以只有 pie 的机器会显示「不可用」。这是如实反映：pie 在 GUI 下本来就找不到 pi（PRD Out of Scope）。
3. 状态里新增 `settingsOverrideRejected?: boolean`，供渲染层显示「已选程序不可用，已改用自动找到的」。`executablePath` 改为原始路径。

**刷新** `refreshLocalAiCliExecutables()`：

- 清掉查找缓存和版本缓存；
- 等 `probeAllCliExecutables()` 跑完，让聊天 provider 也拿到新的查找结果。这个函数由 `intelligence-module.ts:876-898` 的 `probeLocalCliProviders` 抽出，或改为导出。

**触发刷新的时机**：

- 设置页「刷新」：`status.get` 的 payload 加 `{ refresh: true }`；
- `locateProvider` 写完覆盖之后；
- 设置覆盖被清空时：在 `APP_SETTING` 的订阅里比较新旧覆盖值。

CoreBox、OmniPanel、项目菜单读的都是缓存，不会每次都跑 `--version`。

## 3. 子进程 env：PATH 前补可执行文件所在目录

新增 helper `withExecutableDirOnPath(env, executable)`，放在 `cli/cli-executable.ts` 旁边：

```ts
{ ...env, PATH: [dirname(executable), env.PATH].filter(Boolean).join(delimiter) }
```

用到它的地方：

| 位置 | 改法 |
|---|---|
| `cli-process-runtime.ts:153-160` | 改用 helper，行为不变 |
| `local-ai-cli/index.ts:763` 任务 `spawnSafe` | `env: withExecutableDirOnPath(sanitizedChildEnv(), path)` |
| `local-ai-cli/index.ts:1306` 终端 `pty.spawn` | 同上 |
| `local-ai-cli/index.ts:591-651` claude SDK | `query({ options: { pathToClaudeCodeExecutable: path, env: withExecutableDirOnPath(sanitizedChildEnv(), path) } })` |
| 版本探测 | 见第 2 节 |

`path` 一律是查找给出的**原始路径**，不做 realpath。归档 08-04 设计里「realpath + 常规文件」的要求就此作废，Phase 3 写进 spec。

## 4. 去门槛与入口（L5、L6）

**main**

- `isLocalAiCliBetaAvailable()` 改名为 `isLocalAiCliPlatformSupported()`，只判断 `process.platform === 'darwin'`。所有使用点同步改。
- 状态字段 `betaAvailable` **保留原名**：它是共享类型，有十多个渲染层测试和 fixture 依赖它。语义改为「本平台提供这个（Beta）功能」，在 `U/transport/events/local-ai-cli.ts` 的注释里写明。
- ⌘⇧L 在 `onInit` 里按当前 `localAiCli.enabled` 决定注册与否，之后用 `subscribeMainConfig(StorageList.APP_SETTING, …)` 跟随：开了就 `registerMainShortcut`，关了就 `unregisterMainShortcut(LOCAL_AI_CLI_SHORTCUT_ID)`。`onDestroy` 时退订。
- 执行类 handler 不变：仍然要求总开关和 provider 开关都为真，见 `index.ts:469-473`。

**renderer**：入口条件改成 `status.betaAvailable && status.enabled`

| 文件 | 改法 |
|---|---|
| `R/modules/conversation/local-ai-agents.ts:76-77` | `localAiAgentChoices`：`!betaAvailable \|\| !enabled` 时返回 `[]` |
| `R/stores/projects.ts:109,131-137` 与 `R/components/shell/ShellProjectFolder.vue:111-121,286-289` | 项目菜单组 |
| `R/views/box/CoreBox.vue:216-222,1346-1351` | 按钮。现在只在挂载时读一次状态，改为**每次唤出时重读**（命中缓存，开销可忽略），关掉总开关后下次唤出即收回 |
| `R/views/omni-panel/OmniPanel.vue:202-217` | 动作，打开面板时已经会刷新 |
| `R/views/base/settings/SettingLocalAiCli.vue` | 只看 `betaAvailable`，不变；新增 `settingsOverrideRejected` 提示 |

## 5. MCP 发现（L7）：`M/modules/ai/ai-cli-import-service.ts`

**layouts**

- pi：`userMcpFiles: [{ path: join(home, '.pi', 'agent', 'mcp.json'), name: 'Pi MCP' }]`；
- oh-my-pi：`userMcpFiles: [{ path: join(home, '.omp', 'agent', 'mcp.json'), name: 'Oh My Pi MCP' }]`；
- 两个根目录维持写死，与这张表现有的写法一致，不在本任务里处理 `PI_CODING_AGENT_DIR`。

**命名**：从 config 类文件派生的 MCP 候选（`509-515`），名字从 `${basename} MCP` 改为 `${layout.label} MCP`，例如「Codex MCP」。

- 一次预览结果里，同一 provider 出现同名候选时，后者追加 ` · <文件名>` 以作区分；
- `kind === 'mcp'` 的文件维持原名规则。

**测试**：`ai-cli-import-service.test.ts` 补以下用例：pi / omp 的 `mcp.json` 能被发现，`serverNames` 和名字正确；codex 的 `config.toml` 显示为「Codex MCP」；同名时追加文件名。

## 6. stdio MCP 服务器的 PATH（L10）：`M/modules/ai/intelligence-mcp-registry.ts:321-331`

`openSession` 在创建 stdio 传输时：

1. `command` 不含路径分隔符，且配置的 env 里**没有**显式设置 PATH 时，先 `findCommandInSearchRoots(command)` 解析。
2. 解析到了：
   - 传给 `StdioClientTransport` 的 `command` 换成**绝对路径**。这样不依赖 libuv 拿子进程 env 里的 PATH 去找命令，在 macOS 的 posix_spawn 下也稳。
   - env 的 PATH 设为 `[dirname(resolved), ...存在的固定 bin, process.env.PATH]`，让 `npx` 的 shebang 能找到同目录的 node，也让服务器自己再起的子进程能找到常用工具。
   - 存储里的配置原样不动。
3. 解析不到：行为不变，照旧报原来的启动失败。
4. 配置里显式写了 PATH：尊重用户的写法，不改。

探测（MCP 页的「探测」按钮）走的是同一条 `openSession` 路径，自动受益。

## 取舍

- **不导入登录 shell 的整份环境**（VS Code 那种 `-ilc` 做法），理由：
  - 实测 `-ilc` 要 0.25–0.5s，stdout 前面有 16 行横幅，结果随 cwd 变；
  - codex 照样找不到；
  - 还会把 5 个名字像凭据的变量带进子进程（调研 §5.2）。

  版本管理器根加固定 bin，已经覆盖本机四个 CLI 和常见安装方式。
- **设置覆盖对聊天 provider 也生效**：同一个 CLI 只认一个「用户选定的程序」，避免两处表现不一致。
- **`betaAvailable` 不改名**：改名会牵连共享类型和十多处测试，收益只在命名上。

## 回滚

改动集中在：
- main：`cli-executable.ts`、`pi-cli-runtime.ts`、`cli-process-runtime.ts`、`local-ai-cli/{executable-resolver,provider-registry,index}.ts`、`intelligence-module.ts`、`ai-cli-import-service.ts`、`intelligence-mcp-registry.ts`；
- `U/transport/events/local-ai-cli.ts`；
- 四处渲染层入口和设置区。

回滚方法：逐个文件 `git show HEAD:<path> > <path>`。如果只想恢复门槛，把 `isLocalAiCliPlatformSupported` 改回带环境变量的判断即可，其余修复可以保留。
