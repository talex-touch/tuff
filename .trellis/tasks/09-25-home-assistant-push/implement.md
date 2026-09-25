# 实施计划：主页个人助理推送

## 前置

- `09-25-home-project-badge-dedupe` 已完成；`09-25-tuffex-choice-card` 已在 tuffex dist 中（含 `columns`）。
- 读规范：`component-guidelines.md`（加载态骨架、i18n）、`hook-guidelines.md`、`state-management.md`、`type-safety.md`（新增 operation 常量）、`../guides/cross-layer-thinking-guide.md`（`packages/utils` 常量 + 渲染层 + 主进程审计三端）。

## 步骤

1. `packages/utils/types/intelligence.ts`：新增 `INTELLIGENCE_HOME_OPENING_OPERATION = 'home-opening'`；主进程审计 / 路由如按 operation 做白名单，同步登记（先 `rg "conversation-title"` 找到所有登记点）。
2. `modules/home-push/` 纯函数与状态机 + 单测（PRD 验收的两组单测）。
3. `useHomeConversation`：`send` 的 `lead` 参数；`toProviderMessages` 的前置助理消息转系统提示（文案由调用方传入）；更新 `useHomeConversation.test.ts`。`HomePage.vue` 的 `maybeGenerateTitle` 改取用户消息之后的助理消息。
4. 共享续接函数：把 `ShellConversationList.vue` 的 `continueSession` 抽到 `modules/conversation/`（侧边栏与推送共用）；侧边栏子任务若已先改动这个文件，在其基础上抽取。
5. `uno.config.ts` safelist + `configDeps` 加 `HOME_PUSH_ICON_CLASSES`；图标存在性测试。
6. `HomePage.vue`：英雄区开场白、`TxChoiceCard` 替换快捷胶囊、卡片动作、并入对话；删掉 `quickPills` / `applyPill` 与对应样式和 `home.pill.*` 文案（确认无其他引用）。
7. 语言包 zh-CN / en-US：提示词、模板、引导卡、推送项、骨架无障碍文案。
8. 真实应用走查（带调试端口的 dev，见 `09-25-send-split-fusion` 步骤 1）：PRD 列出的四个场景，亮 / 暗、600px 高窗口；走查用的对话结束后从历史里删除。

## 验证命令

```bash
cd apps/core-app
pnpm exec vitest run \
  src/renderer/src/modules/home-push \
  src/renderer/src/modules/conversation \
  src/renderer/src/modules/lang
npx vue-tsc --noEmit -p tsconfig.web.json --composite false
npx tsc --noEmit -p tsconfig.node.json --composite false      # 若步骤 1 动了主进程登记点
npx eslint --quiet src/renderer/src/modules/home-push src/renderer/src/views/base/home src/renderer/src/modules/conversation
npx prettier --check src/renderer/src/modules/home-push src/renderer/src/views/base/home
curl -s http://127.0.0.1:5173/__uno.css | /usr/bin/grep -a -c "i-ri-"   # safelist 生效抽查
git diff --check
```

## 风险与回滚点

- **成本**：走查期间每次进入空白新对话都会调用模型；2026-09-25 老板确认测试全部走真实提供方。模板兜底路径仍需用不可用路由（或断网）单独验证一次。
- **提供方兼容**：前置助理消息转系统提示后，逐个用老板实际在用的提供方各发一轮确认不报错（尤其 Anthropic 与 pi CLI）。
- **与发送分裂动画同改 `HomePage.vue` / `submit()`**：本任务在分裂动画之后落地，开工前重读最新 `submit()`。
- 回滚点：`useHomeConversation` 的 `lead` 是可选参数，回退 HomePage 即可恢复旧空态；`home-push/` 目录可整体删除。
