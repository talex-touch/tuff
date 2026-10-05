# Implement — MCP 独立成页

执行前先读 `design.md`。每一步完成后跑该步列出的验证；红了就停在这一步修，不往下走。

## 步骤

1. [ ] **共享纯函数**
   - 新建 `setting-ai-import-shared.ts`，放 `errorMessage`、`displayName`、`agentLabel`、`MAX_VISIBLE_ROWS`。
   - `SettingSkillsMcp.vue` 改为从它导入。
   - 把 `setting-skills-mcp-display.ts` 和它的测试改名为 `setting-mcp-display.ts`，同步修改 import。
   - 验证：`setting-mcp-display.test.ts` 通过。
2. [ ] **`SettingMcpHost.vue`**
   - 把 (b) 部分原样迁出，加上自己的加载骨架。
   - 把 host 测试迁成 `SettingMcpHost.test.ts`。
   - 验证：9 个用例里除「邻居」那条之外全部通过；「邻居」那条在第 4 步重写。
3. [ ] **`SettingMcpServers.vue`**
   - 把 (a) 部分和对话框迁出，加上自己的快照加载、错误行和骨架。
   - 迁移 mount 测试里的 MCP 断言。
   - 验证：`SettingMcpServers.mount.test.ts` 通过。
4. [ ] **页面与接线**
   - 新建 `IntelligenceMcpPage.vue`。
   - 改 `categories.ts`、`router.ts`、两份语言文件（锚点插入）、`uno.config.ts`。
   - 重写 host 测试的「邻居」用例。
   - 验证：`categories.smoke.test.ts`、`SettingMcpHost.test.ts` 通过。
5. [ ] **瘦身 `SettingSkillsMcp.vue`**
   - 删掉 (a)、(b) 部分。
   - 错误行挪进技能组，`rescan` 不再触发发现，骨架只剩两组。
   - 验证：`SettingSkillsMcp.mount.test.ts`（剩下的技能断言）、`SettingIntelligencePage.test.ts` 通过。
6. [ ] **整体校验**（在 `apps/core-app` 下执行）
   - 跑本任务涉及的全部 vitest 文件：`node ../../node_modules/vitest/vitest.mjs run <files>`，或者按 `stale-bin-shims` 记忆直接调用 `.pnpm` 里的入口。
   - `typecheck:web`：直接调 vue-tsc 的入口，不走 `pnpm <script>`，以免 pnpm 的脚本包装触发全量安装、清空根目录的 `.bin`。
   - 用 core-app 自己的 eslint 配置检查改动文件，lint delta 为 0；`git diff --check`。
7. [ ] **真实应用验收**
   - 起 dev 实例，按 `tuff-dev-cdp-verification-gotchas` 记忆走 dev wrapper + CDP。截图保存到 `/tmp`。
   - 截以下画面：
     1. 侧栏「技能」正下方是「MCP」，图标可见；
     2. MCP 页首次加载的骨架；
     3. 加载后的两组；
     4. 智能页里已经没有这两组。
   - 实际操作一遍：开关一个服务器、点探测、打开编辑对话框、切换「让其他 AI 调用 Tuff」、显示并隐藏令牌。

## 回滚点

- 第 1–3 步只新增文件、做改名，回滚就是删除新文件，再从 HEAD 恢复 `SettingSkillsMcp.vue` 和 import。
- 第 4–5 步改了已有文件，回滚时逐个文件 `git show HEAD:<path> > <path>`。

## 开工前检查

- `implement.jsonl` / `check.jsonl` 已登记 spec 和 `research/mcp-page.md`。
- 先确认 `10-03-skills-page-revamp` 还没开始改 `SettingSkillsMcp.vue`：本任务先做。
