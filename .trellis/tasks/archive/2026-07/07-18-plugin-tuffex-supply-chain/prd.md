# 插件发布与 TuffEx 供应链

## Goal

建立从插件源码、`.tpex` 构建、包策略与安全扫描，到 Nexus 审核展示、真实上传、签名验真和发布证据的单一可审计供应链；任何公开可见或可安装的插件版本都必须能追溯到同一份不可变包摘要。

## Background

- `packages/tuff-cli-core` 已拥有 Manifest 校验、构建与发布客户端，但 `packages/unplugin-export-plugin` 仍保留重复 exporter 和弃用 CLI 转发入口。
- Nexus 已校验 `.tpex` 后缀、30 MB 上限和 `manifest._files/_signature` 内容完整性，但尚无统一 package policy、安全扫描结果、签名信任状态与公开展示资格的组合门禁。
- CoreApp 当前校验下载包 SHA-256；该摘要证明传输一致性，不等于发布者身份或 Nexus 审核签名。
- 本父任务只负责任务边界、依赖顺序和最终集成验收；实现由八个子任务分别完成。

## Requirements

1. **Package Policy**：定义跨 CLI 与 Nexus 共用的 Manifest、归档、文件清单、版本和包大小规则，并以稳定违规代码失败。
2. **Security Scan**：对同一不可变包执行可复现扫描，输出分级、可审计且不泄露源码或秘密的报告。
3. **源码包构建/测试/审计**：从仓库 canonical plugin source 完成 clean build、插件自有质量门禁和最终 `.tpex` 清单审计。
4. **Nexus 展示门禁**：只有 package policy、scan、签名、人工审核和可取回 artifact 全部满足时，版本才可进入相应公开频道。
5. **真实 `.tpex` 上传**：通过真实 Nexus 部署与真实对象存储/数据库链路上传、取回并安装一个可识别的验收版本。
6. **签名信任链**：用非对称签名、key id、信任根、轮换和撤销替代“哈希即签名”的混合语义；私钥不得进入包或仓库。
7. **发布证据**：用严格 verifier 绑定 source revision、artifact digest、policy/scan/signature/admission/listing/install 结果。
8. **CLI shim 退场**：保留 `unplugin-export-plugin` 的 Vite 插件职责，删除重复 exporter、弃用 CLI 转发和 `tuffcli` 兼容入口，`tuff` 成为唯一命令面。

## Delivery Order

1. Package Policy 是 Security Scan、Nexus 展示门禁和真实上传的前置契约。
2. Security Scan 与签名信任链可在 policy 稳定后并行；源码包审计消费三者的构建侧输出。
3. Nexus 展示门禁消费 policy、scan、signature 的持久化判定。
4. 真实上传在 Nexus 门禁可执行后进行；发布证据绑定真实上传结果。
5. CLI shim 最后退场，确保所有调用者先切到 canonical CLI core。

## Acceptance Criteria

- [x] 八个子任务均通过各自验收并标记完成，父任务树为 8/8。
- [x] 同一 `.tpex` SHA-256 贯穿构建报告、扫描报告、签名载荷、Nexus version 记录、下载响应和 CoreApp 安装证据。
- [x] 未通过 policy、scan、签名或人工审核的版本无法进入公开 Store 列表、详情、版本列表或下载接口。
- [x] 一次真实部署上传可从 CLI 请求追踪到 Nexus D1/R2 记录、公开/受控展示和 CoreApp 安装结果。
- [x] 旧 exporter/CLI shim 不再有运行时调用者、bin 入口或文档示例；Vite 插件能力不受影响。
- [x] 严格证据 verifier 退出 0，且报告明确区分 focused、local、preview/deployed 与真实发布证据。

## Out of Scope

- CoreApp OTA/桌面应用签名与更新发布链路。
- TuffEx Vue 组件 npm 发布流程。
- 自动批准未知第三方插件；人工审核仍是公开发布的独立条件。
- 在规划阶段执行真实上传、密钥生成、功能实现或提交。

