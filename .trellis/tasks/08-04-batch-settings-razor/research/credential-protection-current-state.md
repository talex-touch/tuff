# 登录凭证保护：现状与收敛约束

## 已确认事实

- `apps/core-app/src/renderer/src/views/base/settings/SettingUser.vue` 当前把 `auth.useSecureStorage` 绑定为可切换的 `TuffBlockSwitch`，关闭时写入 `secureStorageUserOverridden = true`。
- `apps/core-app/src/main/modules/auth/index.ts` 会监听该偏好；用户关闭后可继续持久化登录态，当前日志明确称其为“disabled by user preference”。
- `apps/core-app/src/main/utils/secure-store.ts` 当前唯一可写后端为 `local-secret`。它在应用配置目录生成 `local-secret.v1.key`，以此派生 AES-256-GCM 密钥并加密 `secure-store.json` 的值；文件创建后尝试设置 `0600` 权限。
- `getSecureStoreHealth()` 的当前 reason 已明确说明系统凭证存储被禁用。因此 UI 文案“由本机 root 密钥加密保存”不准确，不能把它描述为 OS Keychain 或系统 root 密钥。
- 安全存储不可用时，当前认证逻辑可进入 session-only 模式。

## 已确认产品决策

1. 凭证保护是不可关闭的设备级安全基线，不在设置页显示开关、状态、错误或只读条目。
2. 不可创建、读取或校验受保护存储时，当前进程可以持有登录态；退出后必须重新登录。
3. 不允许写入普通 app settings、JSON、日志或其他明文持久化位置作为替代。
4. 安全契约和故障策略应写入协议/工程文档，而不是依赖产品 UI 说明。

## 实现含义（供规划）

- 认证模块应无条件使用受保护存储作为唯一持久化路径，并移除用户覆盖字段、提醒字段和与开关有关的迁移分支。
- 旧 `useSecureStorage: false` / `secureStorageUserOverridden: true` 配置在读取时应归一化为强制保护，不能恢复不受保护的持久化语义。
- 当前本地密钥实现是否升级到系统凭证存储是独立的安全架构决策，不应被这次设置收敛伪装为已完成；文档必须如实说明已部署后端及其威胁模型。
