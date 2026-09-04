# Tuff v2.4.14-beta.22 更新说明

## 摘要

- Linux 发布安装现在同时解析 glibc 与 musl 的可选原生运行时依赖。
- Linux musl 的 LibSQL 二进制将进入打包闭包，避免生成缺少数据库运行时的官方资产。
- 发布门禁继续 fail-closed；缺失平台运行时仍会阻止发布而非降级为不完整包。

## 变更内容

- 在 pnpm workspace 的 `supportedArchitectures` 中显式声明 `libc: [current, musl]`，使 glibc CI runner 也安装 musl 可选依赖。
- 保持 CoreApp 的 `@libsql/linux-x64-musl` 可选运行时声明，并在下一版官方 Linux build 中验证完整 runtime closure。
- macOS、Windows 与 Linux N→N+1 OTA health-ack 验收仍是发布放行的后续条件。
