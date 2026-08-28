# 插件安装安全与测试可信度收口

## Goal

修复 TPEX 跨域凭据泄露、重定向边界与 Clipboard 测试假绿，并建立可信聚焦门禁。

## Confirmed Facts

- `TpexPluginProvider.resolveRequestHeaders()` 当前无 URL 参数，会把 CoreApp Nexus 登录 Token 自动加入任意远程 `.tpex`、自定义 `apiBase` 和跨域绝对 `packageUrl`。
- `downloadToTempFile()` 当前通过会自动跟随重定向的 stream 请求下载，调用方无法逐跳重新判定凭据 origin。
- `store-http.service.ts` 已有严格比较 `requestUrl.origin === runtimeUrl.origin` 且不覆盖现有 Authorization 的同源模型，应复用同一合同。
- Clipboard AutoPaste 单测当前显示 5/5 通过，但 Electron mock 缺少 `session`，导入链触发的 unhandled rejection 被 `precore.ts` 报告后吞掉。

## Requirements

- R1：自动获取的 Nexus Token 只允许加入与 `getRuntimeNexusBaseUrl()` 严格同源的实际请求 URL。
- R2：任意外域远程 `.tpex`、用户自定义 Store API Source 和跨域绝对 `packageUrl` 不得携带自动 Nexus Token。
- R3：每次重定向必须重新解析 URL；跨 origin 跳转剥离 Authorization 后再发请求，并限制跳转次数与协议。
- R4：调用方显式提供的 Authorization 大小写不敏感地识别，初始同 origin 请求不得被自动 Token 覆盖。
- R5：registry detail 与 package download 分别计算 headers，不复用已为另一个 URL 生成的带密请求头。
- R6：无效 runtime base、无 Token 或非 HTTP(S) 目标必须 fail-closed，不得退化成向未知地址加 Token。
- R7：Clipboard 测试必须隔离 Electron/CoreBox/Precore 导入，补齐必要 mock；任何未处理 rejection/exception 必须令测试失败。
- R8：修改保持现有 NetworkService、typed provider 和下载进度/临时文件清理边界，不新增第二套网络客户端。

## Acceptance Criteria

- [x] 官方 runtime Nexus 同源 detail 请求自动携带登录 Token。
- [x] 任意外域直接 `.tpex` 下载不携带自动登录 Token。
- [x] 自定义外域 `apiBase` detail 请求不携带自动登录 Token。
- [x] 同源相对 `packageUrl` 下载携带自动登录 Token。
- [x] 跨域绝对 `packageUrl` 下载不携带自动登录 Token。
- [x] 大小写任意的显式 Authorization 被保留且不被自动 Token 覆盖。
- [x] 同源跳转可继续下载，跨域跳转下一跳不携带上一 origin 的 Authorization。
- [x] 超限、非法协议或缺失 Location 的重定向稳定失败，且不保留部分临时文件。
- [x] Clipboard 单测和插件宿主聚焦集退出码、stderr 与断言一致，无 `runtime.bootstrap.unhandled-rejection`。
- [x] CoreApp node typecheck、修改路径 lint、相关 focused tests、`git diff --check` 全部通过。

## Completion Evidence

- 安全测试先行：旧 TPEX 实现出现 13 个预期失败；反转同源判断时 8 项中 6 项失败，恢复后转绿。
- Windows 清理变异：旧 `.pipe()` 在模拟未关闭 writer 的 `EBUSY` 时失败；改为 `pipeline()` 后源流和 writer 错误均先关闭再删除部分文件。
- Clipboard Guard：故意泄漏 Promise 时测试退出 1；最终异常正控制、导入隔离和真实 AutoPaste owner 路径全部通过。
- 最终关键集：4 个文件、38 个测试通过；扩大 Clipboard + Plugin Host 集为 64 个文件、858 个测试通过。
- 目标 ESLint、CoreApp `typecheck:node`、Trellis context validation 和 `git diff --check` 全部通过。
- 真实 Electron manual-redirect smoke 归入后续 CI/CD 与 OTA 真机验收，不影响本任务的代码级安全收口。

## Out of Scope

- 不改变插件信任判定、Nexus 审核、安装确认或 manifest 解包语义。
- 不借本任务清理 `.dsh-plugin-hub-*` 或拆分其他未提交功能批次。
