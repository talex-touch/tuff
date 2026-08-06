# 技能本地目录源（链接语义，不拷贝）

父任务：`.trellis/tasks/08-05-ai-toolchain-suite`。C 任务设计遗留的 P1 档，用户定语义：**链接（引用原位置），不是导入拷贝**。

## Goal

用户注册若干本地技能目录（如 `~/tuff-skills/`），目录里的 `*/SKILL.md`（含符号链接条目）被原位扫描、按元数据注入首页会话、`tuff_skill_read` 原位读取——**编辑 SKILL.md 下一轮立即生效，无导入步骤，无落库副本**。

## Requirements

- 目录注册表：增删本地目录（持久化于应用配置）；扫描 `<dir>/*/SKILL.md` 与 `<dir>/SKILL.md`，frontmatter 取 name/description；**符号链接条目跟随解析**
- 注入合并：enabled 的本地技能与 imported 技能一起进 buildHomeInjection 的 metadata 清单（id 形如 `local:<hash(path)>`，与 imported id 空间不冲突）
- 读取：agent-context-source.readSkill 识别 local id → 只允许读该技能条目**解析后目录**内文件（realpath 包含性校验，防目录穿越；条目本身是符号链接时以解析目标为界）
- 设置 UI：SettingSkillsMcp 的 skills 区加「本地目录」子块——目录列表（添加/移除/重扫）+ 本地技能启停（状态存配置）
- 每轮取数不缓存跨轮（与 imported 注入同语义：改动下一轮生效）；单目录扫描上限 50 条防失控

## Acceptance Criteria

- [ ] 单测：扫描（含 symlink 条目）、frontmatter 解析、id 稳定性、realpath 越界拒绝、启停过滤、注入合并
- [ ] 手动：目录放一个 SKILL.md → 设置里出现并启用 → 会话里模型能 tuff_skill_read 到正文；编辑正文后下一轮读到新内容
- [ ] typecheck×2 / lint 全绿
