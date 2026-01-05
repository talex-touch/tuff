# Nexus x TuffexUI 样式冲突记录

## 原则
- 视觉优先级：Nexus 现有视觉为准，TuffexUI 做适配。
- 处理方式：以封装层修正为主（`apps/nexus/app/components/ui/`），避免页面直改。
- 记录要求：每次冲突必须记录影响范围、复现路径、修复位置与回归项。
- 兼容策略：按钮/输入/Drawer/Modal/Switch 以 Tuffex 为参考基准，其余保持 Nexus 视觉。

## 冲突清单（持续维护）
| 区域/组件 | 冲突描述 | 复现路径 | 处理方式 | 修复位置 | 状态 |
| --- | --- | --- | --- | --- | --- |
| Button/FlatButton | 待确认 | 待确认 | Nexus 视觉优先 | 待确认 | pending |
| Input/SearchInput | 待确认 | 待确认 | Nexus 视觉优先 | 待确认 | pending |
| Drawer/Modal | 待确认 | 待确认 | Nexus 视觉优先 | 待确认 | pending |
| Toast | 待确认 | 待确认 | Nexus 视觉优先 | 待确认 | pending |
| Tag/Badge/StatusBadge | 待确认 | 待确认 | Nexus 视觉优先 | 待确认 | pending |
| Switch | 待确认 | 待确认 | Nexus 视觉优先 | 待确认 | pending |
| Typography/Color/Radius | 待确认 | 待确认 | Nexus 视觉优先 | 待确认 | pending |
| z-index/Overlay | 待确认 | 待确认 | Nexus 视觉优先 | 待确认 | pending |

## 备注
- 若出现全局样式冲突，优先记录到该表并在封装层做局部修复。
- 修复后需要补充回归检查项（焦点/滚动锁定/遮罩层级/暗色模式）。
