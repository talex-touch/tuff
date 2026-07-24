# Release Notes 生成规范 / Release Notes Authoring Guide

> 面向**发版时的 AI**(或人)。目标:每次发版自动生成**精简、效果优先**的双语更新说明,直接被发布链路消费。
> Audience: the AI (or a human) cutting a release. Goal: auto-produce concise, **effect-first** bilingual notes that the release pipeline consumes verbatim.

## 产物 / Output

每个版本生成两个文件,放在 `notes/`:

- `notes/update_<version>.zh.md`
- `notes/update_<version>.en.md`

`<version>` = 完整语义版本,**不带 `v` 前缀**,含预发布后缀。例:`2.4.13-beta.21`。

文件内首行 H1 **带 `v`**:

- zh:`# Tuff v<version> 更新说明`
- en:`# Tuff v<version> Release Notes`

## 风格(硬要求)/ Style (hard rules)

- **效果优先**:写用户能感知的变化,不写实现细节。
  - ✅ 正例:「更新一键完成,无需手动重启」
  - ❌ 反例:「重构 UpdateService 事件链 / 引入 attemptId 去重」
- **每条一行**:一句话说清一个变化,不换行、不堆细节。
- **克制字数**:亮点 3–6 条;能一句说清就不写两句。
- **双语对应**:zh 与 en 一一对应,条数、含义一致。
- zh 和 en **都必须非空** —— 否则发布 gate `checkNotes` 失败。

## 结构 / Structure

只保留两段,第二段可省:

```markdown
# Tuff v<version> 更新说明

## 本次更新

- <效果 1>
- <效果 2>

## 已知限制   ← 可选,只在确有用户可感知的限制时写

- <限制 1>
```

en 对应 `## Highlights` / `## Known Limitations`。

> 不再写 beta.14 那种「## 已验证 / Validation」工程证据段——签名、校验、平台验证证据由 release evidence 与 manifest 承载,不进用户可读的 notes。

## 生成流程(发版时)/ How to generate

1. 确定上一个**同通道** tag(beta→beta,release→release,snapshot→snapshot)。
2. 读 `<prev-tag>..HEAD` 的 commit / 合并 PR。
3. 把变更**归纳成用户可感知的效果**:合并同类项,丢弃纯内部项(`refactor`/`chore`/`test`/lockfile/文档/内部组件)。
4. 按上面的结构写 `zh` + `en` 两个文件。
5. **在打 tag 之前**提交这两个文件。

## 机制:为什么这么写 / Why

- 手动 `notes/update_<version>.{zh,en}.md` 是更新说明的**唯一真相源**:存在即覆盖下游——
  - 被 `scripts/generate-release-notes.mjs` 当作正文,**覆盖**自动 PR 列表;
  - 被 Nexus 同步为应用内「更新说明」(verbatim);
  - 满足发布 gate 的 `checkNotes`(仅要求 zh/en 非空,无结构/字数校验)。
- GitHub Release 正文仍由合并 PR 自动生成(`buildGitHubBody`),notes 文件作为「Notes Preview」附在其后。
  所以 notes 只负责**给用户看的精简效果**,详尽 PR 清单交给自动化。
