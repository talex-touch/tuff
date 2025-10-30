# PRD 整理报告

> 整理时间: 2025-10-30  
> 执行人: Claude AI

## 📦 整理概况

### 文件移动
- ✅ 将 `apps/core-app/plan-prd/*` 的 3 个 PRD 移动到根目录 `plan-prd/`
- ✅ 将根目录的 `CALENDAR-PRD.md` 和 `plan.md` 移动到 `plan-prd/`
- ✅ 删除空目录 `apps/core-app/plan-prd/`

### 文件删除
- ✅ 删除已完成的 PRD: `deprecate-extract-icon-prd.md`
- ✅ 删除重复文件: `division-box-plan.md`
- ✅ 删除过时索引: `prd.md`

### 文件精简
精简了以下过于详细的 PRD (保留核心内容,删除冗余实现细节):

| 文件 | 原大小 | 新大小 | 精简比例 |
|-----|--------|--------|---------|
| tray-system-optimization-prd.md | 34KB | 5.0KB | 85% |
| download-center-prd.md | 25KB | 5.5KB | 78% |
| app-update-system-prd.md | 15KB | 4.8KB | 68% |
| module-logging-system-prd.md | 20KB | 5.3KB | 73% |
| CALENDAR-PRD.md | 16KB | 4.5KB | 72% |

**总节省空间**: 约 95KB (从 110KB 精简到 25KB)

## 📊 最终状态

### 当前 PRD 清单
```
plan-prd/
├── README.md                           # 新增: PRD 索引和说明
├── CALENDAR-PRD.md                    # 日历插件
├── ai-power-generic-api-prd.md        # AI 泛化接口
├── app-update-system-prd.md           # 应用更新系统 ⚡精简
├── attach-view-cache-prd.md           # AttachView 缓存
├── division-box-prd.md                # DivisionBox 深化
├── download-center-prd.md             # 下载中心 ⚡精简
├── flow-transfer-prd.md               # Flow Transfer 流转
├── module-logging-system-prd.md       # 模块日志系统 ⚡精简
├── multi-attach-view-prd.md           # 多视图并行
├── plan.md                            # 文字选中工具条
├── platform-capabilities-prd.md       # 平台能力建设
├── plugin-loading-refactor.md         # 插件加载重构
├── search-usage-data-cleanup-plan.md  # 搜索数据清理
├── tray-system-optimization-prd.md    # 托盘系统优化 ⚡精简
└── view-mode-prd.md                   # View Mode 增强
```

**统计**:
- 总文件数: 16 个 (15 个 PRD + 1 个 README)
- 未完成 PRD: 15 个
- 已完成 PRD: 0 个 (已删除)

## 🎯 精简原则

1. **保留核心内容**
   - 背景与目标
   - 功能需求概述
   - 关键技术设计
   - 实施计划

2. **删除冗余部分**
   - 过于详细的代码实现
   - 重复的 UI 设计细节
   - 冗长的配置示例
   - 详细的测试用例

3. **优化结构**
   - 使用表格简化信息
   - 精简文字描述
   - 保留关键架构图
   - 统一格式风格

## ✅ 改进效果

### 可读性提升
- 每个 PRD 从 1000+ 行精简到 200-400 行
- 核心信息更突出
- 章节结构更清晰

### 维护性提升
- 统一目录结构
- 清晰的优先级分类
- 完整的索引文档

### 实用性提升
- 快速了解需求
- 聚焦关键技术
- 明确实施步骤

## 📝 后续建议

1. **定期维护**
   - 每完成一个 PRD,及时删除或标记为"已完成"
   - 每月回顾 PRD 优先级,调整开发计划

2. **版本控制**
   - PRD 有重大修改时,更新版本号
   - 保留变更日志

3. **文档同步**
   - PRD 完成后,同步更新 CLAUDE.md
   - 更新项目 README 的功能列表

## 🎉 总结

本次整理达成目标:
- ✅ 所有 PRD 集中到 `plan-prd/` 目录
- ✅ 删除已完成和重复的 PRD
- ✅ 精简冗长的 PRD,保留核心内容
- ✅ 创建清晰的索引和分类
- ✅ 项目文档更加清晰和易于维护

下一步行动:
1. Review `plan-prd/README.md` 中的优先级排序
2. 根据团队资源调整开发计划
3. 开始执行 P0 级别的 PRD

