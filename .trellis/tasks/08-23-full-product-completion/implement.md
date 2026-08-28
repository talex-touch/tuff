# 实施计划

## 1. 建立可信基线

- 修复 TPEX Token 同源与重定向边界，补直接回归测试。
- 修复 Clipboard 测试未处理异常假绿，确保 stderr 和退出码可信。
- 运行修改路径的 lint、typecheck、focused tests、Utils build 与插件清单验证。

## 2. 发布与 OTA

- 将确定性质量作业接入 master required checks，并使 release 依赖同 SHA 门禁。
- 核对三平台、架构、签名、公证、更新清单和 release notes。
- 完成 macOS 官方签名 N/N+1 单击替换、重启与 health ack；补 Windows/Linux 真实宿主证据。

## 3. AI、权限与沙盒

- 从用户可见入口执行真实 Provider 文本/流式/工具调用。
- 验证无 Provider、配额耗尽、模型不支持、权限拒绝和超时的固定失败路径。
- 复核插件、AI 工具、窗口、网络、文件、剪贴板的 authoritative identity 与 fail-closed 沙盒。

## 4. 数据与计费

- 盘点 manifest、同步、遥测、usage 与 billing 事实源和传输链。
- 验证幂等、重试、离线、删除、隐私披露、保留期和账单核对。

## 5. 官网矩阵与插件 SDK

- 抽取官网承诺并建立代码/证据矩阵，逐项实现或明确 unavailable。
- 按官方插件逐个升级 SDK，执行构建、包策略、安装、权限、主题和功能 smoke。

## 6. 最终集成

- 执行全量质量门禁、三平台 CI、打包与发布候选烟测。
- 同步 README、ROADMAP、CHANGES、release notes 与 Trellis 状态。
- 只在所有验收项具备证据后归档父任务。
