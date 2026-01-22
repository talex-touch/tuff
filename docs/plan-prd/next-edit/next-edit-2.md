# 下一次编辑 2

## 现象与问题
- Nexus 页面报错：`useI18n is not defined`（截图指向 `apps/nexus/app/app.vue`）。
- Core App dev 登录后，后续请求仍走生产基址，导致账号/订阅/配额等信息获取失败或不一致。
- 新增 UI 组件需优先使用 Tuffex 组件体系。

## 根因分析
- `apps/nexus/app/app.vue` 依赖 `useI18n` 自动导入，但运行时未注入（Nuxt 自动导入失效或打包侧裁剪）。
- Core App 业务层使用 `getTuffBaseUrl()` 直连 Nexus，未根据 `appSetting.dev.authServer` 统一切换本地基址。
- `getAuthToken()` 仅走 Clerk token，本地 dev 登录未提供 Clerk session，导致 token 为空。

## 方案/修复点
- 新增统一环境解析：`getAuthBaseUrl()` / `isLocalAuthMode()` / `getDevAuthToken()`。
- 所有 Nexus 请求与外链入口改为 `getAuthBaseUrl()`。
- `getAuthToken()` 在 dev 模式读取本地 token（`tuff-dev-auth-user`）。
- 弹窗内按钮使用 `TxButton`（Tuffex）。

## 待确认/风险
- `useI18n` 报错建议：在 `apps/nexus/app/app.vue` 显式 `import { useI18n } from '#imports'` 或 `vue-i18n`，避免自动导入失效导致运行时报错。
- 本地 dev 登录 token 的发放/刷新机制需确认（本实现依赖 localStorage 缓存）。
