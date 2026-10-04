# nexus-admin-resource

后台组合件 `useAdminResource`（`apps/nexus/app/composables/useAdminResource.ts`）负责单个非分页请求的加载状态，例如：

- 概览统计；
- 按需查询；
- 一次请求供多个区块使用的面板。

分页列表仍用 `useAdminList`。页面显式 import 它。

## Requirement: 接口

```ts
interface AdminResourceOptions<T> {
  /** 发起一次请求。immediate 为真时，组合式函数创建后调用一次；之后每次 refresh() 调用一次。 */
  fetch: () => Promise<T>
  /** 本地化的兜底文案：错误里没有可展示的服务端说明时使用。 */
  errorFallback: () => string
  /** 创建时立即请求，默认 true。 */
  immediate?: boolean
}

interface AdminResource<T> {
  /** 最近一次成功的结果；刷新与失败时都保留。 */
  data: Readonly<Ref<T | null>>
  /** 有请求在途，且还没有 data。 */
  loading: Readonly<Ref<boolean>>
  /** 有请求在途，且已有 data。 */
  refreshing: Readonly<Ref<boolean>>
  /** 最近一次已结束的请求失败时为本地化文案，成功时为 null。 */
  error: Readonly<Ref<string | null>>
  /** 发起一次请求，返回的 Promise 在这次请求结束时 resolve，永不 reject。 */
  refresh: () => Promise<void>
}

function useAdminResource<T>(options: AdminResourceOptions<T>): AdminResource<T>
```

错误文案一律经 `resolveAdminErrorMessage(error, errorFallback())` 得到：优先取服务端的 `data.message` 或 `statusMessage`，绝不回落到 ofetch 的 `[GET] "/api/…"` 原文。

### Scenario: 首次加载与刷新

- WHEN 以默认选项创建，`fetch` 尚未返回
- THEN `loading` 为真，`refreshing` 为假，`data` 为 null
- WHEN `fetch` 成功返回
- THEN `data` 为返回值，`loading` 为假，`error` 为 null
- WHEN 调用 `refresh()` 且新请求尚未返回
- THEN `refreshing` 为真，`loading` 为假，`data` 仍是上一次的结果

验收：A11

## Requirement: 失败

请求失败时：

- `error` 设为本地化文案；
- `data` 保留上一次成功的结果，没有则仍为 null；
- `loading` 与 `refreshing` 都回到假。

之后的成功请求把 `error` 清为 null。

### Scenario: 失败后重试

- WHEN 首次请求以 ofetch 错误失败，错误信息为 `[GET] "/api/x": 500`，且没有服务端说明
- THEN `error` 为 `errorFallback()` 的文案，不含 `/api/`；`data` 为 null
- WHEN 再次调用 `refresh()` 且成功
- THEN `error` 为 null，`data` 为新结果

验收：A11

## Requirement: 请求代次

每次 `refresh()` 开启一个新代次，只有最新代次的结果写入状态。较早代次后到的成功或失败都被丢弃，不改变 `data`、`error` 或状态标志。组合式函数所在的作用域销毁后，在途请求的结果同样被丢弃。

### Scenario: 旧响应不覆盖新结果

- WHEN 连续两次调用 `refresh()`，第二次请求先返回 B，第一次请求后返回 A
- THEN `data` 为 B，A 被丢弃
- WHEN 第一次请求后来以失败告终
- THEN `error` 仍为 null，`data` 仍为 B

验收：A11

## Requirement: 按需请求

`immediate: false` 时创建后不发请求，`loading`、`refreshing` 都为假，`data` 与 `error` 为 null，直到第一次 `refresh()`。

### Scenario: 不自动请求

- WHEN 以 `immediate: false` 创建
- THEN `fetch` 未被调用，`loading` 为假
- WHEN 调用 `refresh()`
- THEN `fetch` 被调用一次，`loading` 在返回前为真

验收：A11
