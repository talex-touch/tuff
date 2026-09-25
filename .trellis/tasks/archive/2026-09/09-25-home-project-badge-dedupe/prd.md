# 移除空态问候下重复的项目徽标

父任务：`09-25-home-session-polish`（R1）

## Goal

新建的对话属于某个项目时，Home 空态不再在「今天想做点什么？」下面多出一个项目徽标；项目归属只由顶栏的项目标识表达一次。

## 现状与根因

- `apps/core-app/src/renderer/src/views/base/home/HomePage.vue:1059-1066`：`.HomePage-Head` 里在 `currentProject` 存在时渲染 `.HomePage-ProjectBadge`（文件夹图标 + 项目名，`title` 为项目根路径）。
- 同一时刻 `HomeTopBar.vue` 已经通过 `:project-name="currentProject?.name"` / `:project-path` 在顶栏左侧渲染 `HomeTopBar-ProjectPill`（`HomePage.vue:1045-1046` 传入）。
- 结果：同一个项目名在一屏里出现两次；空态里的这一次悬在问候语与输入框之间（`margin-top: 10px`，处在 `.HomePage-Center` 的 30px 间距里），和任何元素都不对齐，读起来像多出来的东西。
- 样式在 `HomePage.vue:1682-1699`（`.HomePage-ProjectBadge`）。没有任何测试引用这个类。

## Requirements

1. 删除空态里的项目徽标（模板 + 样式），不留空壳元素、不留无用样式。
2. 顶栏项目标识保持不变，仍是项目归属的唯一展示位（悬停仍显示根路径）。
3. 无项目的新对话、带项目的新对话，空态布局一致（问候语 → 输入框 → 快捷胶囊，间距由 `.HomePage-Center` 统一控制）。
4. 发送第一条消息时问候语的离场动画不受影响（`submit` 里把 `.HomePage-Head` 钉在原位的逻辑依赖它的测量高度，删除后高度变小属预期）。

## Acceptance Criteria

- [x] `rg -n "ProjectBadge" apps/core-app/src/renderer/src` 无结果。
- [x] 真实应用走查（CDP 截图）：从侧边栏进入某项目的新对话，空态只剩 Logo + 问候语 + 输入框 + 快捷胶囊；顶栏左上显示项目名。（`research/badge-project-dark.png`、`research/badge-project-light.png`）
- [x] 无项目的新对话空态截图与改动前一致。（`research/no-project-dark.png`：问候语与输入框的位置与带项目时完全相同）
- [x] 带项目的空态发送第一条：问候语照常淡出，无跳动。（`research/project-first-send-frames.jpg`，CDP screencast ~90fps；测试对话已从历史删除）
- [x] 包内 eslint、prettier、`vue-tsc -p tsconfig.web.json --composite false` 通过（trellis-implement 与 trellis-check 各跑一遍，退出码均为 0）。

## 不做

- 空态整体改版（推送、开场引导）归 `09-25-home-assistant-push`，本任务只去掉重复元素。
- 不改顶栏项目标识的样式与交互。

## Notes

- 轻量任务，PRD-only，不需要 `design.md` / `implement.md`。
- `09-25-home-assistant-push` 依赖本任务先完成（同一块空态区域）。
- 本任务是第一个需要真实应用走查的子任务：按 `09-25-send-split-fusion/implement.md` 步骤 1 重启一次带调试端口的 dev（老板已同意），之后各子任务复用。

- 3.3 spec 更新判断：无需更新——只删除一个重复元素，没有新的约定、契约或踩坑。
