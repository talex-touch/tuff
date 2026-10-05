# Outcome

将本仓库默认工程工作流切换为 Comet Native，支持 omp、Claude Code 和 Codex。保留有效工程知识、未完成目标与真实验收证据，移除项目级 Trellis 执行依赖。

# Scope

- 安装固定版本 Comet 0.4.4，只初始化 `oh-my-pi`、`claude` 和 `codex` 三个项目级目标。
- 使用 `docs/comet/` 保存正式变更产物，中文、批量澄清、人工确认归档；本机 Runtime 不进入 Git。
- 将有效工程规范迁入 `docs/engineering/specs/`，活审计保存为独立工程报告。
- 为旧任务建立冻结索引和可恢复交接。保全原有未提交、未跟踪文档与证据，不自动宣告完成或转换全部历史任务。
- 将文档检查、审计真实性检查、ROADMAP 链接和工程脚本的真实依赖迁出旧任务路径，保留原有有效保护。
- 更新三平台入口与项目说明，移除项目级旧 workflow、hooks、commands、agents 和生命周期脚本。
- 实际验证三平台入口、写入守卫、状态恢复、工作区绑定、Spec 冲突及迁移相关检查。

# Non-goals

- 不修改产品功能、排序、索引或其他会话正在实现的功能。
- 不安装 Classic、OpenSpec、Superpowers、CodeGraph 或未批准的平台集成。
- 不变更已序列化的 `PluginAiSessionsPlatform` 的 `trellis` 值。
- 除已批准的本仓库 Codex 信任记录与两个 Comet Hook 审核，不改用户级平台配置、全局功能开关、模型或凭据；不提交、合并、推送、创建 PR 或发布版本。
- 不把旧 journal、JSONL 和历史任务树批量导入 Comet changes。

# Acceptance examples

- omp 新会话能够发现并调用项目 `/comet` 与 Native 规则，写入守卫在不允许的阶段阻止实现文件写入。
- Claude Code 新会话能够加载项目 Comet Skill、规则和可移植 hooks，旧 Trellis 注入已移除，原有本机权限配置保留。
- Codex 能发现 `.agents/skills` 的 Comet Skill、项目规则和 hooks；实际写入守卫结果与支持范围被验证并明确记录。
- 中断或本机 Runtime 缺失后，Native 从正式状态恢复正确进度，不把旧检查或缺失的独立验收当作通过。
- 工作区绑定不匹配会被拒绝；并行变更修改同一 capability 时，归档前暴露冲突，不覆盖正式 Spec。
- 迁移后的规范与活审计保留当前工程约束；所有旧活跃目标都有明确冻结去向，未提交或未跟踪任务文档和证据没有丢失。
- 在无 `.trellis/` 的工作区，审计未知任务、错误默认值、文档失效链接和缺少有效验收仍会失败；正常项目内容通过相关门禁。
- 默认项目入口只要求 Comet Native，三平台不存在活跃 Trellis hooks、生命周期脚本或失效知识入口。
- 产品数据兼容值与其他会话的产品改动保持不变；本机 Runtime、用户设置和日志不进入正式项目资产。

# Constraints and invariants

用户已确认此前六阶段迁移路线，并补充批准 omp、Claude Code 和 Codex。当前工作区存在其他会话的未提交工作，迁移基线为 `cfda0a6cd1a13b5606c82d7d9d68112177d3fc9d`。已经校验的本机快照位于 `/tmp/tuff-comet-migration-20261003-044547/`，切换前须再次保全后续写入。

旧任务冻结记录不是第二套活动任务系统。恢复真实目标时，读取交接证据，重新确认范围，再由 Native 创建独立变更。

# Verification expectations

使用真实 CLI 和平台入口检查，不把生成文件视为守卫生效证明。最终必要检查由 Runtime 执行；独立只读 Verifier 按全部验收项核对。远端 CI 未实际运行时明确报告，不用本机结果冒充远端通过。
