# Release Notes 编写规范 / Release Notes Authoring Guide

> 面向发版人员及其本地写作工具。每个 Release/Beta 版本必须提交一对中英双语 Markdown；发布云端只做确定性校验，不调用 AI，也不会翻译、补写或回退生成正文。
>
> For release authors and their local authoring tools. Every Release/Beta version must commit one Chinese/English Markdown pair. Cloud release jobs only validate deterministically: they do not call AI, translate, complete, or synthesize fallback copy.

## 唯一输入 / Single source of truth

每个版本只新增以下两个版本化文件：

- `notes/update_<version>.zh.md`
- `notes/update_<version>.en.md`

`<version>` 是不带 `v` 前缀的完整语义版本，例如 `2.4.14` 或 `2.4.14-beta.1`。不要另外维护 JSON、manifest、prompt、模型记录、范围文件或 evidence；GitHub Release、Nexus 和 App 内 What's Changed 所需格式都从这两个文件确定性派生。

Each version adds only the two files above. `<version>` is the complete semantic version without a `v` prefix. Do not maintain a second JSON/manifest/evidence source.

Snapshot 构建不要求版本日志，也不会进入升级后一次性展示的“本次更新”摘要。`notes/release-notes.config.json` 中的基线只定义双语发布文档强契约的起点；基线及更早的 Release/Beta 版本无需回填，不代表 App 提供 Legacy 浏览能力。

Snapshot builds are exempt and excluded from the one-time post-upgrade What's Changed summary. The thresholds in `notes/release-notes.config.json` only define where the bilingual publishing contract starts; Release/Beta versions at or before them are not backfilled and do not imply an in-app Legacy browser.

## 强制结构 / Required contract

中文文件：

```markdown
# Tuff v<version> 更新说明

## 摘要

- <摘要 1>
- <摘要 2>
- <摘要 3>

## 变更内容

- <变化 1>
```

英文文件：

```markdown
# Tuff v<version> Release Notes

## Summary Notes

- <Summary 1>
- <Summary 2>
- <Summary 3>

## What's Changed

- <Change 1>
```

规则：

- H1 必须与语言和目标版本精确匹配。
- `摘要` / `Summary Notes` 必填，必须有 3–6 条。
- `变更内容` / `What's Changed` 必填且至少有 1 条。
- 章节正文只允许无序列表；每条只表达一个用户可感知的变化。
- 中英文对应章节的条目数量必须一致，含义应一一对应。
- 不允许 `TODO`、`TBD`、`N/A`、`暂无`、`不适用` 等占位内容。

Rules:

- The H1 must exactly match the locale and target version.
- Summary Notes is required and must contain 3–6 items.
- What's Changed is required and must contain at least one item.
- Section bodies contain unordered lists only; each item describes one user-visible effect.
- Chinese and English section item counts must match, with equivalent meaning in order.
- Placeholder copy such as `TODO`, `TBD`, `N/A`, `暂无`, or `不适用` is forbidden.

## 可选章节 / Optional sections

只在确有内容时加入以下章节；禁止为了保持模板完整而填“无”。若加入，中英文两份必须同时出现且条目数量一致。

| 中文 H2         | English H2             | 用途 / Purpose                                                      |
| --------------- | ---------------------- | ------------------------------------------------------------------- |
| `## 新增内容`   | `## What's New`        | 新功能或新能力 / New capabilities                                   |
| `## 破坏性变更` | `## Breaking Changes`  | 需要用户采取行动的兼容变化 / Compatibility changes requiring action |
| `## 已知限制`   | `## Known Limitations` | 当前真实存在的用户可感知限制 / Current user-visible limitations     |

推荐顺序：摘要、What's New、What's Changed、Breaking Changes、Known Limitations。除表中章节外，不要新增其他 H2。

Recommended order: Summary Notes, What's New, What's Changed, Breaking Changes, Known Limitations. Do not add other H2 sections.

## 写作原则 / Authoring principles

- 效果优先：写用户能感知的结果，不写内部类名、事件链或重构过程。
- 具体克制：说明改变了什么及其影响，避免营销口号和实现流水账。
- 保留重要限制：破坏性变化和已知限制不能藏在笼统摘要中。
- 双语自然：保持事实和顺序一致，但不要求逐字直译。
- 纯内部变更不必写入；若该版本只有修复，仍应在 What's Changed 中明确修复效果。

- Lead with user-visible outcomes rather than internal implementation details.
- Be specific and concise; avoid marketing language and engineering inventories.
- Keep breaking changes and known limitations explicit.
- Preserve facts and ordering across languages without forcing literal translation.
- Purely internal work may be omitted; fix-only releases still describe their effect under What's Changed.

## 本地流程 / Local workflow

1. 先同步根目录与 `apps/core-app/package.json` 的目标版本。
2. 获取同渠道上一 tag 到目标 ref 的本地写作上下文：

   ```bash
   pnpm release:notes:prepare -- --version <version> --target-ref HEAD
   ```

   输出包含目标 SHA、上一同渠道 tag、commit 范围和双语模板。需要创建空白模板时可加 `--write`；命令拒绝覆盖已有文件。

3. 使用任意本地编辑器、脚本或 AI 工具撰写两份 Markdown。只提交最终文档，不上传 prompt、模型记录或写作 evidence。
4. 在打 tag 前执行确定性校验：

   ```bash
   pnpm release:notes:verify -- --version <version> --tag v<version>
   ```

5. 修复所有校验错误后再提交和发版。

The author may use any local editor, script, or AI tool. Only the final Markdown pair is versioned. Run `prepare` for same-channel commit context and `verify` before tagging.

## 下游行为 / Downstream behavior

- GitHub Release 正文使用 author 双语文档；merged PR inventory 仅作为附录。
- Nexus 只接收 generator 产生的双语正文与 metadata asset，不读取 GitHub body 作为 fallback。
- CoreApp 打包支持范围内的双语摘要索引，用于升级后一次性展示“本次更新”并记录已读版本。
- “本次更新”弹窗可跨 Release/Beta 聚合摘要；Update 页不提供版本历史，客户端也不从 Nexus 分页读取或在本地缓存历史正文。
- Release/Beta 缺少合规 author 文档时发版失败。自动 PR 列表、共享 `notes/update_<version>.md` 或 GitHub body 都不能绕过门禁。

- GitHub Release uses the authored bilingual documents; merged PR inventory is appendix-only.
- Nexus consumes generated bilingual metadata and never falls back to the GitHub body.
- CoreApp bundles the supported bilingual summary catalog for the one-time post-upgrade What's Changed dialog and records the acknowledged version.
- The What's Changed dialog aggregates Release/Beta summaries; the Update page has no version-history browser, and the client neither pages history from Nexus nor caches historical notes locally.
- Missing or invalid Release/Beta author documents fail the release. PR lists, shared Markdown, and GitHub body cannot bypass the gate.
