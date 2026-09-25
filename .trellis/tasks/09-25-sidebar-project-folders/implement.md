# 实施计划：侧边栏项目文件夹化

## 前置

- 读规范：`.trellis/spec/frontend/component-guidelines.md`（语义控件、i18n）、`state-management.md`（appSetting 持久化）、`quality-guidelines.md`。
- 开工前 `git status`：确认没有其他会话在改 `components/shell/`、`lang/*.json`、`app-settings.ts`。

## 步骤

1. **设置项**：`packages/utils/common/storage/entity/app-settings.ts` 的 `shell` 默认值加 `expandedProjectIds: [] as string[]`（带注释）。
2. **`modules/layout/useProjectFolders.ts`** + `useProjectFolders.test.ts`：读写 `appSetting.shell.expandedProjectIds`（防御式读取）、`toggle` / `expand` / `prune`、`activeProjectId` 自动展开。
3. **`components/shell/ShellProjectFolder.vue`**：按 design §2 实现项目行与嵌套区；把列表里现有的重命名 / 置顶 / 归档 / 发现会话 / 运行本机代理逻辑原样迁入（行为不变，只是换位置）。
4. **`ShellConversationList.vue`**：两个分区 + 已归档；选中态规则（design §3）；分区标题 `+`；无项目时的入口行；统一行度量变量。
5. **`ShellSidebar.vue`**：`isHomeActive` 改为「非项目空白对话」规则；去掉展开态的「新建项目」导航项、加 rail 专用项。
6. **`ShellProjectRows.vue`**：只调整缩进与度量变量，行为不变。
7. **文案**：zh-CN / en-US 改 `shell.projects.home` → `shell.projects.chats`（「对话 / Chats」），新增 `shell.projects.section`（「项目 / Projects」）、`shell.projects.empty`、`shell.projects.expand` / `collapse`、`shell.projects.newFromFolder`；全仓搜索旧键确认无残留引用。
8. **测试**：按 design §7 更新 `ShellConversationList.test.ts`，补 PRD 验收里列出的用例。
9. **真实应用走查**：复用 `09-25-send-split-fusion` 启动的带调试端口 dev（如果尚未启动，按那边步骤 1 启动一次）；用 CDP 截图核对 PRD 的走查项，亮 / 暗主题各一轮，窄 / 宽 / rail 三种宽度各一张。

## 验证命令

```bash
cd apps/core-app
pnpm exec vitest run \
  src/renderer/src/components/shell \
  src/renderer/src/modules/layout \
  src/renderer/src/modules/conversation/conversation-project-groups.test.ts \
  src/renderer/src/modules/lang
npx vue-tsc --noEmit -p tsconfig.web.json --composite false
npx eslint --quiet src/renderer/src/components/shell src/renderer/src/modules/layout
npx prettier --check src/renderer/src/components/shell src/renderer/src/modules/layout src/renderer/src/modules/lang
# app-settings.ts 新字段由上面的 vue-tsc 通过 appSetting 的类型间接覆盖（utils 包没有独立 tsconfig，该实体也没有单测）
git diff --check
```

## 风险与回滚点

- `app-settings.ts` 属于发布到 npm 的 `@talex-touch/utils`：只加一个带默认值的可选字段，旧配置读不到时按空数组处理，不需要迁移。
- 列表拆组件时最容易丢的是菜单动作与归档只读形态：迁移后先跑一遍现有全部用例（除了 design §7 列出要改的几条），全绿再改结构。
- 回滚点：步骤 3–6 在一个提交里；如需回退，恢复这几个文件与 lang 键即可，设置项新增字段可保留（无副作用）。
