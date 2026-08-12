# 跨组件共性问题基线（机械核对，无需 agent 验证）

生成时间基准：git HEAD · 组件文档 118 组 · demo 文件 443 · 已注册 306

## 1. 孤儿 demo 文件（137 个）

`demos/` 下共 443 个 `.vue`，仅 306 个在 `demo-registry.ts` 注册。
以下 137 个（占 30%）从未被任何文档引用，属死代码：

- `AutoSizerButtonLoadingDemo` · `AutoSizerDialogDemo` · `AutoSizerDropdownDemo` · `AutoSizerHeightDemo`
- `AutoSizerNumberFlowDemo` · `AutoSizerTextTransformerDemo` · `AutoSizerWidthFlexDemo` · `AvatarAvatarDemo`
- `AvatarAvatarGroupDemo` · `AvatarVariantCard` · `AvatarVariantsGalleryDemo` · `CardActionsDemo`
- `CardBackgroundScrollDemo` · `CardBackgroundsDemo` · `CardCompositionsDemo` · `CardEmptyDemo`
- `CardModeDemo` · `CascaderBasicDemo` · `ContainerBasicDemo` · `ContextMenuBasicDemo`
- `DatePickerBasicDemo` · `DropdownMenuNavDemo` · `FlexBasicDemo` · `FusionAvatarBadgeDemo`
- `FusionBasicDemo` · `FusionButtonTooltipDemo` · `FusionChipIconDemo` · `FusionMiniCardFabDemo`
- `FusionTwoButtonsDemo` · `FusionTwoChipsDemo` · `FusionTwoIconButtonsDemo` · `FusionTwoOptionsDemo`
- `FusionTwoStatusDotsDemo` · `GlassSurfaceControlsDemo` · `GlowTextBasicDemo` · `GlowTextImageDemo`
- `GradualBlurAnimatedDemo` · `GradualBlurBasicDemo` · `GradualBlurResponsiveDemo` · `GridBasicDemo`
- `GroupBlockBasicDemo` · `ModalModalDialogDemo` · `NavBarBasicDemo` · `PickerBasicDemo`
- `PopoverVisualEffectsDemo` · `ProgressBarDebuggerDemo` · `ProgressBarFlowEffectsDemo` · `ProgressBarHeightsDemo`
- `ProgressBarIndeterminateVariantsDemo` · `ProgressBarIndicatorSparkleDemo` · `ProgressBarMaskBackgroundDemo` · `ProgressBarMaskVariantsDemo`
- `ProgressBarShowcaseDemo` · `RadioBasicDemo` · `RadioCardDemo` · `RadioDisabledDemo`
- `RadioGroupPlaygroundDemo` · `RadioIndicatorDemo` · `RadioStandardDemo` · `RatingRatingDemo`
- `ScrollBasicDemo` · `ScrollBounceScrollbarDemo` · `ScrollChainingDemo` · `ScrollHorizontalDemo`
- `ScrollNativeDemo` · `ScrollPullDownUpDemo` · `SearchInputBasicDemo` · `SearchInputRemoteDemo`
- `SearchSelectBasicDemo` · `SearchSelectRemoteDemo` · `SegmentedSliderBasicDemo` · `SegmentedSliderCustomDemo`
- `SliderBasicDemo` · `SliderDebugDemo` · `SliderDisabledDemo` · `SliderElasticTooltipCompareDemo`
- `SliderElasticTooltipDemo` · `SliderFormatValueDemo` · `SliderShowValueDemo` · `SpinnerBasicDemo`
- `SpinnerSizesDemo` · `SplitterBasicDemo` · `StackBasicDemo` · `StatCardBasicDemo`
- `StatCardStatCardDemo` · `StatusBadgeStatusRowDemo` · `StatusBadgeStatusSignalsDemo` · `TabBarBasicDemo`
- `TabsAutoSizeDemo` · `TabsAutoSwitchDemo` · `TabsBasicDemo` · `TabsDisableAnimDemo`
- `TabsDynamicContentDemo` · `TabsIndicatorShowcaseDemo` · `TabsPlacementDemo` · `TextTransformerBadgeDemo`
- `TextTransformerBasicDemo` · `TextTransformerLongTextDemo` · `TooltipHoverHintDemo` · `TooltipTooltipButtonDemo`
- `TooltipVisualEffectsDemo` · `TransitionContentDemo` · `TransitionListDemo` · `TreeSelectBasicDemo`
- `TuffDialogDemo` · `TuffDrawerDemo` · `TuffSelectDemo` · `TuffToastDemo`
- `TxBlankSlateDemo` · `TxBlockSwitchDemo` · `TxButtonDemo` · `TxCardItemDemo`
- `TxChatComposerDemo` · `TxChatListDemo` · `TxCheckboxDemo` · `TxCornerOverlayDemo`
- `TxDropdownMenuDemo` · `TxEmptyDemo` · `TxEmptyStateDemo` · `TxGlassSurfaceDemo`
- `TxGradientBorderDemo` · `TxGridLayoutDemo` · `TxGroupBlockDemo` · `TxImageGalleryDemo`
- `TxImageUploaderDemo` · `TxLoadingStateDemo` · `TxMarkdownViewDemo` · `TxNoDataDemo`
- `TxNoSelectionDemo` · `TxOfflineStateDemo` · `TxOutlineBorderDemo` · `TxPermissionStateDemo`
- `TxPopoverDemo` · `TxSearchEmptyDemo` · `TxSortableListDemo` · `TxTypingIndicatorDemo`
- `TypingIndicatorVariantsDemo`

## 2. frontmatter 不合规（23 个文档）

标尺：8 个字段全填 `title description category status since tags syncStatus verified`

| 组件 | zh 缺失字段 | zh 独有 | en 独有 |
|---|---|---|---|
| `agents` | status, since | — | — |
| `avatar-variants` | status, since, tags | — | — |
| `card-item` | status, since | — | — |
| `context-menu` | status, since, tags | — | — |
| `date-picker` | status, since, tags | — | — |
| `dropdown-menu` | status, since, tags | — | — |
| `glass-surface` | status, since, tags | — | — |
| `gradual-blur` | status, since | — | — |
| `index` | category, status, since, tags | — | — |
| `markdown-view` | status, since | — | — |
| `outline-border` | status, since | — | — |
| `picker` | status, since, tags | — | — |
| `rating` | status, since, tags | — | — |
| `scroll` | status, since, tags | — | — |
| `search-input` | status, since, tags | — | — |
| `splitter` | status, since | — | — |
| `stat-card` | status, since, tags | — | — |
| `tab-bar` | status, since | — | — |
| `tabs` | status, since, tags | — | — |
| `text-transformer` | status, since | — | — |
| `transition` | status, since | — | — |
| `tuff-logo-stroke` | status, since | — | — |
| `version-capsule` | status, since, tags | — | — |

## 3. 文档臃肿（14 个 > 400 行）

| 组件 | zh 行数 | 超标倍数（对标 150 行基准） |
|---|---|---|
| `card` | 1802 | 12.0x |
| `fusion` | 1513 | 10.1x |
| `avatar-variants` | 1014 | 6.8x |
| `slider` | 817 | 5.4x |
| `tabs` | 624 | 4.2x |
| `group-block` | 613 | 4.1x |
| `glass-surface` | 499 | 3.3x |
| `auto-sizer` | 482 | 3.2x |
| `text-transformer` | 470 | 3.1x |
| `index` | 466 | 3.1x |
| `select` | 440 | 2.9x |
| `container` | 428 | 2.9x |
| `base-anchor` | 427 | 2.8x |
| `context-menu` | 425 | 2.8x |

## 4. 非标准章节标题（118 个文档）

标准段：`Usage` / `Examples` / `API` / `Source`。以下文档用了自定义标题：

| 组件 | 非标准二级标题 |
|---|---|
| `agents` | `基础用法` · `交互契约` · `最佳实践` · `审阅说明` |
| `ai-elements` | `对话列表` · `交互契约` · `最佳实践` · `审阅说明` |
| `alert` | `基础用法` · `组合示例` · `交互契约` · `最佳实践` · `审阅说明` |
| `auto-sizer` | `基础用法` · `交互契约` · `最佳实践` · `审阅说明` |
| `avatar-variants` | `Gallery` · `审阅说明 / Review Notes` |
| `avatar` | `基础用法` · `交互契约` · `样式定制` · `最佳实践` · `审阅说明` |
| `badge` | `基础用法` · `组合示例` · `交互契约` · `最佳实践` · `审阅说明` |
| `base-anchor` | `基础用法` · `位移动画` · `方向` · `动画模式` · `Drip 液滴下坠` · `Bead 张力收腰` …等 11 个 |
| `base-surface` | `与 TxCard 的关系` · `背景模式` · `底层参数实验（Advanced）` · `Fake 伪元素模式` · `运动降级` · `原生 vs BaseSurface 对比` …等 9 个 |
| `blank-slate` | `基础用法` · `交互契约` · `最佳实践` · `审阅说明` |
| `breadcrumb` | `基础用法` · `组合示例` · `交互契约` · `最佳实践` · `审阅说明` |
| `button` | `Composition Notes` · `交互契约` · `最佳实践` · `审阅说明` |
| `card-item` | `基础用法` · `交互契约` · `最佳实践` · `审阅说明` |
| `card` | `基础用法` · `惯性跟随回弹（inertial）` · `带标题的卡片` · `带操作按钮的卡片` · `卡片变体` · `不同背景下的效果（refraction / glass / blur）` …等 16 个 |
| `cascader` | `基础用法` · `发布策略配置` · `注意事项` · `最佳实践` · `审阅说明` |
| `chat-composer` | `基础用法` · `交互契约` · `最佳实践` · `审阅说明` |
| `chat` | `基础用法` · `交互契约` · `相关组件` · `最佳实践` · `审阅说明` |
| `checkbox` | `基础用法` · `样式变体` · `文案在前` · `无文案` · `禁用状态` · `使用插槽` …等 8 个 |
| `code-editor` | `基础用法` · `Toolbar 插槽` · `交互契约` · `样式定制` · `最佳实践` · `审阅说明` |
| `collapse` | `基础用法` · `组合示例` · `交互契约` · `最佳实践` · `审阅说明` |
| `command-palette` | `启动器场景` · `体验要点` · `交互契约` · `最佳实践` · `审阅说明` |
| `container` | `基础用法` · `容器类型` · `容器间距` · `栅格系统` · `布局组合` · `交互契约` …等 10 个 |
| `context-menu` | `基础与组合场景` · `常见用法` · `最佳实践` · `审阅说明` |
| `copy-button` | `基础用法` · `交互契约` · `最佳实践` · `审阅说明` |
| `corner-overlay` | `基础用法` · `组合示例` · `交互契约` · `最佳实践` · `审阅说明` |
| `data-table` | `基础用法` · `行选择` · `排序交互` · `后台数据运维面板` · `最佳实践` · `审阅说明` |
| `date-picker` | `基础用法` · `交互契约` · `最佳实践` · `审阅说明` |
| `dialog` | `BottomDialog 底部对话框` · `BlowDialog 爆炸对话框` · `PopperDialog 弹出对话框` · `TouchTip 触控提示` · `自定义组件` · `渲染函数` …等 9 个 |
| `divider` | `基础用法` · `渐变分割` · `垂直分割` · `交互契约` · `最佳实践` · `审阅说明` |
| `drawer` | `基础用法` · `方向` · `尺寸与全屏` · `Header / Footer 插槽与遮罩` · `关闭行为` · `事件` …等 10 个 |
| `dropdown-menu` | `基础用法` · `导航样式` · `后台导航配置组合` · `交互契约` · `最佳实践` · `审阅说明` |
| `edge-fade-mask` | `纵向渐隐` · `横向渐隐` · `交互契约` · `最佳实践` · `审阅说明` |
| `empty-state` | `基础用法` · `横向布局` · `自定义插槽` · `后台恢复状态` · `预设组件` · `交互契约` …等 8 个 |
| `empty` | `基础用法` · `带操作` · `交互契约` · `最佳实践` · `审阅说明` |
| `error-state` | `基础用法` · `自定义内容` · `后台恢复状态` · `交互契约` · `最佳实践` · `审阅说明` |
| `file-uploader` | `基础用法` · `组合示例` · `交互契约` · `最佳实践` · `审阅说明` |
| `flat-button` | `基础用法` · `组合示例` · `交互契约` · `最佳实践` · `审阅说明` |
| `flat-dropdown` | `基础用法` · `触发方式` · `受控与非受控` · `尺寸控制` · `关闭契约` · `最佳实践` …等 7 个 |
| `flat-input` | `基础用法` · `组合示例` · `交互契约` · `最佳实践` · `审阅说明` |
| `flat-radio` | `基础用法` · `尺寸` · `图标` · `禁用状态` · `带边框` · `多选模式` …等 10 个 |
| `flat-select` | `基础用法` · `禁用状态` · `发布策略配置` · `交互契约` · `与 TxSelect 的对比` · `最佳实践` …等 7 个 |
| `flex` | `基础用法` · `组合示例` · `交互契约` · `最佳实践` · `审阅说明` |
| `flip-overlay` | `基础用法` · `设计要点` · `交互契约` · `最佳实践` · `审阅说明` |
| `floating` | `基础用法` · `组合示例` · `交互契约` · `最佳实践` · `审阅说明` |
| `form` | `基础用法` · `交互契约` · `最佳实践` · `审阅说明` |
| `foundations` | `字体` · `颜色体系` · `说明` · `审阅说明 / Review Notes` |
| `fusion` | `基础用法` · `实际场景` · `交互契约` · `最佳实践` · `审阅说明` |
| `glass-surface` | `基础用法` · `参数调节（滑块）` · `Fallback 降级` · `最佳实践` · `审阅说明` |
| `glow-text` | `基础用法` · `作用于图片/卡片` · `更多案例` · `交互契约` · `最佳实践` · `审阅说明` |
| `gradient-border` | `基础用法` · `组合示例` · `交互契约` · `最佳实践` · `审阅说明` |
| `gradual-blur` | `基础用法` · `方向（Top / Bottom / Left / Right）` · `Preset 预设` · `Hover 强度增强（hoverIntensity）` · `进入视口触发（animated="scroll"）` · `Page 目标（target="page"）` …等 10 个 |
| `grid-layout` | `基础用法` · `组合示例` · `交互契约` · `最佳实践` · `审阅说明` |
| `grid` | `基础用法` · `响应式网格` · `网格间距` · `网格项配置` · `对齐方式` · `交互契约` …等 8 个 |
| `group-block` | `基础用法` · `初始折叠` · `记忆展开状态` · `头部扩展` · `基础用法` · `链接样式` …等 18 个 |
| `guide-state` | `基础用法` · `自定义内容` · `交互契约` · `最佳实践` · `审阅说明` |
| `icon-button` | `基础用法` · `交互契约` · `最佳实践` · `审阅说明` |
| `icon` | `基础用法` · `TuffIcons 常量` · `图标分类` · `自定义样式` · `TxStatusIcon` · `类型与来源` …等 13 个 |
| `image-gallery` | `基础用法` · `组合示例` · `交互契约` · `最佳实践` · `审阅说明` |
| `image-uploader` | `基础用法` · `组合示例` · `交互契约` · `最佳实践` · `审阅说明` |
| `index` | `组件预览` · `组合工作台 Demo` · `教程路径` · `迁移状态看板` · `章节总览` · `设计模式` …等 15 个 |
| `input` | `基础用法` · `输入框类型` · `只读 / 禁用` · `可清空` · `前后缀插槽` · `最佳实践` …等 8 个 |
| `kbd` | `基础用法` · `交互契约` · `最佳实践` · `审阅说明` |
| `keyframe-stroke-text` | `基础用法` · `多语言文本` · `交互契约` · `最佳实践` · `审阅说明` |
| `layout-skeleton` | `基础用法` · `使用建议` · `交互契约` · `后台数据运维面板` · `组合示例` · `最佳实践` …等 7 个 |
| `loading-overlay` | `容器内遮罩` · `全屏遮罩` · `交互契约` · `后台任务遮罩` · `最佳实践` · `审阅说明` |
| `loading-state` | `基础用法` · `后台恢复状态` · `交互契约` · `最佳实践` · `审阅说明` |
| `markdown-editor` | `基础用法` · `交互契约` · `最佳实践` · `审阅说明` |
| `markdown-view` | `基础用法` · `丰富 Markdown` · `主题预览` · `交互契约` · `最佳实践` · `审阅说明` |
| `modal` | `基础用法` · `交互契约` · `最佳实践` · `审阅说明` |
| `nav-bar` | `基础用法` · `组合示例` · `交互契约` · `最佳实践` · `审阅说明` |
| `no-data` | `基础用法` · `交互契约` · `最佳实践` · `审阅说明 / Review Notes` |
| `no-selection` | `基础用法` · `交互契约` · `最佳实践` · `审阅说明 / Review Notes` |
| `number-input` | `基础用法` · `交互契约` · `最佳实践` · `审阅说明` |
| `offline-state` | `基础用法` · `交互契约` · `最佳实践` · `审阅说明 / Review Notes` |
| `os-icon` | `基础用法` · `交互契约` · `最佳实践` · `审阅说明` |
| `outline-border` | `基础用法` · `Mask 裁切` · `交互契约` · `最佳实践` · `审阅说明` |
| `pagination` | `基础用法` · `交互契约` · `最佳实践` · `后台数据运维面板` · `审阅说明` |
| `permission-state` | `基础用法` · `交互契约` · `最佳实践` · `审阅说明 / Review Notes` |
| `picker` | `基础用法` · `交互契约` · `最佳实践` · `审阅说明` |
| `popover` | `基础用法` · `触发与面板行为` · `后台导航配置组合` · `交互契约` · `最佳实践` · `审阅说明` |
| `progress-bar` | `交互契约` · `最佳实践` · `审阅说明` |
| `progress` | `组合示例` · `交互契约` · `最佳实践` · `审阅说明` |
| `radio` | `标准单选形式` · `卡片单选形式` · `按钮组形式` · `指示器动效` · `禁用状态` · `Playground` …等 9 个 |
| `rating` | `基础用法` · `样式定制` · `自定义图标` · `点击动画` · `交互契约` · `最佳实践` …等 7 个 |
| `scroll` | `行为说明` · `运行时策略（优先级）` · `基础用法` · `方向与滚动条` · `滚动链（高级 / Scroll Chaining）` · `使用原生滚动` …等 10 个 |
| `search-empty` | `基础用法` · `后台筛选工具栏` · `交互契约` · `最佳实践` · `审阅说明` |
| `search-input` | `基础用法` · `远程搜索` · `后台筛选工具栏` · `最佳实践` · `审阅说明` |
| `search-select` | `基础用法` · `远程搜索` · `注意事项` · `后台筛选工具栏` · `最佳实践` · `审阅说明` |
| `segmented-slider` | `基础用法` · `自定义选项` · `发布策略配置` · `最佳实践` · `审阅说明` |
| `select` | `基础选择` · `本地过滤` · `远程搜索` · `多选标签` · `自助创建` · `分组与自定义下拉` …等 12 个 |
| `skeleton` | `交互契约` · `后台数据运维面板` · `组合示例` · `最佳实践` · `审阅说明` |
| `slider` | `基础用法` · `禁用` · `格式化显示` · `显示数值` · `弹性 tooltip（速度 + 加速度）` · `发布策略配置` …等 9 个 |
| `sortable-list` | `基础用法` · `组合示例` · `交互契约` · `最佳实践` · `审阅说明` |
| `spinner` | `基础用法` · `尺寸` · `显隐切换（v-if vs visible）` · `交互契约` · `后台行内等待` · `最佳实践` …等 7 个 |
| `splitter` | `基础用法` · `交互契约` · `最佳实践` · `审阅说明` |
| `stack` | `基础用法` · `组合示例` · `交互契约` · `最佳实践` · `审阅说明` |
| `stagger` | `基础用法` · `组合示例` · `交互契约` · `最佳实践` · `审阅说明` |
| `stat-card` | `基础用法` · `最佳实践` · `审阅说明` |
| `status-badge` | `交互契约` · `最佳实践` · `审阅说明` |
| `steps` | `基础用法` · `交互契约` · `最佳实践` · `审阅说明 / Review Notes` |
| `switch` | `基础用法` · `交互契约` · `组合示例` · `最佳实践` · `审阅说明 / Review Notes` |
| `tab-bar` | `基础用法` · `交互契约` · `最佳实践` · `审阅说明 / Review Notes` |
| `tabs` | `基础用法` · `Indicator Showcase` · `动态内容尺寸（manual, rich content）` · `布局方向（placement）` · `高度跟随内容（animation.size）` · `关闭动画（indicator/content）` …等 11 个 |
| `tag-input` | `基础用法` · `发布策略配置` · `交互契约` · `最佳实践` · `审阅说明` |
| `tag` | `交互契约` · `最佳实践` · `审阅说明` |
| `text-transformer` | `基础用法` · `与 AutoSizer 搭配` · `长文本/章节切换` · `标题 + 副标题` · `状态/徽标文本` · `交互契约` …等 8 个 |
| `textarea` | `基础用法` · `交互契约` · `最佳实践` · `审阅说明` |
| `timeline` | `基础用法` · `后台审计流程` · `交互契约` · `最佳实践` · `审阅说明` |
| `toast` | `基础用法` · `交互契约` · `后台反馈中心` · `最佳实践` · `审阅说明` |
| `tooltip` | `基础用法` · `Anchor 透传` · `Click 切换（点击外部关闭）` · `Click 切换（点击外部不关闭）` · `交互契约` · `最佳实践` …等 9 个 |
| `transfer` | `基础用法` · `权限资源授权` · `最佳实践` · `审阅说明` |
| `transition` | `内容切换（X）` · `列表增删（Y）` · `交互契约` · `最佳实践` · `审阅说明` |
| `tree-select` | `基础用法` · `后台归属选择` · `注意事项` · `交互契约` · `最佳实践` · `审阅说明` |
| `tree` | `基础用法` · `后台权限域` · `暴露方法` · `交互契约` · `样式定制` · `最佳实践` …等 7 个 |
| `tuff-logo-stroke` | `动画模式` · `颜色与时长` · `交互契约` · `最佳实践` · `审阅说明 / Review Notes` |
| `typing-indicator` | `变体` · `最佳实践` · `审阅说明` |
| `version-capsule` | `基础用法` · `通道色调` · `Exposed` · `交互契约` · `最佳实践` · `审阅说明` |
| `virtual-list` | `基础用法` · `组合示例` · `交互契约` · `最佳实践` · `审阅说明` |
