import type { BaseCapabilityTester } from './base-tester'
import { ChatCapabilityTester } from './chat-tester'
import { EmbeddingCapabilityTester } from './embedding-tester'
import { VisionCapabilityTester } from './vision-tester'

class CapabilityTesterRegistry {
  private testers = new Map<string, BaseCapabilityTester>()

  register(capabilityId: string, tester: BaseCapabilityTester): void {
    this.testers.set(capabilityId, tester)
  }

  get(capabilityId: string): BaseCapabilityTester | undefined {
    return this.testers.get(capabilityId)
  }

  has(capabilityId: string): boolean {
    return this.testers.has(capabilityId)
  }
}

export const capabilityTesterRegistry = new CapabilityTesterRegistry()

// 注册内置测试器
capabilityTesterRegistry.register('text.chat', new ChatCapabilityTester())
capabilityTesterRegistry.register('embedding.generate', new EmbeddingCapabilityTester())
capabilityTesterRegistry.register('vision.ocr', new VisionCapabilityTester())
