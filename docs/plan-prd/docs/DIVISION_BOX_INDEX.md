# DivisionBox 文档索引

欢迎使用 DivisionBox 系统!本文档索引帮助你快速找到所需的文档和资源。

## 范围

本轮文档仅覆盖 **DivisionBox 基础能力**（打开/关闭/状态同步/keepAlive）。
 
- 不包含：多视图并行、复杂 Dock 布局、3 个 WebContentsView 并行挂载等高级能力。
- 生命周期事件“对插件开放”将以 `DivisionBoxSDK` 形式统一补齐（见 Nexus 文档与 PRD Index）。

## 📚 核心文档

### 1. [API 文档](./DIVISION_BOX_API.md)
完整的 API 参考文档,包含:
- DivisionBoxManager API
- DivisionBoxSession API

**适合:** 第一次使用 DivisionBox 或需要深入了解的开发者

---

## 💡 使用示例

### [示例代码目录](../examples/division-box/)

包含以下完整示例:

1. **[基础使用](../examples/division-box/basic-usage.ts)**
   - 创建和关闭 DivisionBox
   - 监听状态变化
   - 更新 sessionState
   - 资源清理

2. **[KeepAlive 模式](../examples/division-box/keepalive-mode.ts)**
   - 启用缓存模式
   - 保存和恢复用户状态
   - 性能测试
   - 会话管理

3. **[自定义 Header](../examples/division-box/custom-header.ts)**
   - 自定义标题和图标
   - 添加操作按钮
   - 处理按钮事件
   - 切换沉浸模式

4. **[Flow 集成](../examples/division-box/flow-integration.ts)**
   - Flow 触发
   - 处理剪贴板输入
   - 数据处理和导出
   - Flow 链式调用

5. **[Manifest 示例](../examples/division-box/manifest-example.json)**
   - 完整的 manifest.json 配置示例

---

## 🚀 快速开始

### 5 分钟上手

1. **配置 Manifest**
   ```json
   {
     "divisionBox": {
       "defaultSize": "medium",
       "keepAlive": true
     }
   }
   ```

2. **打开 DivisionBox**
   ```typescript
   const { sessionId } = await plugin.divisionBox.open({
     url: 'https://example.com/tool',
     title: '我的工具'
   })
   ```

3. **监听状态变化**
   ```typescript
   plugin.divisionBox.onStateChange((data) => {
     console.log('State changed:', data)
   })
   ```

4. **关闭 DivisionBox**
   ```typescript
   await plugin.divisionBox.close(sessionId)
   ```

---

## 📖 学习路径

### 初学者
1. 阅读 [开发者指南](./DIVISION_BOX_GUIDE.md) 的"快速开始"部分
2. 运行 [基础使用示例](../examples/division-box/basic-usage.ts)
3. 查看 [Manifest 配置文档](./DIVISION_BOX_MANIFEST.md)

---

## 🔍 常见问题

### Q: 如何调试 DivisionBox?
A: 参考 [开发者指南](./DIVISION_BOX_GUIDE.md) 的"调试技巧"部分。

---

## 🛠️ 技术规格

### 性能指标
| 指标 | 目标值 |
|------|--------|
| 首帧渲染时间 | ≤ 250ms |
| 缓存恢复时间 | ≤ 120ms |
| 状态同步延迟 | ≤ 100ms |
| 内存使用(单实例) | < 50MB |

### 资源限制
- 资源限制以代码实现为准（主进程 `apps/core-app/src/main/modules/division-box/`）。

---

## 📝 设计文档

如果你想深入了解 DivisionBox 的设计理念和架构:

- [需求文档](../.kiro/specs/division-box-interactive-container/requirements.md)
- [设计文档](../.kiro/specs/division-box-interactive-container/design.md)
- [任务列表](../.kiro/specs/division-box-interactive-container/tasks.md)

---

## 🤝 获取帮助

遇到问题?

1. 查看 [开发者指南](./DIVISION_BOX_GUIDE.md) 的"故障排查"部分
2. 检查控制台日志
3. 查看 [API 文档](./DIVISION_BOX_API.md)
4. 提交 Issue 到项目仓库

---

## 下一步

- `DivisionBoxSDK`：对插件开放生命周期事件（prepare/attach/active/inactive/detach/destroy）并统一封装。
- 与 FlowTransfer 的权限/触发入口对齐。
