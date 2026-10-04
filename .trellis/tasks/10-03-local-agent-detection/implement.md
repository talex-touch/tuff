# Implement — 本机代理 CLI 探测修复与去门槛

执行前先读 `design.md` 和 `spec/main-process/pi-provider-contracts.md` §11。每一步跑完对应的验证再继续。

## 步骤

1. [ ] **单一查找（`cli-executable.ts`）**
   - 加入设置覆盖这一层，带 `settingsOverrideRejected` 标记；缓存键并入覆盖值。
   - 版本目录改为按数值降序。
   - 新增 `findCommandInSearchRoots` 和 `withExecutableDirOnPath`。
   - `cli-process-runtime.ts` 改用 helper。
   - `pi-cli-runtime.ts` 导出四个 lookup，`getResolved*` 带上当前设置覆盖。
   - 验证：
     - `cli-executable.test.ts` 补用例：设置覆盖生效、失效时继续搜并带标记、数值排序（`24.9.0` 与 `24.18.0`、别名目录被跳过、`v` 前缀）、通用查找；
     - 原有用例全绿；
     - `pi-cli-provider.test.ts`、`pi-cli-reasoning.test.ts`、`pi-cli-provider.home-session.test.ts`、`intelligence-provider-model-options.test.ts` 通过。
2. [ ] **本机代理状态（`executable-resolver.ts` 重写，加 `provider-registry.ts` 的身份正则）**
   - 版本缓存与刷新；`status.get` 支持 `{ refresh: true }`；`locateProvider` 写完覆盖后刷新。
   - 抽出或导出 `probeAllCliExecutables`。
   - 验证：新增 `executable-resolver.test.ts`，覆盖以下几点：
     - shim 不再被解析成 mise 本体；
     - 拿 mise 的版本输出喂给身份正则，不会被判为 codex、claude、omp；
     - 设置覆盖失效时继续搜；
     - 缓存命中时不重复跑 `--version`；
     - 刷新后重新探测。

     测试里的 stub CLI 用合成名字，并把 HOME 重定向，沿用 `cli-executable.test.ts` 的做法。
3. [ ] **启动 env**
   - 任务 `spawnSafe`、终端 `pty.spawn`、claude SDK 都用原始路径，并补 PATH。
   - 验证：`local-ai-cli/index.test.ts` 补断言，spawn、pty、SDK 收到的 env.PATH 都以可执行文件所在目录开头。
4. [ ] **去门槛与入口**
   - main：门槛函数改为只看平台；⌘⇧L 跟随总开关注册或注销。
   - renderer：四处入口加 `enabled` 条件；CoreBox 每次唤出时重读状态；设置区显示 `settingsOverrideRejected` 提示，需要新增 i18n 键（zh / en，用锚点插入）。
   - 验证：
     - `index.test.ts`、`index.navigation.test.ts` 的 setup 去掉环境变量，补一个非 darwin 用例和一个快捷键随开关增删的用例；
     - 渲染层这些测试按新条件调整：`local-ai-agents.test.ts`、`ShellProjectFolder.test.ts`、`ShellConversationList.test.ts`、三个 `CoreBox.*.test.ts`、`LocalAiCliPanel.session.test.ts`。
5. [ ] **MCP 发现**
   - pi、omp 的 `userMcpFiles`；config 派生候选的命名改用代理名。
   - 验证：`ai-cli-import-service.test.ts` 新增用例通过，原有用例全绿。
6. [ ] **stdio MCP 的 PATH**
   - `intelligence-mcp-registry.ts` 在启动 stdio 前先解析命令，并补 PATH。
   - 验证：registry 现有测试加新用例：`npx` 被换成绝对路径，env.PATH 以它的目录开头；配置显式写了 PATH 时不改；解析不到时不变。
7. [ ] **整体校验**
   - 在 `apps/core-app` 下直接调 vue-tsc / tsc 入口跑 typecheck（node 和 web 都要），不走 `pnpm <script>` 包装；
   - 改动文件按 core-app 的 eslint 配置检查，lint delta 为 0；
   - `git diff --check`。
8. [ ] **launchd 等价环境验收**（这一步是本任务的关键证据）
   - `pnpm core:dev` 从终端启动，会继承完整 PATH，复现不了问题。只能用下面两种办法之一：
     - 构建一个 snapshot 包，产物放在 `/tmp`（磁盘紧张，产物超过 100 MB），从 Finder 启动；
     - 用 `env -i HOME=$HOME USER=$USER PATH=/usr/bin:/bin:/usr/sbin:/sbin SHELL=/bin/zsh` 去启动构建后的 Electron 主程序。注意 `tuff-dev-cdp-verification-gotchas` 记忆里提到「直起会 Napi 崩」，先试，崩了就改走打包。
   - 截图并实际操作：
     - 设置区显示四个 CLI 的真实版本和真实路径，没有 mise；
     - 用 pi、codex 各跑一条只读任务；
     - 总开关关闭、打开、再关闭时，⌘⇧L 和各入口的出现与收回；
     - MCP 页的发现行名字；
     - 启用一个用 `npx` 启动的服务器后，「探测」成功。

## 回滚点

- 第 1–2 步可以单独回滚：只涉及 main 的查找和状态，渲染层不受影响。
- 第 4 步可以单独回滚，恢复门槛判断。
- 第 6 步可以单独回滚。

## 开工前检查

- 确认 `09-06-local-cli-model-providers` 没有人在同时改 `cli-executable.ts`、`pi-cli-runtime.ts`、`intelligence-config.ts`。如果有，先协调。
- `implement.jsonl` 和 `check.jsonl` 已登记 spec 与 `research/detection.md`。
