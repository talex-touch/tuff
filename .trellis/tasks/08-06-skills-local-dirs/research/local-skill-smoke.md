# 本地技能链路 · 门与证据（#7，主会话接力收尾）

实施代理（skills-local-dirs）完成 #4-#6 后死于 API 529；本文件由主会话补记。

## 自动化证据（真实文件系统，非 stub）

- `skill-local-sources.test.ts` + `agent-context-source.test.ts` + `ai-imported-config-runtime.test.ts`：49 测试绿（2026-08-06）。覆盖：真实目录扫描、**真实符号链接**条目跟随与边界（解析目标为界）、realpath 越界拒绝、frontmatter 解析、`local:` id 稳定性、启停过滤（关闭=不可读而非仅不列出）、注入清单合并（imported ∪ local 单目录）、50 条上限截断
- typecheck×2 我方范围 0 错；全部涉事文件 eslint 过
- spec 契约已由代理更新进 `agent-tool-gateway-contracts.md` §4/§5/§6/§7（local: id 解析规则、单跳 symlink 边界、错误矩阵行、真实 fs 测试要求）

## 待用户重启后的真机项

1. 设置 → 智能 → 技能区「本地目录」：添加一个含 `demo/SKILL.md` 的目录 → 列表出现该技能
2. 首页会话（Auto Context 开）：注入清单含该技能 → 模型 `tuff_skill_read local:…` 读到正文
3. 编辑 SKILL.md 正文 → 下一轮读到新内容（链接语义的核心验收）

架构注记：目录注册表持久在 main 自有存储（`skill-local-sources.json`，storage registry 定义 schema），渲染层只递「用户挑的目录」收「重扫快照」——路径不回写。
