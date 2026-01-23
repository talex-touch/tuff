---
mode: plan
cwd: /Users/talexdreamsoul/Workspace/Projects/talex-touch
task: 文件系统/搜索范围权限收敛（默认不含用户目录，可授权）
complexity: medium
planning_method: builtin
created_at: 2026-01-22T10:00:00+08:00
---

# Plan: 文件系统/搜索范围权限收敛

🎯 任务概述  
当前文件搜索默认覆盖用户目录（Documents/Downloads/Desktop 等），与“最小权限”原则不一致。目标是：
1) 默认仅允许 app 相关目录；2) 用户目录需显式授权；3) 处理 macOS/Windows 差异与 fallback；
4) 统一设置入口、过滤逻辑与文档/测试口径。

📋 执行计划
1. 现状盘点：梳理 FileProvider/EverythingProvider 的默认扫描/过滤路径、索引/搜索入口与 fallback 行为。
2. 方案评估：对比 3 种范围模型（全量/白名单/用户自选），明确默认口径与授权流程。
3. 目录口径：定义“app 相关目录”集合与扩展规则（appData/config/plugins/workspace）。
4. 授权与配置：确定授权存储（设置 + 记录时间/来源），提供可撤销机制。
5. 平台实现：
   - Windows：Everything 查询结果路径过滤 + 无 Everything 时 FileProvider 过滤。
   - macOS/Linux：FileProvider 白名单扫描 + 已授权目录合并。
6. 兼容与迁移：处理历史索引/缓存结果，避免旧数据泄漏（必要时重建或清理）。
7. UI/交互：设置页增加“文件搜索范围”入口与授权说明，提示默认范围变更。
8. 测试与文档：补齐过滤单测、跨平台手测清单与文档更新。

✅ 方案草案（倾向方案 2）
- 方案 1（现状）：默认全量扫描用户目录，风险高，违背最小授权。
- 方案 2（推荐）：默认仅 app 相关目录；用户目录需显式授权；可追加自选目录。
- 方案 3：仅用户自选目录，初始体验较弱，需要强引导。

📁 默认目录建议（app 相关）
- `app.getPath('userData')` 下的 config/cache/plugins 等。
- 应用工作空间/素材目录（若存在配置项则纳入白名单）。
- 显式授权后：系统用户目录集合（Documents/Downloads/Desktop/Music/Pictures/Videos）。

🧭 平台差异关注点
- Windows：Everything 命中结果需二次过滤；path 过滤需兼容盘符与大小写差异。
- macOS：避免默认扫描用户目录，授权后再纳入；注意首次授权提示文案与撤销入口。
- Linux：按 FileProvider 白名单扫描，保持与 macOS 一致的配置口径。

⚠️ 风险与注意事项
- 默认缩小范围可能影响用户搜索体验，需要清晰提示与可一键授权。
- 旧索引/历史结果可能包含用户目录数据，需要清理或重建。
- Everything 不可用时的降级逻辑必须保持一致的权限过滤。

📎 参考
- `apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/everything-provider.ts`
- `apps/core-app/src/main/modules/box-tool/addon/files/constants.ts`
- `docs/plan-prd/03-features/search/WINDOWS-FILE-SEARCH-PRD.md`
