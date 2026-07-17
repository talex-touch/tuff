# Tuff v2.4.13-beta.14

## 中文摘要

- 本次发版未检测到可展示的 merged PR；请查看下方资产与 Nexus 发布记录。

## English Summary

- No displayable merged pull requests were detected for this release; see assets and Nexus release records below.

## Merged Pull Requests

<details><summary>0 PR(s), range v2.4.13-beta.11...v2.4.13-beta.14</summary>

- No merged pull requests were detected for this release range.

</details>

## Release Notes

- Full bilingual notes are synced to Nexus through `notes` / `notesHtml`.
- Generated source files: `update_2.4.13-beta.14.zh.md`, `update_2.4.13-beta.14.en.md`.

## Notes Preview

<details><summary>中文 / English</summary>

### 中文

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

## 已合并 PR

- 本次发版区间未检测到可展示的 merged PR。

## 已验证

- GitHub Actions Build and Release 矩阵构建成功后才会创建该 Release。
- Nexus release sync 会消费同一份中英文 notes payload。

## 已知限制

- 具体平台验证、签名和发布证据仍以当前版本的 Release Evidence 与发布清单为准。

### English

## Highlights

- Pinned the packaged CoreApp executable name to `tuff`, preventing Linux AppImage and other targets from deriving invalid or inconsistent entry names from the scoped workspace package name.
- Preserved the real beta release identity so the Windows setup installer and `latest.yml` no longer rewrite `-beta.N` versions to `-SNAPSHOT.N`.
- Added version and architecture to the postprocessed macOS app ZIP name, allowing the release manifest and Nexus to identify the Apple Silicon package as `darwin/arm64` instead of falling back to x64.
- Kept the preferred download matrix aligned with the actual outputs: Windows x64 setup, macOS arm64 app ZIP, and Linux x64 AppImage.

## Validation

- GitHub Release and Nexus both resolve to `v2.4.13-beta.14`, and the three preferred platform assets are downloadable through the user-facing paths.
- GitHub and Nexus downloads produce identical SHA-256 values for all three preferred assets; the downloaded macOS arm64 ZIP also matches the manifest and GitHub digest.
- The downloaded macOS bundle version, arm64 Mach-O architecture, executable mode, and isolated-profile packaged runtime were verified; Settings, File Index diagnostics, and the required audit fields were visible.

## Known Limitations

- The published manifest does not satisfy the final release gate: Linux AppImage and deb entries duplicate `linux/x64`, and the workflow-prefixed filenames were rejected by the validator used for this release.
- GitHub and Nexus assets have no detached `.sig`/`.asc` sidecars, and the Nexus signing-key endpoint has no configured public key, so the update signature chain is incomplete.
- The macOS bundle is ad-hoc signed and has no TeamIdentifier; the native Gatekeeper trust chain did not pass. A passing runtime smoke does not make this release fully trusted.
- These limitations require a newly built and newly tagged release; the already-published `v2.4.13-beta.14` binaries will not be replaced in place.

## Merged Pull Requests

- No merged pull requests were detected for this release range.

## Validation

- GitHub Actions creates this release only after the Build and Release matrix succeeds.
- Nexus release sync consumes the same bilingual notes payload.

## Known Limitations

- Platform validation, signing status, and release evidence remain governed by the release evidence and asset checklist for this version.

</details>

## Download Based on Your Device

| OS | Download |
| --- | --- |
| Android | APK ARMv8<br>APK ARMv7<br>APK x64 (planned) |
| iOS | IPA Unsigned (planned) |
| macOS | [ZIP Apple Silicon](https://tuff.tagzxia.com/updates) |
| Windows | [Setup x64](https://tuff.tagzxia.com/updates) |
| Linux | [AppImage x64](https://tuff.tagzxia.com/updates)<br>[DEB x64](https://github.com/talex-touch/tuff/releases) |

> Desktop downloads follow the actual GitHub Release / Nexus Updates assets; mobile packages will open after their build pipelines are shipped.
