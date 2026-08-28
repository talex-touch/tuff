# Tuff 全链路完成与真实验收

## Goal

以可重复证据收口发布、OTA、AI、数据链路、权限沙盒、官网功能矩阵与插件 SDK，并完成最终集成验收。

## Confirmed Facts

- 当前真实版本为 `2.4.14-beta.14`，三平台已存在签名发布产物，但 `master` 未启用 required status checks。
- CoreApp、Nexus、TuffEx、插件运行时和官方插件已有较宽的 Beta 能力面；当前主要缺口是可信门禁、真机证据和跨模块完成定义。
- Trellis 在本任务创建前有 83 个活跃任务，其中 47 个标记为 `in_progress`；任务勾选不能单独作为产品完成证据。
- 当前未提交批次横跨 CoreBox、插件安装、SDK、主题和 Nexus，必须保留用户已有改动并按风险分层验证。
- 已确认首要阻断项是 TPEX 安装链自动向非 Nexus 地址携带登录 Token，以及 Clipboard 测试吞掉未处理异常后假绿。

## Requirements

- R1：所有“已完成”结论必须同时具备代码、自动化验证和对应运行环境证据；跳过、软降级或被吞掉的异常不得计为通过。
- R2：先关闭安全与测试可信度，再依次推进发布/OTA、AI 权限沙盒、数据与计费、官网矩阵与插件 SDK；不得用新增功能掩盖门禁缺口。
- R3：CI/CD 必须对同一 SHA 建立不可绕过的质量依赖，发布产物、签名、公证、更新清单与 OTA 目标必须可追溯。
- R4：AI 验收必须覆盖真实 Provider 调用、流式结果、工具确认、配额/权限/模型失败路径和敏感数据生命周期。
- R5：清单、数据链路、埋点与计费必须拥有明确事实源、幂等边界、隐私披露、清理入口和可核对账目。
- R6：插件权限和沙盒必须 fail-closed；Token、API Key 与用户隐私数据不得进入普通存储、日志、跨域请求或验收产物。
- R7：官网能力矩阵必须映射到代码 owner、平台支持、稳定级别和可执行 smoke；未实现能力明确标为 unavailable，不得伪成功。
- R8：官方插件逐个升级当前 SDK，保持 manifest、package、构建产物和 Nexus 元数据一致，并验证安装、授权、Light/Dark 与核心功能。
- R9：不覆盖、回退或清理无法确认归属的现有工作区改动；不把 `.dsh-plugin-hub-*` 临时产物纳入交付。

## Acceptance Criteria

- [ ] `08-23-plugin-install-security-hardening` 完成，凭据边界与测试进程可信。
- [ ] `08-23-release-cicd-ota-acceptance` 完成，三平台 CI/CD、签名产物和 OTA 具备真实证据。
- [ ] `08-23-ai-permission-sandbox-acceptance` 完成，真实 AI、工具、权限与沙盒闭环通过。
- [ ] `08-23-data-telemetry-billing-acceptance` 完成，数据、埋点、隐私与计费闭环通过。
- [ ] `08-23-product-matrix-plugin-sdk-acceptance` 完成，官网矩阵与插件 SDK 升级逐项验收。
- [ ] 当前版本的 lint、typecheck、focused/full tests、构建、打包与 smoke 按平台全部通过且无未处理异常。
- [ ] README、ROADMAP、CHANGES、发布说明和 Trellis 账本与真实版本、稳定级别、证据状态一致。
- [ ] 最终发布候选没有未解释的 P0/P1 缺陷，也没有依靠 skip、fallback 或软缺失得到的绿色结果。

## Out of Scope

- 在首个可信质量基线建立前，不扩展移动端、日历推荐、完整截图套件等新产品方向。
- 不绕过 Nexus 审核、签名、权限或生产数据边界来制造验收结果。
