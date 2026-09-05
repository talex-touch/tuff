# C6 · 记录分享

> **当前状态：只出设计稿，不实现。** 用户决定分享「到时候再做」。本任务保留完整需求与已核实的约束，等排期。设计稿已完成：S8 配置态（`DZJss`）、F7 完成态（`fTz23`）、F8 敏感拦截（`GzbHg`）。

父任务：`09-05-clipboard-history-detail-relayout`。设计稿：各屏底栏的分享图标、SPEC 面板「分享（记录级，不是文件级）」一节。

## Goal

用户原话：「这个是不是有点多余 但是我觉得分享可以做」——指的是文件预览返回条右侧的「打开」图标。

两件事：
1. **删掉**文件预览返回条上的「打开」图标（访达能做的事不值得占那个位置，返回条只留 `‹ 文件名` + `类型 · 大小`）。
2. **新增**分享能力，放在**底栏**、与 复制 / 粘贴 / 收藏 / 删除 并列。

## 为什么是记录级不是文件级

分享的对象是**这条剪贴记录**，不是预览里打开的某个文件。底栏承载的一直是记录级动作，分享属于同一层；放在预览返回条里会让它看起来只对当前文件生效。

## 已核实的现状（不是推测）

| 事实 | 出处 |
| --- | --- |
| 存在可用的 `CloudShareSDK`，有 `publish` / `list` / `get` / `install` | `packages/utils/plugin/sdk/cloud-share.ts`、`packages/utils/cloud-share/cloud-share-sdk.ts` |
| `visibility` 支持 `'private' \| 'unlisted' \| 'team' \| 'public'`，`unlisted` 就是「有链接就能看」 | `packages/utils/types/cloud-share.ts:1` |
| `publish` 接受 `contentInline?: unknown`（任意 JSON），也接受 `contentRef?: string \| null` | `types/cloud-share.ts:31-42` |
| **`PluginContentPackage` 没有 URL 字段，只有 `id`** | `types/cloud-share.ts:12-29` |
| **没有文件上传通路** —— `contentRef` 只是个字符串，SDK 里没有上传方法 | `cloud-share-sdk.ts` 只有 publish/list/get/install |
| **需要登录** —— `resolveAuthToken` 拿不到 token 直接 `throw` | `plugin/sdk/cloud-share.ts:32-42` |
| **全仓没有任何使用方** —— `grep -rln "useCloudShareSDK\|CloudShareSDK" plugins/ apps/core-app/src` 无命中 | 端到端未验证 |

最后一条是本任务最大的风险：这条链路从来没被跑通过，第一个用它的人要承担联调成本，排期必须把这部分算进去。

## Requirements

### R1 删除文件预览返回条的「打开」

返回条只保留 `‹` + 文件名 + `类型 · 大小`。「用默认应用打开」/「在访达中显示」保留在**不可预览类型的兜底面板**里（C5 的兜底态），以及文件行的右键菜单。

### R2 底栏分享按钮

- 图标按钮（`share-2`），位置在 `复制` / `粘贴到当前应用` 之后、`收藏` 之前。
- 与 `收藏` / `删除` 同一套 `.icon-button` 样式；`aria-label` / `title` 承载文案；沿用 C1 定的 pending 文案约定（`data-testid="share-button"`）。

### R3 分享行为

```ts
const share = useCloudShareSDK()
await share.publish({
  kind: 'clipboard-item',
  title: getClipboardTitle(item),
  summary: /* 摘要条那一行 */,
  schemaVersion: 1,
  visibility: 'unlisted',
  manifest: { importTarget: 'clipboard-history', format: 'clipboard-item@1' },
  contentInline: { type, content, rawContent, meta },
})
```

- 成功后把链接写入剪贴板并给出 toast。
- **链接形状必须先和服务端确认**，`publish` 返回值里没有 URL，不要自己拼一个猜的路径。这是开工前的阻塞项。

### R4 可分享范围（第一版）

| 内容 | 第一版 | 原因 |
| --- | --- | --- |
| 文本 / 链接 / 颜色 / 代码片段 | ✅ 走 `contentInline` | JSON 可内联 |
| 图片 / 文件 | ❌ 排后 | 没有上传通路；可先提供「分享为文本」（例如分享 OCR 结果或文件清单），但不要伪装成分享了原文件 |

### R5 安全闸

- 命中「密钥」分类（`meta.tags` 含 `api_key` / `token` / `password`，见 C2 的分类器）的记录**默认禁止分享**。
- 用户坚持要分享时必须二次确认，且显式勾选「我知道这会公开一个凭据」。
- 链接文本里的敏感 query 参数（C2 已标掩码的那些）在分享前提示用户是否剥离。

### R6 未登录态

`accountSDK.getAuthToken()` 抛错时不要静默失败：按钮 disabled + tooltip 说明需要登录，点击引导到登录入口。

## 依赖与顺序

- 依赖 **C1**（底栏图标按钮的样式与结构）。
- 依赖 **C2**（R5 的密钥判定）。
- R1 与 **C5** 相关但不阻塞：C5 若已合入，直接删那个图标；若未合入，在 C5 的返回条设计里就不要加它。

## 开工前的阻塞项

- [ ] **和服务端确认分享链接的 URL 形状**，以及 `unlisted` 包在未登录访问时的行为。这一条没确认前不要开始写 UI。
- [ ] 确认 `publish` 对 `kind` 的取值有没有白名单（`clipboard-item` 是否需要服务端先注册）。

## Acceptance Criteria

- [ ] 文件预览返回条不再有「打开」图标；不可预览类型的兜底面板里仍能「用默认应用打开」。
- [ ] 底栏出现分享图标按钮，位置在粘贴之后、收藏之前，`data-testid="share-button"`。
- [ ] 分享一条文本记录：成功后剪贴板里是可访问的链接（真机点开验证，不是只看接口返回 200）。
- [ ] 未登录时按钮 disabled 并给出说明，不产生未捕获异常。
- [ ] 命中「密钥」分类的记录默认不可分享；二次确认流程可走通。
- [ ] 图片 / 文件记录的分享按钮给出明确的「暂不支持」说明，而不是报错或静默无反应。
