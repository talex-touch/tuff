# Capability Testers

能力测试器的注册制度实现，使用 OOP 方式管理不同类型能力的测试逻辑。

## 架构

### BaseCapabilityTester (基类)

所有测试器的抽象基类，定义了测试器的标准接口：

- `generateTestPayload()` - 生成测试 payload
- `formatTestResult()` - 格式化测试结果用于展示
- `getDefaultInputHint()` - 获取默认输入提示
- `requiresUserInput()` - 是否需要用户输入

### 内置测试器

1. **ChatCapabilityTester** - 对话能力测试器
   - 支持用户自定义测试消息
   - 默认消息：`请用一句话介绍你自己。`

2. **EmbeddingCapabilityTester** - 向量嵌入测试器
   - 支持用户自定义测试文本
   - 默认文本：`这是一个测试文本，用于生成向量嵌入。`
   - 显示向量维度和前5个值

3. **VisionCapabilityTester** - 视觉能力测试器
   - 使用内置示例图片
   - 显示 OCR 识别的文本和关键词

### 注册系统

使用 `capabilityTesterRegistry` 注册测试器：

```typescript
import { capabilityTesterRegistry } from './capability-testers'

// 注册自定义测试器
capabilityTesterRegistry.register('custom.capability', new CustomTester())
```

## 添加新的测试器

1. 创建新的测试器类，继承 `BaseCapabilityTester`
2. 实现所有抽象方法
3. 在 `registry.ts` 中注册

示例：

```typescript
export class CustomCapabilityTester extends BaseCapabilityTester {
  readonly capabilityType = 'custom'

  async generateTestPayload(input: CapabilityTestPayload): Promise<any> {
    return {
      // 你的 payload 逻辑
    }
  }

  formatTestResult(result: AiInvokeResult<any>) {
    return {
      success: true,
      message: '测试成功',
      textPreview: '...',
      provider: result.provider,
      model: result.model,
      latency: result.latency
    }
  }

  getDefaultInputHint(): string {
    return '请输入测试内容'
  }

  requiresUserInput(): boolean {
    return true
  }
}
```

## UI 集成

测试对话框 (`CapabilityTestDialog.vue`) 会自动：
- 显示已启用的 providers 供用户选择
- 根据 `requiresUserInput()` 决定是否显示输入框
- 使用 `getDefaultInputHint()` 作为输入提示
