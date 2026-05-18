# CloudShare Plugin Content PRD

> 状态：MVP implementation slice
> 更新时间：2026-05-17
> 适用范围：插件内容包发布、公开读取、安装计数与 snippets pack 首个验证场景。

## 背景

`CloudSyncSDK` 当前服务“用户自己的私有数据同步”，核心语义是 `/api/v1/sync/*`、设备、keyring、加密 payload/blob 与冲突处理。插件内部内容的发布与共享不应复用这套私有同步语义，否则会把公开内容、审核、安装统计和 Store 展示混进私有同步协议。

本 PRD 引入 `CloudShareSDK` 与 Nexus Content Store：插件可以发布自定义格式内容包，Store 能在插件详情页展示该插件下的共享内容。`touch-snippets` 的 `snippet-pack` 是第一条验证链路。

## 目标

- 建立 `CloudSyncSDK` / `CloudShareSDK` 边界：
  - `CloudSyncSDK`：我的数据，在我的设备间同步。
  - `CloudShareSDK`：我选择发布的数据，供别人预览、安装、订阅或 fork。
- 新增统一 `PluginContentPackage` contract，承载插件内容包元数据、manifest、inline/ref 内容、可见性、状态与安装数。
- Nexus 提供 `/api/store/plugin-content/*` API：
  - 公开读取 published + public/unlisted 内容包。
  - 登录或 API key 发布内容包。
  - 安装时返回内容包并递增 install count。
- Nexus Store 插件详情页增加 Content tab，展示插件共享内容包。
- `touch-snippets` 增加 snippet pack 导出、导入、云端列表和安装的基础能力。

## 非目标

- 不把公开内容写进 `/api/v1/sync/*`。
- 不在 MVP 做团队加密、订阅更新、评分、fork、审核后台完整流。
- 不在插件 prelude 中伪造登录发布 UI；发布 UI 后续应落在插件 Surface 或 CoreApp Store 发布管理中。
- 大内容 blob/ref 只保留 contract 字段，MVP 先支持小内容 `contentInline`。

## 数据模型

```ts
interface PluginContentPackage {
  id: string
  pluginId: string
  kind: string
  title: string
  summary?: string | null
  schemaVersion: number
  visibility: 'private' | 'unlisted' | 'team' | 'public'
  manifest: {
    importTarget: string
    minPluginVersion?: string
    format: string
  }
  contentRef?: string | null
  contentInline?: unknown
  createdBy: string
  status: 'draft' | 'pending' | 'published' | 'rejected'
  installCount: number
  createdAt: string
  updatedAt: string
  publishedAt?: string | null
}
```

### Snippet Pack Format

`touch-snippets` 使用 `tuff.snippet-pack+json`：

```json
{
  "format": "tuff.snippet-pack+json",
  "version": 1,
  "title": "React snippets",
  "summary": "Hooks and component templates",
  "pluginId": "touch-snippets",
  "kind": "snippet-pack",
  "schemaVersion": 1,
  "snippets": []
}
```

导出时默认过滤疑似 token/password/private key/API key 的内容，避免把敏感剪贴板或片段误发布。

## API

### List

`GET /api/store/plugin-content?pluginId=touch-snippets&kind=snippet-pack&limit=20&offset=0`

公开返回 `published` 且 `public/unlisted` 的内容包。

### Detail

`GET /api/store/plugin-content/:id`

公开读取可见内容包。draft/pending/rejected 默认不公开。

### Publish

`POST /api/store/plugin-content`

鉴权：`requireAuthOrApiKey(event, ['plugin:publish'])`

请求体为 `PluginContentPublishInput`。MVP 默认直接 `status=published`，管理员审核流后续再补。

### Install

`POST /api/store/plugin-content/:id/install`

公开安装读取，递增 `installCount` 并返回内容包。用户级安装记录、订阅和 fork 后续补。

## SDK

```ts
const share = createCloudShareSDK({
  pluginId: 'touch-snippets',
})

await share.publish({
  kind: 'snippet-pack',
  title: '前端常用 React 片段',
  summary: 'Hooks、组件、请求、错误处理模板',
  visibility: 'public',
  schemaVersion: 1,
  manifest: {
    importTarget: 'touch-snippets',
    format: 'tuff.snippet-pack+json',
  },
  contentInline: {
    snippets: [],
  },
})

const packs = await share.list({ kind: 'snippet-pack' })
const installed = await share.install(packs.packages[0].id)
```

## 当前落点

- `packages/utils/types/cloud-share.ts`
- `packages/utils/cloud-share/cloud-share-sdk.ts`
- `packages/utils/plugin/sdk/cloud-share.ts`
- `apps/nexus/server/utils/pluginContentStore.ts`
- `apps/nexus/server/api/store/plugin-content/*`
- `apps/nexus/app/pages/store.vue`
- `plugins/touch-snippets/index.js`

## 后续切片

1. CoreApp Store 安装内容包：安装插件与安装插件内容分开，但在同一 Store 心智内。
2. 插件 Surface 发布 UI：登录、预览、敏感内容确认、发布状态查看。
3. Nexus Dashboard 内容审核：pending/approved/rejected 队列。
4. Team visibility：团队可见与团队密钥策略。
5. 订阅更新与 fork：用户安装后可选择跟随作者更新或 fork 成本地副本。
