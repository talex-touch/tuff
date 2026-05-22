# 2.4.11 Active Goal Closure - 2026-05-23

> 状态：当前参考
> 范围：记录本轮“按点开分支、分批提交、最终压缩文档”的持续收口目标与下一步执行顺序。
> 当前事实仍以 `../TODO.md` 与 `../01-project/CHANGES.md` 为准。

## Goal

本轮目标是先清干净 `2.4.11` 稳定化与质量门禁，再推进插件和 Intelligence 相关增强。执行要求：

- 每个明确点位单独开分支或 worktree，做完后合并回聚合 worktree。
- 每个切片 related-only commit，不混入未跟踪依赖目录或无关改动。
- 行为、接口、架构或目标口径变化必须同步 `README / TODO / CHANGES / INDEX` 至少一处。
- 功能切片累积后压缩活跃文档，历史细节下沉到 `CHANGES` 或专题文档。
- 不 push，除非单独获得明确指令。

## Current Done

- `docs(plan-prd): compress active governance summaries` 已合并到聚合 worktree。
- `touch-browser-bookmarks` 默认浏览器打开 URL 已接入 `network.internet`：展示期 capability/audit metadata，执行期 request/block，成功返回 `started`。
- `touch-browser-data` 默认浏览器打开本地书签 URL 已接入同一 `network.internet` 口径：
  - manifest 声明 optional `network.internet`；
  - 展示期只做 non-mutating permission check；
  - result item 暴露 browser/profile/host 级 capability audit；
  - 执行期 request 权限，拒绝返回 `blocked`，授权后 `await openUrl()` 并返回 `started`。
- CoreApp 统一网络/代理设置入口已落地到高级设置，代理凭据仍只展示 secure-store reference，不保存明文。

## Verification Baseline

当前 `touch-browser-data` 切片验证口径：

```bash
node "plugins/touch-browser-data/index.test.cjs"
pnpm exec eslint --no-ignore "plugins/touch-browser-data/index.js" "plugins/touch-browser-data/index.test.cjs"
node --check "plugins/touch-browser-data/index.js"
node --check "plugins/touch-browser-data/index.test.cjs"
git diff --check
```

已验证：`node:test` 14/14 通过；ESLint 仅有仓库既有 `.eslintignore` deprecation warning；`node --check`、`git diff --check` 与冲突标记扫描通过。

## Next Order

1. P0 先解质量门禁：复核 `test:targeted` 中 Nexus 测试路径，避免旧 `server/api` 路径继续拖垮 PR Quality。
2. P0 处理 open PR：先解决 #273 / #272 与最新 master 的冲突；#273 checks 已过则优先合，#272 先修 PR Quality。
3. P0 继续 Transport retained aliases 与 CoreBox retained hide 相关验证，只在当前代码证据不足时补 focused tests。
4. P0 继续剩余 shell/OS/network capability surface、secret backend、Windows/macOS 真机 evidence 与公共 npm 子包发布权限问题。
5. P1 再推进插件与 Intelligence 增强：skills repository、Provider/Scene 能力、可配置本地工具入口（Codex / ClaudeCode / Gemini 等）必须走 typed SDK / capability gate，不抢占 `2.4.11` 稳定化资源。
