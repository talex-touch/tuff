# TUFF UI 迁移优化 PRD

> 版本: 1.0.0
> 日期: 2024-12-13
> 状态: 进行中

## 1. 背景与目标

### 1.1 现状分析

**tuff-ui 当前技术栈（过时）**:
- Vite 4.5.0
- Vue 3.3.4
- TypeScript 5.2.2
- VitePress 1.0.0-rc.24
- Sass 1.69.4
- Gulp 构建系统

**渲染进程技术栈（目标）**:
- Vite 7.1.12
- Vue 3.5.22
- TypeScript 5.9.3
- UnoCSS 66.5.4
- Sass 1.93.3
- Element Plus 2.11.7
- Pinia 3.0.3
- VueUse 14.0.0

**问题**:
1. tuff-ui 技术栈严重落后于主应用
2. 组件重复开发，渲染进程有大量成熟组件未复用
3. UI 风格不统一，缺乏设计系统
4. 文档与主文档站分离，维护成本高

### 1.2 目标

1. **技术栈对齐**: 升级 tuff-ui 依赖版本与渲染进程一致
2. **组件迁移**: 将渲染进程成熟组件迁移到 tuff-ui
3. **统一 UI**: 建立统一设计系统，所有项目共用
4. **文档整合**: 在官网添加 tuff-ui 入口，统一文档体验

## 2. 技术方案

### 2.1 技术栈升级

| 依赖 | 当前版本 | 目标版本 |
|------|---------|---------|
| vite | 4.5.0 | 6.0.0+ |
| vue | 3.3.4 | 3.5.x |
| typescript | 5.2.2 | 5.8.x |
| sass | 1.69.4 | 1.89.x |
| vitepress | 1.0.0-rc.24 | 1.5.0+ |

**新增依赖**:
- `@vueuse/core` - Vue Composition 工具集
- `unocss` - 原子化 CSS（可选，保持 SCSS 兼容）

### 2.2 组件迁移计划

#### Phase 1: 基础组件（优先级高）

| 组件 | 来源路径 | 目标名称 | 说明 |
|------|---------|---------|------|
| FlatButton | `base/button/FlatButton.vue` | TxFlatButton | 扁平按钮 |
| IconButton | `base/button/IconButton.vue` | TxIconButton | 图标按钮 |
| TSwitch | `base/switch/TSwitch.vue` | TxSwitch | 开关组件 |
| TSelect | `base/select/TSelect.vue` | TxSelect | 选择器 |
| TSelectItem | `base/select/TSelectItem.vue` | TxSelectItem | 选择项 |
| TouchScroll | `base/TouchScroll.vue` | TxScroll | 滚动容器 |

#### Phase 2: 表单组件

| 组件 | 来源路径 | 目标名称 | 说明 |
|------|---------|---------|------|
| TFormInput | `base/tuff/TFormInput.vue` | TxFormInput | 表单输入 |
| TSelectField | `base/tuff/TSelectField.vue` | TxSelectField | 选择字段 |
| TModal | `base/tuff/TModal.vue` | TxModal | 模态框 |

#### Phase 3: 布局组件

| 组件 | 来源路径 | 目标名称 | 说明 |
|------|---------|---------|------|
| TGroupBlock | `base/group/TGroupBlock.vue` | TxGroupBlock | 分组块 |
| TuffGroupBlock | `tuff/TuffGroupBlock.vue` | TxTuffGroup | Tuff 分组 |
| TouchMenu | `menu/TouchMenu.vue` | TxMenu | 菜单组件 |
| TouchMenuItem | `menu/TouchMenuItem.vue` | TxMenuItem | 菜单项 |

#### Phase 4: 标签与状态组件

| 组件 | 来源路径 | 目标名称 | 说明 |
|------|---------|---------|------|
| TMenuTabs | `tabs/TMenuTabs.vue` | TxTabs | 标签页 |
| TTabHeader | `tabs/TTabHeader.vue` | TxTabHeader | 标签头 |
| TTabItem | `tabs/TTabItem.vue` | TxTabItem | 标签项 |
| TuffStatusBadge | `tuff/TuffStatusBadge.vue` | TxBadge | 状态徽章 |

### 2.3 目录结构

```
packages/tuff-ui/
├── packages/
│   ├── components/
│   │   └── src/
│   │       ├── button/          # 按钮组件
│   │       ├── switch/          # 开关组件
│   │       ├── select/          # 选择器组件
│   │       ├── input/           # 输入组件
│   │       ├── modal/           # 模态框组件
│   │       ├── scroll/          # 滚动组件
│   │       ├── group/           # 分组组件
│   │       ├── menu/            # 菜单组件
│   │       ├── tabs/            # 标签组件
│   │       ├── badge/           # 徽章组件
│   │       └── index.ts         # 统一导出
│   ├── styles/                  # 全局样式
│   │   ├── variables.scss       # CSS 变量
│   │   ├── mixins.scss          # SCSS mixins
│   │   └── index.scss           # 入口样式
│   └── utils/                   # 工具函数
└── docs/                        # VitePress 文档
```

### 2.4 命名规范

- **组件前缀**: `Tx` (TouchX / Tuff eXperience)
- **样式前缀**: `tx-`
- **CSS 变量前缀**: `--tx-`
- **事件命名**: `kebab-case` (如 `@update:model-value`)

## 3. 文档规划

### 3.1 官网入口

在 `apps/nexus/` 添加 TUFF UI 专区导航：

```yaml
# 导航结构
- 开发者文档
  - 快速开始
  - API 参考
  - TUFF UI ← 新增入口
    - 介绍
    - 快速开始
    - 组件列表
    - 主题定制
```

### 3.2 文档更新

1. 更新 `apps/nexus/content/docs/dev/tuff-ui.zh.md`
2. 更新 `apps/nexus/content/docs/dev/tuff-ui.en.md`
3. 更新 `packages/tuff-ui/README.md`
4. 更新 `packages/tuff-ui/README_ZHCN.md`

## 4. 实施步骤

### Step 1: 技术栈升级
1. 升级 `packages/tuff-ui/package.json` 依赖版本
2. 更新 `tsconfig.json` 配置
3. 更新 vite 配置

### Step 2: 复制基础组件
1. 从渲染进程复制 Phase 1 组件
2. 适配组件导入路径
3. 移除 Electron 特定依赖

### Step 3: 样式系统
1. 建立统一 CSS 变量系统
2. 迁移复用样式
3. 确保主题兼容性

### Step 4: 文档更新
1. 更新组件文档
2. 更新官网入口
3. 更新 README

## 5. 注意事项

### 5.1 迁移原则

1. **保持兼容**: 不破坏现有 API
2. **渐进迁移**: 分阶段迁移，每阶段可独立发布
3. **最小依赖**: tuff-ui 不依赖 Electron 特定 API
4. **独立运行**: 组件可在任何 Vue 3 项目中使用

### 5.2 排除项

以下组件 **不迁移** 到 tuff-ui（因为包含 Electron 特定逻辑）：
- `AppUpgradationView.vue` - 应用更新视图
- `BuildSecurityBanner.vue` - 构建安全横幅
- `TuffUserInfo.vue` - 用户信息（依赖 AccountSDK）
- 任何使用 `window.$nodeApi` 的组件

### 5.3 后续计划

1. **v0.2.0**: 完成 Phase 1 + Phase 2 组件迁移
2. **v0.3.0**: 完成 Phase 3 + Phase 4 组件迁移
3. **v1.0.0**: 稳定 API，正式发布

## 6. 成功指标

- [ ] 技术栈版本对齐完成
- [ ] 至少 10 个核心组件迁移完成
- [ ] 官网文档入口添加完成
- [ ] README 更新完成
- [ ] 可在独立 Vue 3 项目中正常使用
