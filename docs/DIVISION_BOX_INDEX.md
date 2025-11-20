# DivisionBox 文档索引

欢迎使用 DivisionBox 系统!本文档索引帮助你快速找到所需的文档和资源。

## 📚 核心文档

### 1. [API 文档](./DIVISION_BOX_API.md)
完整的 API 参考文档,包含:
- DivisionBoxManager API
- DivisionBoxSession API
- Plugin SDK API
- IPC 通信接口
- 类型定义

**适合:** 需要查找具体 API 用法的开发者

---

### 2. [Manifest 配置文档](./DIVISION_BOX_MANIFEST.md)
插件 Manifest 配置详解,包含:
- 配置选项说明
- 默认值和验证规则
- 完整配置示例
- 常见问题解答

**适合:** 需要在 manifest.json 中配置 DivisionBox 的开发者

---

### 3. [开发者指南](./DIVISION_BOX_GUIDE.md)
全面的开发指南,包含:
- 快速开始教程
- 插件接入步骤
- 最佳实践
- 常见模式
- 性能优化
- 故障排查
- 调试技巧

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

### 进阶开发者
1. 学习 [KeepAlive 模式示例](../examples/division-box/keepalive-mode.ts)
2. 实现 [自定义 Header](../examples/division-box/custom-header.ts)
3. 阅读 [开发者指南](./DIVISION_BOX_GUIDE.md) 的"最佳实践"部分

### 高级开发者
1. 研究 [Flow 集成示例](../examples/division-box/flow-integration.ts)
2. 阅读 [API 文档](./DIVISION_BOX_API.md) 的完整参考
3. 学习 [开发者指南](./DIVISION_BOX_GUIDE.md) 的"性能优化"部分

---

## 🔍 常见问题

### Q: DivisionBox 和普通窗口有什么区别?
A: DivisionBox 是基于 WebContentsView 的轻量级浮动容器,支持 KeepAlive 缓存、状态管理和生命周期控制。

### Q: 什么时候应该启用 KeepAlive?
A: 对于频繁访问、需要保留用户状态或加载时间较长的工具,建议启用 KeepAlive。

### Q: 如何自定义 Header?
A: 在 manifest.json 或 open() 方法中配置 header 选项,参考 [自定义 Header 示例](../examples/division-box/custom-header.ts)。

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
- 单个 Session 最多 3 个 WebContentsView
- 全局最多 20 个活跃实例
- LRU 缓存限制 10 个实例
- 单个插件最多 5 个 DivisionBox

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

## 📅 更新日志

- **v1.0.0** (2024-01-20)
  - 初始版本发布
  - 完整的文档和示例
  - 支持 KeepAlive 模式
  - 支持自定义 Header
  - 支持 Flow 集成

---

## 🎯 下一步

- [ ] 阅读 [开发者指南](./DIVISION_BOX_GUIDE.md)
- [ ] 运行 [基础使用示例](../examples/division-box/basic-usage.ts)
- [ ] 创建你的第一个 DivisionBox 插件
- [ ] 探索高级功能

祝你开发愉快! 🚀
