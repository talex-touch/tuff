# Tuff v2.4.10-beta.22 更新说明

## 本次更新

- 合入最新 `master` 的插件 Widget 构建与注册链路改进，补齐 builder widget 导出测试和运行时回归。
- 修复 tuff-cli SDK marker hard-cut 口径：`260421` 不再作为支持 marker，CoreApp runtime gate、`tuff validate` 与共享 SDK allowlist 保持一致。
- 补齐 CLI Package CI 触发范围与 `@vue/compiler-sfc` 可选外部依赖配置，避免 SDK 兼容性或 Vue SFC 可选模板能力改动漏跑。
- 归档跨平台兼容与占位实现深度复核，明确 `2.4.11` 后续风险，不扩大为当前 `2.4.10` 正式 gate blocker。
- 延续 beta.21 的 OmniPanel、Utils transport boundary、插件 lint/test 和 macOS beta build 准备结果。

## 已知限制

- 该版本仍是 beta 测试包，不代表 `2.4.10` 正式发布 gate 已完成。
- Windows 真机 acceptance、性能采样和 Nexus Release Evidence 写入仍是正式发布阻塞项。
