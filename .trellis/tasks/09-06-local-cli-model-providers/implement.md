# Implement — 本地 AI CLI 作为可选聊天 provider

Parent: `.trellis/tasks/09-06-model-menu-redesign`
前置：`09-06-home-model-menu-v2` 已合入（含菜单打开时 `load(true)` 刷新）。

## Step 0 — 前置核查

- [ ] `task.py current` 指向本任务；`git status` 记录其他会话在途文件（box-tool / recommendation / lang 等不碰）。
- [ ] 记录基线：`pnpm -C apps/core-app exec vitest run src/main/modules/ai` 全绿数量。
- [ ] 在 `/tmp` 复跑 prd Background 表的四条命令各一次，把输出（去密钥）存入 `research/cli-protocol-samples.md`，
      作为解析器 fixture 的来源。

## Step 1 — 抽共享运行时（纯重构，pi 行为不变）

- [ ] `providers/cli/cli-process-runtime.ts`：从 `pi-cli-provider.ts` 抽出 spawn / readline / abort / 有界终止 /
      stderr tail / 附件生命周期，签名按 design §4.2。
- [ ] `providers/cli/cli-executable.ts`：从 `pi-cli-runtime.ts` 的 discovery 段抽出通用解析（command、envOverride、
      fallbackCommands），保留 `resolvePiExecutable / getResolvedPiExecutable / resetPiExecutableCache` 作为薄包装；
      **pie 回落**在这里：pi 候选全缺席后找 `pie`，`ResolvedCli.form = 'fallback'`。
- [ ] `pi-cli-provider.ts` 改为消费运行时；`pi-cli-provider.test.ts`、`pi-cli-runtime.test.ts` 不改即绿。
- [ ] 新测试：`cli-executable.test.ts`（pie 回落、envOverride、缺席 → null）。

验证：`pnpm -C apps/core-app exec vitest run src/main/modules/ai/providers`；`typecheck:node`。
**Gate 1**：pi 测试零改动全绿；`git diff --stat` 显示 pi-cli-provider.ts 净减少。

## Step 2 — 注册表 + 类型 + 模型选项（先做 omp 一个，打通全链路）

- [ ] `providers/cli/cli-provider-registry.ts`：定义 pi 与 omp 两项（design §4.1），`probeAll()` / `getResolved()`。
- [ ] `intelligence-config.ts`：注入按 registry 泛化；`withLocalCliChatBindings`。`intelligence-config.test.ts`
      增：两个 CLI 都在 → 两个 provider + 两条绑定；只有 omp → 只有 omp。
- [ ] `intelligence-module.ts`：`probePiCliProvider` → `probeLocalCliProviders`（并行、每个一行 info/success，失败 warn）。
- [ ] `provider-factory.ts`：按 origin 分派。
- [ ] `omp-model-catalog.ts`：`omp models --json --no-extensions`（`execFileSafe`，10 s）→ selectors；回落 yml
      （core-app `package.json` 加 `yaml`，pnpm install 由用户执行 —— 提交前说明）；密钥断言测试同 pi。
- [ ] `omp-cli-provider.ts`：argv 按 design §4.3，解析器复用 `parsePiCliLine`。
- [ ] 双镜像类型加 `origin?`；`intelligence-provider-model-options.ts` 按 origin 取目录并回填 `origin`；
      测试增 omp 四用例（有目录 / 探测缺席 / 未探测 / 目录为空）。
- [ ] renderer：`ModelChoice.origin`、`providerIconFor(type, origin)`、safelist 派生；`HomeModelMenu.test.ts`
      增「同为 local type 的两个 origin 图标不同」。

验证：主进程 ai 测试 + renderer conversation / home 测试；`typecheck:node` + `vue-tsc` web。
**Gate 2**：真机菜单出现 OMP 分栏，选 `codex/gpt-5.6-terra` 发 pong 流式返回（AC2）。

## Step 2b — 模型家族图标（renderer，可与 Step 2 并行）

- [ ] `modules/intelligence/model-family-icons.ts` + 测试（design §4.6，R9 的家族表）。
- [ ] `HomeModelMenu.vue` 行图标改为家族优先、provider 回落；分栏按钮不变。
- [ ] `uno.config.ts` safelist 并入 `MODEL_FAMILY_ICON_CLASSES`。
- [ ] `HomeModelMenu.test.ts` 增 AC8b 的四个断言。

验证：renderer home / intelligence 测试；`vue-tsc` web。
**Gate 2b**：真机 `qwen2.5:3b` 行是 Qwen 图标（AC8b）。

## Step 3 — claude

- [ ] `claude-stream-json.ts` 解析器 + fixture 测试（成功流 / `is_error` 结果 / 未知模型）。
- [ ] `claude-model-catalog.ts`（别名 + settings.json）+ 测试。
- [ ] `claude-cli-provider.ts`：argv 按 §4.3，cwd tmpdir，附件忽略。
- [ ] registry 加入 claude；模型选项 / 配置测试各加一组。

**Gate 3**：AC3 的 Claude Code 部分；AC5（未知模型报错带恢复建议）。

## Step 4 — codex

- [ ] `codex-exec-json.ts` 解析器 + fixture（成功 / `turn.failed` / metadata error 后仍成功）。
- [ ] `codex-model-catalog.ts`：`parseToml` 读 `model` + `profiles.*.model`，空 → `['default']`。
- [ ] `codex-cli-provider.ts`：argv 按 §4.3（`-c mcp_servers={}`，stdin ignore），系统提示拼 prompt 前缀，
      `-i` 图片附件实测后决定是否接。
- [ ] registry 加入 codex；测试各加一组。

**Gate 4**：AC3 的 Codex 部分（一次性到达）；AC6 取消无残留。

## Step 5 — 契约与文档

- [ ] `pi-provider-contracts.md` → `local-cli-provider-contracts.md`（旧文件留一段指针），
      写 7 段：Scope / Signatures / Contracts（argv 矩阵、协议、结束语义、密钥边界）/ 错误矩阵 / 案例 / 测试 / Wrong vs Correct。
- [ ] `main-process/index.md` 文档表更新。
- [ ] `evidence/`：AC1-AC7 的真机记录（截图 + 命令输出去密钥）。

## Step 6 — 收尾

- [ ] `pnpm lint:changed`、`git diff --check`；按 multi-session guide 核对共享文件 hunk。
- [ ] 提交拆分：`refactor(ai): share the CLI process runtime` / `feat(ai): omp …` / `feat(ai): claude code …` /
      `feat(ai): codex …` / `docs(spec): local CLI provider contracts`。

## 风险文件

- `pi-cli-provider.ts`（重构面最大）：Gate 1 用现有 32 个 pi 测试兜底；保留 `PI_CLI_*` 常量与错误码不变。
- `intelligence-config.ts`（多处 pi 特判）：grep `PI_CLI_PROVIDER_ID` 逐处改为 registry 驱动，测试覆盖两 CLI 组合。
- `package.json`（core-app 加 `yaml`）：需要 `pnpm install`，与其他会话的 lockfile 改动可能冲突，单独 commit。
