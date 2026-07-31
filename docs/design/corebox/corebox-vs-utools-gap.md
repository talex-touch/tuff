# CoreBox vs uTools 差距对比清单

生成日期：2026-01-31  
范围说明：
- CoreBox 以本仓库现有实现与文档为准
- uTools 以官方帮助中心 / 开发者文档 / 官网公开说明为准

## 摘要（高优先级差距）

1) 入口形态：CoreBox 以全局快捷键搜索框为主；uTools 还提供超级面板（基于选中内容的右键/快捷触发）、悬浮入口与语音输入入口。  
2) 插件生态与分发：CoreBox 未见规模化市场与插件数量指标；uTools 提供插件市场并宣称 2000+ 插件。  
3) 插件运行形态：CoreBox 采用 Manifest/Prelude/Surface 三层与 CoreBox/DivisionBox 附着式 UI；uTools 支持无界面插件（window.exports）与独立窗口、并可回到搜索面板显示。  
4) 搜索面板体验：CoreBox 支持 list/grid、provider 优先级与输入类型筛选；uTools 提供「聚合/列表」模式切换、自动粘贴等体验项。  
5) 开发者商业化能力：CoreBox 主要为内部 AccountSDK；uTools 提供服务端 API 对接用户/支付等能力。  

## 维度对比

| 维度 | CoreBox（当前） | uTools（官方） | 差距/机会 |
| --- | --- | --- | --- |
| 入口/触发 | 以快捷键唤起搜索为核心入口 | 搜索框 + 超级面板（选中内容触发）+ 语音入口 | 入口多样性不足，选中内容触发的上下文入口缺失 |
| 搜索面板/结果布局 | list/grid 容器布局；provider 优先级 fast/deferred；按输入类型筛 provider | 聚合/列表模式；对近期使用/历史等有可见入口 | 体验层面缺少模式开关与“最近/历史”显性控制 |
| 上下文输入 | 支持 text/image/files/html 多类型输入 | 超级面板对文本/图片/文件等内容匹配 | 入口侧缺少“选中即触发”的上下文流 |
| 插件模型 | Manifest/Prelude/Surface；UI 主要附着在 CoreBox/DivisionBox（部分能力仍为规划） | plugin.json + HTML UI；支持无界面插件与独立窗口 | UI 形态与无界面运行能力需要进一步完善 |
| 插件分发/生态 | 目前仓库侧文档未体现市场与规模 | 官方插件市场，规模化插件供给 | 生态分发与审核/推荐体系是明显短板 |
| 平台与性能 | Windows 集成 Everything 提供超快文件搜索；macOS/Linux 为自建索引 | 官方强调跨平台体验与效率 | 性能层面差距不大，但体验对齐需补入口与交互 |
| 开发者商业化 | 内部账号与权限体系为主 | 官方服务端 API、支付对接 | 商业化能力需外放与文档化 |

## CoreBox 现有能力依据（仓库内）

- CoreBox 输入类型与查询结构：`packages/utils/core-box/tuff/tuff-dsl.ts`  
- Provider 优先级 fast/deferred 与 expectedDuration：`packages/utils/core-box/tuff/tuff-dsl.ts`  
- Windows Everything 集成与“fast”搜索层：`docs/everything-integration.md`  
- CoreBox/DivisionBox 规划项与未实现功能：`docs/plan-prd/05-archive/codebase_analysis.md.resolved`  
- 剪贴板输入与 CoreBox 交互说明：`docs/clipboard-mechanism-analysis.md`  

## uTools 官方资料来源（建议复核）

- 帮助中心 / 功能说明：https://u.tools/docs/  
- 插件开发文档：https://u.tools/docs/plugin/  
- 服务端 API 文档：https://u.tools/docs/developer/server-api/  
- 官网与插件市场入口：https://u.tools/  

## 备注

本对比清单为“差距视角”快速梳理，未覆盖所有功能细节。建议后续按「入口体验」「插件生态」「开发者能力」三条主线拆分子任务进行逐项对齐。
