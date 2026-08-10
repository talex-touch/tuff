# 执行计划：本轮信息移入顶栏 ⋯ 浮层

父任务：`08-09-home-panel-layering-v2` ｜ PRD：`./prd.md` ｜ 设计：`./design.md`

## 前置

- [ ] 确认 ③ `08-09-home-preview-tabs` **尚未**开始改 `HomeSidePanel.vue`（两者冲突，本任务必须先落地）
- [ ] 记录基线：`git show HEAD:apps/core-app/src/renderer/src/views/base/home/HomeSidePanel.vue` 留一份，便于逐条比对搬迁前后的行规则

## 步骤

1. **抽纯函数**
   - 新建 `apps/core-app/src/renderer/src/modules/conversation/turn-info-rows.ts`，导出 `TurnInfoRow` 与 `buildTurnInfoRows`
   - 逐条照搬 `HomeSidePanel.vue:18-55` 的分支，不改任何条件（尤其是 `totalTokens > 0` 和 `compactions` 的真值判断）
   - 校验点：`node -e` 或临时脚本跑不了 —— 直接进第 2 步写测试

2. **补单测**
   - 新建 `turn-info-rows.test.ts`，`t` 传 `(key) => key` 替身
   - 覆盖：无 turn 时只有 messages 行 / provider 与 model 缺省时不出行 / `totalTokens: 0` 不出 token 行 / `totalTokens: 30, prompt: 10, completion: 20` 的拼接格式 / `latencyMs: 22200` → `22.2s` / `compactions: 0` 不出行、`compactions: 2` 出 `×2`
   - 验证：`pnpm -F core-app exec vitest run src/renderer/src/modules/conversation/turn-info-rows.test.ts`
   - **门禁**：这批测试必须先对着搬迁前的行为写，确认全绿，再动组件 —— 否则测的是新写的实现而不是旧的契约

3. **新建 `HomeTurnInfoMenu.vue`**
   - 照 `HomeModelMenu.vue` 的骨架：`TxDropdownMenu` + `#trigger` 插槽 + `triggerWrapRef`（`display: contents`）+ 焦点归还
   - `placement="bottom-end"`
   - 内容用 `<dl>` / `<dt>` / `<dd>`，样式从 `HomeSidePanel.vue` 的 `-Rows` / `-Row` / `-Key` / `-Value` 搬过来
   - 无 turn 时渲染 `home.panel.noTurn`

4. **接进 `HomeTopBar.vue`**
   - 加 props `turn?: ConversationTurnMeta` / `messageCount: number`
   - ⋯ 按钮包进 `<HomeTurnInfoMenu>` 的 `#trigger`，按钮上补 `aria-haspopup="menu"` 与 `:aria-expanded="open"`
   - **删掉 `open-menu` emit**（从未被监听）
   - 校验点：`rg -n "open-menu" apps/core-app/src` 应为空

5. **接进 `HomePage.vue`**
   - `<HomeTopBar>` 补 `:turn="lastTurn"` 与 `:message-count="messages.length"`

6. **清理 `HomeSidePanel.vue`**
   - 删第一段 `<section>`（本轮信息）、`rows` computed、`computed` 导入（若不再使用）、以及只服务该段的样式类
   - **保留**第二段「工作过程」与 `-Section` / `-Heading` / `-Empty`
   - 校验点：文件里不再出现 `turnInfo`，仍然出现 `workLog`

7. **文案核对**
   - `home.panel.*` 键名不改，只是使用方变了；确认 zh-CN / en-US 键集合仍一致
   - 校验点：用 node 读两份 JSON 取 `home.panel` 的 key 集合做差集，必须为空

## 验证命令

```bash
# 单测
pnpm -F core-app exec vitest run src/renderer/src/modules/conversation/turn-info-rows.test.ts

# lint（必须用包内配置，根配置规则相反）
pnpm -F core-app lint

# 类型（web 侧）
pnpm -F core-app run typecheck:web

# 死信号检查
rg -n "open-menu" apps/core-app/src
```

## 评审门禁

- 第 2 步的测试若是在改完组件之后才写的，本任务判定不通过 —— 契约测试必须先于重构存在
- 第 6 步删样式前先 `rg` 确认该类名在文件内已无引用，别顺手删掉「工作过程」还在用的 `-Section` / `-Heading` / `-Empty`

## 回滚点

- 步骤 1-2 完成：纯新增，无行为变化，可独立保留
- 步骤 3-5 完成：⋯ 可用但右侧面板仍有重复的本轮信息 —— 这是一个可用的中间态，出问题可以停在这里
- 步骤 6-7 完成：搬迁完成。整体回滚 = `git revert` 该提交
