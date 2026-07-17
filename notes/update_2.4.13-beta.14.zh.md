# Tuff v2.4.13-beta.14 更新说明

## 本次更新

- 固定 CoreApp 打包后的可执行文件名为 `tuff`，避免 Linux AppImage 等平台从 scoped workspace package name 推导出非法或不一致的入口名。
- 保留 beta 版本的真实发布身份，Windows setup installer 与 `latest.yml` 不再把 `-beta.N` 改写为 `-SNAPSHOT.N`。
- macOS 后处理归档现在把版本与架构写入 app ZIP 文件名，使 release manifest 与 Nexus 能把 Apple Silicon 包识别为 `darwin/arm64`，不再回退成 x64。
- 发布下载矩阵继续以 Windows x64 setup、macOS arm64 app ZIP、Linux x64 AppImage 为三平台首选资产。

## 已验证

- GitHub Release 与 Nexus 均指向 `v2.4.13-beta.14`，三平台首选资产可通过用户下载链路取得。
- GitHub 与 Nexus 下载得到的三平台资产 SHA-256 一致；macOS arm64 ZIP 的本地下载摘要与 manifest/GitHub digest 一致。
- 下载后的 macOS 包版本、arm64 Mach-O 架构、主程序可执行权限与隔离 profile packaged runtime 已完成验证；Settings、File Index diagnostics 与相关审计字段可见。

## 已知限制

- 该已发布版本的 manifest 仍不满足最终 release gate：Linux AppImage/deb 重复占用 `linux/x64`，workflow 前缀文件名不被当时的 validator 接受。
- GitHub/Nexus 资产没有 detached `.sig`/`.asc` sidecar，Nexus signing-key endpoint 未配置公钥，因此更新包签名链未闭环。
- macOS 包为 ad-hoc 签名且没有 TeamIdentifier；Gatekeeper 原生可信链未通过。运行时 smoke 通过不等同于该发布可被标记为完整可信。
- 以上限制需要后续重新构建并发布新 tag；不会就地替换 `v2.4.13-beta.14` 的已发布二进制。
