# 技能本地目录 · 执行

## S1 main 扫描与读取
- [x] modules/ai/skill-local-sources.ts：注册表读配置、扫描（symlink 跟随、50 上限）、frontmatter 解析（复用仓内既有 frontmatter 工具，无则最小实现）、readLocalSkill(id) 带 realpath 校验
- [x] agent-context-source：readSkill 分流 local: 前缀；listSkills 供注入/设置消费
- [x] ai-imported-config-runtime.buildHomeInjection：合并 enabled-local 元数据
- [x] 单测全覆盖（真实 fs+symlink，49 绿）

## S2 设置 UI
- [x] SettingSkillsMcp skills 区「本地目录」子块：目录列表+添加（系统目录选择器走既有 dialog 通道先例）+移除+重扫；本地技能行启停
- [x] i18n 精准插键 zh+en（18 键双语对齐）

## S3 门与证据
- [x] scoped vitest + typecheck×2 + lint 全绿；证据 research/local-skill-smoke.md（真机三项待重启验证）
