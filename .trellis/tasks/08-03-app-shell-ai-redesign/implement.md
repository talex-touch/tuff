# 执行计划 · 父任务

父任务本身不写实现代码，只负责子任务编排、跨子任务一致性与最终集成验收。

## 顺序

```
① shell-fixed-frame  ──┬──> ② settings-ia-primitives ──> ③ settings-rewrite
                       └──> ④ home-conversation
```

① 是所有后续的前置：它决定了 shell 的组件契约和 `--shell-*` token 层。② 产出的行式基础组件是 ③ 的输入。④ 只依赖 ① 的 shell 骨架，与 ②③ 并行。

## 子任务清单

- [ ] ① `08-04-shell-fixed-frame` —— 移除 layout 切换特性 + 固定 shell 骨架
- [ ] ② `08-04-settings-ia-primitives` —— 设置页 9 分类路由 + 行式基础组件
- [ ] ③ `08-04-settings-rewrite` —— 18 个 `Setting*.vue` 按设计稿重写
- [ ] ④ `08-04-home-conversation` —— 首页对话最小闭环

## 评审门

| 门 | 时机 | 检查 |
|---|---|---|
| G1 | ① 删除提交之后、`AppShell` 落地之前 | 删除清单逐项核对；壁纸/主题/窗口效果三项能力未被误删 |
| G2 | ② 完成 | 行式基础组件与画板实测值逐项对齐（padding / gap / fontSize / 颜色 token）；light + dark 双验 |
| G3 | ③ 完成 | 用 4.1 映射表逐项核对 20 个来源组件的每一项设置都有归属，无遗漏 |
| G4 | ④ 完成 | 发一条消息 → 收到流式回复 → 重启应用历史仍在 |
| G5 | 全部完成 | 跨子任务验收标准全过 |

## 验证命令

```bash
pnpm lint
cd apps/core-app && npm run typecheck
```

对话表变更后额外：

```bash
cd apps/core-app && npm run db:generate && npm run db:migrate
```

## 回退点

- ① 的删除提交与 `AppShell` 落地提交分开，可单独 revert 删除。
- ②③④ 各自成独立提交序列。
- 任一子任务失败不阻塞其余子任务的已完成部分。
