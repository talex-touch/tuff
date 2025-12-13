# 迁移指南

本指南将帮助您从其他 UI 库迁移到 TouchX UI，或者在 TouchX UI 版本之间进行升级。

## 从其他 UI 库迁移

### 从 Element Plus 迁移

TouchX UI 与 Element Plus 在 API 设计上有相似之处，但也有一些重要差异：

#### 组件名称映射

| Element Plus | TouchX UI | 说明 |
|--------------|-----------|------|
| `el-button` | `tx-button` | 按钮组件 |
| `el-input` | `tx-input` | 输入框组件 |
| `el-card` | `tx-card` | 卡片组件 |
| `el-avatar` | `tx-avatar` | 头像组件 |
| `el-icon` | `tx-icon` | 图标组件 |

#### 主要差异

1. **样式风格**
   ```vue
   <!-- Element Plus -->
   <el-button type="primary">按钮</el-button>
   
   <!-- TouchX UI -->
   <tx-button variant="primary">按钮</tx-button>
   ```

2. **主题定制**
   ```css
   /* Element Plus */
   :root {
     --el-color-primary: #409eff;
   }
   
   /* TouchX UI */
   :root {
     --tx-color-primary: #409eff;
   }
   ```

### 从 Ant Design Vue 迁移

#### 组件名称映射

| Ant Design Vue | TouchX UI | 说明 |
|----------------|-----------|------|
| `a-button` | `tx-button` | 按钮组件 |
| `a-input` | `tx-input` | 输入框组件 |
| `a-card` | `tx-card` | 卡片组件 |
| `a-avatar` | `tx-avatar` | 头像组件 |
| `a-icon` | `tx-icon` | 图标组件 |

#### 主要差异

1. **属性命名**
   ```vue
   <!-- Ant Design Vue -->
   <a-button type="primary" size="large">按钮</a-button>
   
   <!-- TouchX UI -->
   <tx-button variant="primary" size="large">按钮</tx-button>
   ```

2. **事件处理**
   ```vue
   <!-- Ant Design Vue -->
   <a-button @click="handleClick">按钮</a-button>
   
   <!-- TouchX UI -->
   <tx-button @click="handleClick">按钮</tx-button>
   ```

### 从 Vuetify 迁移

#### 组件名称映射

| Vuetify | TouchX UI | 说明 |
|---------|-----------|------|
| `v-btn` | `tx-button` | 按钮组件 |
| `v-text-field` | `tx-input` | 输入框组件 |
| `v-card` | `tx-card` | 卡片组件 |
| `v-avatar` | `tx-avatar` | 头像组件 |
| `v-icon` | `tx-icon` | 图标组件 |

## TouchX UI 版本升级

### 从 v0.x 升级到 v1.x

#### 破坏性变更

1. **组件前缀变更**
   ```vue
   <!-- v0.x -->
   <TouchButton>按钮</TouchButton>
   
   <!-- v1.x -->
   <TxButton>按钮</TxButton>
   ```

2. **属性重命名**
   ```vue
   <!-- v0.x -->
   <TxButton type="primary">按钮</TxButton>
   
   <!-- v1.x -->
   <TxButton variant="primary">按钮</TxButton>
   ```

3. **CSS 变量更新**
   ```css
   /* v0.x */
   :root {
     --touch-color-primary: #409eff;
   }
   
   /* v1.x */
   :root {
     --tx-color-primary: #409eff;
   }
   ```

#### 升级步骤

1. **更新依赖**
   ```bash
   npm uninstall @talex-touch/touchx-ui@0.x
   npm install @talex-touch/touchx-ui@1.x
   ```

2. **更新组件引用**
   使用查找替换功能批量更新组件名称：
   - `TouchButton` → `TxButton`
   - `TouchInput` → `TxInput`
   - `TouchCard` → `TxCard`

3. **更新属性名称**
   - `type` → `variant`（适用于 Button、Badge 等组件）
   - `color` → `variant`（部分组件）

4. **更新 CSS 变量**
   - `--touch-*` → `--tx-*`

### 从 v1.x 升级到 v2.x

#### 新增功能

1. **新组件**
   - `TxDatePicker` - 日期选择器
   - `TxTable` - 数据表格
   - `TxForm` - 表单组件

2. **增强功能**
   - 更好的 TypeScript 支持
   - 改进的无障碍性
   - 新的动画效果

#### 升级步骤

1. **更新依赖**
   ```bash
   npm update @talex-touch/touchx-ui
   ```

2. **检查废弃警告**
   运行应用并检查控制台中的废弃警告，按照提示进行更新。

## 迁移工具

### 自动化迁移脚本

我们提供了自动化迁移脚本来帮助您快速迁移：

```bash
# 安装迁移工具
npm install -g @talex-touch/touchx-ui-migrate

# 运行迁移
touchx-migrate --from=element-plus --to=touchx-ui ./src
```

### 代码转换器

使用 AST 转换器自动更新代码：

```bash
# 安装 jscodeshift
npm install -g jscodeshift

# 运行转换
jscodeshift -t touchx-ui-transform.js ./src
```

## 常见问题

### Q: 迁移后样式不一致怎么办？

A: TouchX UI 使用了不同的设计系统，建议：
1. 检查 CSS 变量是否正确设置
2. 使用 TouchX UI 的主题定制功能
3. 参考设计系统文档调整样式

### Q: 某些组件功能缺失怎么办？

A: 如果发现功能缺失：
1. 查看组件文档确认是否有替代方案
2. 在 GitHub 上提交 Feature Request
3. 考虑使用插槽或自定义组件实现

### Q: 性能是否会受到影响？

A: TouchX UI 经过性能优化：
1. 按需加载减少包体积
2. 虚拟滚动提升大数据渲染性能
3. 合理的重渲染策略

## 获取帮助

### 社区支持

- **GitHub Issues**: 报告问题和获取技术支持
- **GitHub Discussions**: 参与社区讨论
- **Discord**: 实时交流和答疑

### 专业服务

如果您需要专业的迁移服务，可以联系我们的技术团队：

- **迁移咨询**: 评估迁移成本和风险
- **定制开发**: 开发缺失的功能组件
- **培训服务**: 团队培训和最佳实践指导

### 迁移检查清单

- [ ] 更新依赖版本
- [ ] 更新组件名称
- [ ] 更新属性名称
- [ ] 更新 CSS 变量
- [ ] 测试核心功能
- [ ] 检查样式一致性
- [ ] 验证无障碍性
- [ ] 性能测试
- [ ] 文档更新

迁移可能需要一些时间和精力，但 TouchX UI 的现代化设计和优秀性能将为您的项目带来长期价值。
