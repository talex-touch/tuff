# 产出插件发布证据

## Goal

建立机器可验证的插件发布 evidence contract，将源码、构建、policy、scan、签名、Nexus admission/展示、真实下载和 CoreApp 安装绑定到同一 artifact digest，防止用 focused、mock 或旧证据冒充真实发布完成。

## Requirements

1. 新增 versioned evidence manifest、checklist、summary 和 strict verifier；manifest 是事实 SoT，README/摘要不得单独改写状态。
2. Evidence 至少绑定 source revision、plugin identity/version/channel、artifact SHA-256、build audit id、policy/scan/signature result、Nexus plugin/version/request/object ids、展示 URL/状态、download digest 和 install profile/result。
3. 每个证据项声明 level：`focused`、`controlled`、`packaged`、`deployed`、`real-upload`；只有 acceptance 指定等级可关闭对应条目。
4. verifier 校验 schema、必需字段、状态、时间顺序、artifact 文件存在、digest 交叉一致、唯一 identity/version、引用路径和敏感信息卫生。
5. 可提交目录只保留摘要、manifest/checklist、strict 输出与必要截图/JSON；原始日志、HAR、profile、token-bearing response 放 ignored `raw/`/`_local/` 或不保存。
6. 失败或 blocker 必须原样标为 failed/blocked，并记录下一步；不得把 unavailable production credential 改写为 pass。

## Acceptance Criteria

- [ ] strict verifier 对完整真实链路退出 0，并输出每项 level、artifact digest 与验收映射。
- [ ] 任一 digest、identity/version、Nexus object id、签名 key id、scan decision 或安装结果不一致时退出非 0。
- [ ] 缺真实上传/下载/安装 artifact 时，focused 或 dry-run 证据不能关闭 real-upload 条目。
- [ ] verifier 拒绝绝对用户路径、token/cookie/private key、完整源码/日志和未声明文件引用。
- [ ] evidence manifest/checklist/summary 状态一致，所有引用文件存在且 JSON 可解析。
- [ ] 报告明确记录目标环境及 `live/d1/r2/memory/local-only` 边界，memory fallback 不得标为 deployed。
- [ ] focused verifier tests、证据自验证和 `git diff --check` 通过。

## Out of Scope

- 提交原始用户数据、完整网络抓包或运行 profile。
- 用文档断言替代真实上传与安装。
- 维护第二套全局优先级或完成状态；Trellis 仍是任务状态 SoT。

