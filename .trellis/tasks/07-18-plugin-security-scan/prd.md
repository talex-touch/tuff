# 实施插件 Security Scan

## Goal

对通过 Package Policy 的不可变 `.tpex` 执行确定性、分级、可复核的安全扫描；高风险结果必须阻断 Nexus 审核与公开展示，同时扫描报告不得成为源码或秘密泄露通道。

## Confirmed Facts

- Nexus publish 已有 upload governance、integrity failure 分类与 pending review 状态，但没有 package-level scan result。
- Widget package/runtime 已有精确模块 allowlist 和动态执行边界；插件 Manifest 也已有 SDK/permission registry，可作为扫描规则来源。
- 当前 `.tpex` 是 tar-like archive，包含 Manifest、compiled JS/UI assets、README 和 `_files` 内容摘要。

## Requirements

1. 扫描输入由 artifact SHA-256、policy-normalized Manifest 和只读 package inventory 标识；扫描期间不得修改归档。
2. 建立 versioned rule set，至少覆盖：危险归档条目、秘密/私钥材料、禁止的生产 dev endpoint、未声明的高风险能力引用、raw transport/Electron escape、危险动态执行标记、native executable/addon 和 Manifest 权限/实际能力不一致。
3. 结果包含 `scannerVersion`、`ruleSetVersion`、artifact digest、开始/结束时间、findings、severity、stable code、evidence location 摘要和最终 decision。
4. Critical/High 默认 fail closed；Medium/Low 进入人工审核上下文。规则豁免必须有 owner、reason、expiry 和审计记录，不能由插件包自声明。
5. CLI 提供本地同规则预检；Nexus 在发布版本进入 pending review 前执行 server-side authoritative scan，并持久化结果摘要。
6. 报告仅记录文件相对路径、规则和哈希/行列范围；不得记录 secret value、完整源码、token、私钥或用户目录。
7. 扫描超时、引擎异常或规则加载失败均为 `scan-unavailable`，不得降级成 pass。

## Acceptance Criteria

- [ ] clean official `.tpex` 生成 `passed` 报告，digest 与 package policy 输出一致。
- [ ] secret fixture、raw Electron/transport fixture、未声明高风险能力和 native binary fixture 产生预期稳定 finding code。
- [ ] Critical/High、timeout 和 scanner exception 均阻止版本进入可审核/可展示状态；无 package/version 半写入。
- [ ] CLI 与 Nexus 使用同一 rule set，对同一 fixture 产生相同核心 findings。
- [ ] 豁免过期或缺 owner/reason 时无效；有效豁免仍保留原 finding 与审计元数据。
- [ ] 输出经过 secret leakage 回归，报告中不存在 fixture secret 原文或完整源码。
- [ ] focused scanner、Nexus integration、lint/typecheck 通过。

## Out of Scope

- 保证发现所有恶意行为或替代人工代码审查。
- 运行未知插件代码进行动态沙箱分析。
- 发布者身份签名与信任根管理。
- 真实部署上传证据。

