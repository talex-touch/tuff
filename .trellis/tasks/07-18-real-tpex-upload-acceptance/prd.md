# 验证真实 TPEX 上传

## Goal

使用真实 `tuff` CLI、真实部署的 Nexus API、真实 D1/R2（或部署环境声明的等价持久层）完成一个可追踪 `.tpex` 上传、审核/受控展示、下载和 CoreApp 安装闭环，明确排除 mock、dry-run 与 memory fallback。

## Prerequisites

- Package Policy、Security Scan、签名信任链和 Nexus 展示门禁已在目标环境部署。
- 使用专用验收 plugin/version/channel 和最小 `plugin:read` + `plugin:publish` 凭据；凭据只从运行环境读取。
- 目标环境、清理策略和是否允许公开 RELEASE 在执行前由操作者明确；默认使用可隔离的 deployed preview/BETA。

## Requirements

1. 从 canonical source clean build 一个唯一版本的真实 `.tpex`，记录 source revision、artifact SHA-256、Manifest identity/version 和签名 key id。
2. 先运行 `tuff validate --strict`、build audit 与 `tuff publish --dry-run`，再通过同一 CLI 发起非 dry-run 上传。
3. 记录真实 HTTP request id、Nexus plugin/version id、D1 row identity、R2 object key/size/digest、policy/scan/signature/admission 状态；不得记录 token/cookie。
4. 从 Nexus 下载接口重新取回对象，验证 bytes/digest 与上传 artifact 完全一致。
5. 在隔离 CoreApp profile 中通过官方 TPEX provider 安装取回包，验证 identity/version、启动 preflight 和最小可见功能。
6. 验收后按预先声明策略保留受控 evidence 版本或删除测试版本/object；清理动作同样进入审计证据。

## Acceptance Criteria

- [ ] 证据明确证明请求命中 deployed Nexus、D1 和 R2/等价真实持久层，不是 local-only 或 memory fallback。
- [ ] CLI 非 dry-run 上传成功，返回的 version id 与 D1 row、R2 object 和 timeline 一致。
- [ ] 下载 bytes SHA-256 与本地构建 artifact、scan、signature 和 Nexus version 记录完全一致。
- [ ] 未审核版本不公开；完成目标环境所需审核后，版本仅在允许频道可见并可下载。
- [ ] 隔离 CoreApp profile 安装并加载同一 identity/version，安装日志不包含 token、绝对私密路径或包内容。
- [ ] 重复上传同 version/channel 被幂等拒绝且不产生孤儿对象；失败/清理路径无 orphan D1/R2 数据。
- [ ] 真实验收 manifest/checklist 通过严格 verifier；mock/dry-run 结果仅作为前置，不计完成。

## Out of Scope

- 使用个人主插件或不可清理的生产版本做试验。
- 在仓库中保存 API key、JWT、cookie 或完整响应日志。
- 把一次真实上传替代持续 CI 门禁。

