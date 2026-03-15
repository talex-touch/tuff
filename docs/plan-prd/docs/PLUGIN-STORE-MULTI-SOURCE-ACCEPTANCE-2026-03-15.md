# Plugin Store 多源验收清单（2026-03-15）

> 适用版本：`2.4.9`  
> 目标：完成“插件市场多源支持”最终验收与文档闭环。

## 1. Provider 能力矩阵

| Provider | 安装来源识别 | 下载/解析 | 信任分级 | 结果 |
| --- | --- | --- | --- | --- |
| Tpex API | `tpex://` / 官方 API 元数据 | ✅ | official/trusted | ✅ 通过 |
| Nexus | `/api/store/*` | ✅ | official/trusted | ✅ 通过 |
| NPM | npm 包 spec | ✅ | unverified -> 用户确认 | ✅ 通过 |
| GitHub | `owner/repo` / release asset | ✅ | unverified -> 用户确认 | ✅ 通过 |
| Local/File | 本地路径 / URL | ✅ | unverified -> 用户确认 | ✅ 通过 |

## 2. 安装与升级链路验收

- 安装主链路：`queued -> downloading -> verifying -> awaiting-confirmation -> installing -> completed`。
- 来源确认：非 official 且未 trusted 的安装请求必须弹出确认，不允许 silent install。
- 权限确认：安装阶段补齐权限确认（`always/session/deny`），拒绝后安装中止并返回明确错误。
- 升级链路：`forceUpdate + autoReEnable` 生效，活跃 UI 阻断场景可感知失败。
- 卸载链路：插件目录、插件数据目录、插件 DB 记录同步清理。

## 3. 签名与信任策略

- 有签名包：验签失败即安装失败。
- 无签名包：允许继续，但必须走来源确认（trusted/official 可跳过）。
- 安装来源元数据（provider/source/official）持久化到插件数据存储，供后续审计与更新策略使用。

## 4. 失败路径与回滚策略

- 失败路径覆盖：下载失败、验签失败、确认拒绝、活跃 UI 阻断、安装异常。
- 回滚策略：在确认拒绝或安装失败时清理 prepared 产物，避免临时文件泄漏与状态污染。
- UI 反馈：失败信息必须透传到安装状态与提示弹窗，禁止无提示失败。

## 5. 关键实现与证据

- 主进程安装队列：`apps/core-app/src/main/modules/plugin/install-queue.ts`
- Provider 注册与调度：`apps/core-app/src/main/modules/plugin/providers/registry.ts`
- 渲染侧安装管理：`apps/core-app/src/renderer/src/modules/install/install-manager.ts`
- 定向测试：
  - `apps/core-app/src/main/modules/plugin/install-queue.test.ts`
  - `apps/core-app/src/main/modules/plugin/view/plugin-view-loader.test.ts`
  - `apps/core-app/src/main/modules/permission/permission-store.test.ts`

结论：插件市场多源支持验收通过，可从 TODO “进行中”切换为“已验收”。
