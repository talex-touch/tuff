/**
 * DivisionBox Flow 集成示例
 *
 * 本示例展示如何:
 * 1. 通过 Flow 触发 DivisionBox
 * 2. 接收和处理 Flow 参数
 * 3. 在 DivisionBox 中处理数据
 * 4. 将结果返回给 Flow
 * 5. 实现 Flow 链式调用
 */

import type { Plugin, TuffQuery } from '@talex-touch/utils'
import { TuffInputType } from '@talex-touch/utils'

interface FlowContext {
  flowId: string
  previousResult?: any
  parameters: Record<string, any>
}

export default class FlowIntegrationExample implements Plugin {
  private flowSessions: Map<string, string> = new Map() // flowId -> sessionId

  async onLoad() {
    console.log('FlowIntegrationExample plugin loaded')

    // 监听状态变化
    this.plugin.divisionBox.onStateChange((data) => {
      console.log('DivisionBox state changed:', data)
    })
  }

  /**
   * 通过 Flow 触发打开 DivisionBox
   */
  async openFromFlow(flowContext: FlowContext) {
    try {
      console.log('Opening DivisionBox from Flow:', flowContext)

      const { sessionId } = await this.plugin.divisionBox.open({
        url: this.buildFlowUrl(flowContext),
        title: '数据处理',
        icon: 'ri:flow-chart',
        size: 'medium',
        keepAlive: true,
        header: {
          show: true,
          title: `Flow: ${flowContext.flowId}`,
          icon: 'ri:flow-chart',
          actions: [
            {
              id: 'process',
              label: '处理',
              icon: 'ri:play-line',
            },
            {
              id: 'export',
              label: '导出',
              icon: 'ri:download-line',
            },
            {
              id: 'next-step',
              label: '下一步',
              icon: 'ri:arrow-right-line',
            },
          ],
        },
      })

      // 保存 Flow 会话映射
      this.flowSessions.set(flowContext.flowId, sessionId)

      // 初始化 Flow 状态
      await this.plugin.divisionBox.updateState(sessionId, 'flowContext', flowContext)

      console.log('DivisionBox opened from Flow:', sessionId)
      return sessionId
    }
    catch (error) {
      console.error('Failed to open DivisionBox from Flow:', error)
      throw error
    }
  }

  /**
   * 构建 Flow URL
   */
  private buildFlowUrl(flowContext: FlowContext): string {
    const params = new URLSearchParams({
      flowId: flowContext.flowId,
      ...flowContext.parameters,
    })

    if (flowContext.previousResult) {
      params.set('previousResult', JSON.stringify(flowContext.previousResult))
    }

    return `https://example.com/flow-processor?${params.toString()}`
  }

  /**
   * 处理带剪贴板输入的 Flow
   */
  async handleFlowWithClipboard(query: TuffQuery) {
    try {
      console.log('Handling Flow with clipboard input:', query)

      // 解析输入
      const textInput = query.text
      const inputs = query.inputs || []

      // 查找图片输入
      const imageInput = inputs.find(i => i.type === TuffInputType.Image)

      // 查找文件输入
      const filesInput = inputs.find(i => i.type === TuffInputType.Files)

      // 创建 Flow 上下文
      const flowContext: FlowContext = {
        flowId: `flow-${Date.now()}`,
        parameters: {
          textInput,
          hasImage: !!imageInput,
          hasFiles: !!filesInput,
        },
      }

      // 打开 DivisionBox
      const sessionId = await this.openFromFlow(flowContext)

      // 传递输入数据
      if (imageInput) {
        await this.plugin.divisionBox.updateState(sessionId, 'imageData', imageInput.data)
      }

      if (filesInput) {
        const files = JSON.parse(filesInput.data)
        await this.plugin.divisionBox.updateState(sessionId, 'files', files)
      }

      return sessionId
    }
    catch (error) {
      console.error('Failed to handle Flow with clipboard:', error)
      throw error
    }
  }

  /**
   * 处理 Flow 数据
   */
  async processFlowData(sessionId: string) {
    try {
      console.log('Processing Flow data for session:', sessionId)

      // 获取 Flow 上下文
      const flowContext = await this.plugin.divisionBox.getState(sessionId, 'flowContext')

      if (!flowContext) {
        throw new Error('Flow context not found')
      }

      // 获取输入数据
      const imageData = await this.plugin.divisionBox.getState(sessionId, 'imageData')
      const files = await this.plugin.divisionBox.getState(sessionId, 'files')

      // 模拟数据处理
      const result = {
        flowId: flowContext.flowId,
        processedAt: new Date().toISOString(),
        data: {
          textLength: flowContext.parameters.textInput?.length || 0,
          hasImage: !!imageData,
          fileCount: files?.length || 0,
        },
      }

      // 保存处理结果
      await this.plugin.divisionBox.updateState(sessionId, 'processResult', result)

      console.log('Flow data processed:', result)
      return result
    }
    catch (error) {
      console.error('Failed to process Flow data:', error)
      throw error
    }
  }

  /**
   * 导出 Flow 结果
   */
  async exportFlowResult(sessionId: string) {
    try {
      console.log('Exporting Flow result for session:', sessionId)

      // 获取处理结果
      const result = await this.plugin.divisionBox.getState(sessionId, 'processResult')

      if (!result) {
        throw new Error('No result to export')
      }

      // 导出为 JSON
      const json = JSON.stringify(result, null, 2)

      // 复制到剪贴板
      await navigator.clipboard.writeText(json)

      console.log('Flow result exported to clipboard')
      return result
    }
    catch (error) {
      console.error('Failed to export Flow result:', error)
      throw error
    }
  }

  /**
   * 触发 Flow 的下一步
   */
  async triggerNextFlowStep(sessionId: string) {
    try {
      console.log('Triggering next Flow step for session:', sessionId)

      // 获取当前结果
      const result = await this.plugin.divisionBox.getState(sessionId, 'processResult')

      if (!result) {
        throw new Error('No result for next step')
      }

      // 获取 Flow 上下文
      const flowContext = await this.plugin.divisionBox.getState(sessionId, 'flowContext')

      // 创建新的 Flow 上下文
      const nextFlowContext: FlowContext = {
        flowId: `${flowContext.flowId}-next`,
        previousResult: result,
        parameters: {
          step: 'next',
          previousFlowId: flowContext.flowId,
        },
      }

      // 关闭当前 DivisionBox
      await this.plugin.divisionBox.close(sessionId)

      // 打开新的 DivisionBox 用于下一步
      const nextSessionId = await this.openFromFlow(nextFlowContext)

      console.log('Next Flow step triggered:', nextSessionId)
      return nextSessionId
    }
    catch (error) {
      console.error('Failed to trigger next Flow step:', error)
      throw error
    }
  }

  /**
   * 实现 Flow 链式调用
   */
  async executeFlowChain(steps: string[]) {
    try {
      console.log('Executing Flow chain:', steps)

      let currentResult: any = null
      let currentSessionId: string | null = null

      for (let i = 0; i < steps.length; i++) {
        const step = steps[i]
        console.log(`Executing step ${i + 1}/${steps.length}: ${step}`)

        // 创建 Flow 上下文
        const flowContext: FlowContext = {
          flowId: `chain-${Date.now()}-step-${i}`,
          previousResult: currentResult,
          parameters: {
            step,
            stepIndex: i,
            totalSteps: steps.length,
          },
        }

        // 打开 DivisionBox
        currentSessionId = await this.openFromFlow(flowContext)

        // 处理数据
        currentResult = await this.processFlowData(currentSessionId)

        // 如果不是最后一步,关闭当前 DivisionBox
        if (i < steps.length - 1) {
          await this.plugin.divisionBox.close(currentSessionId)

          // 等待一会儿再执行下一步
          await new Promise(resolve => setTimeout(resolve, 500))
        }
      }

      console.log('Flow chain completed:', currentResult)
      return {
        sessionId: currentSessionId,
        result: currentResult,
      }
    }
    catch (error) {
      console.error('Failed to execute Flow chain:', error)
      throw error
    }
  }

  /**
   * 插件功能被触发时调用
   */
  async onFeatureTriggered(featureId: string, query: string | TuffQuery) {
    console.log('Feature triggered:', featureId)

    try {
      if (featureId === 'flow-with-clipboard') {
        // 处理带剪贴板输入的 Flow
        const tuffQuery = typeof query === 'string' ? { text: query, inputs: [] } : query
        await this.handleFlowWithClipboard(tuffQuery)
      }
      else if (featureId === 'flow-chain') {
        // 执行 Flow 链
        await this.executeFlowChain(['step1', 'step2', 'step3'])
      }
      else {
        // 简单的 Flow 触发
        const flowContext: FlowContext = {
          flowId: `flow-${Date.now()}`,
          parameters: {
            query: typeof query === 'string' ? query : query.text,
          },
        }
        await this.openFromFlow(flowContext)
      }
    }
    catch (error) {
      console.error('Failed to handle feature:', error)
    }
  }

  /**
   * 插件卸载时清理资源
   */
  async onUnload() {
    console.log('Cleaning up Flow sessions...')

    // 关闭所有 Flow 会话
    for (const sessionId of this.flowSessions.values()) {
      await this.plugin.divisionBox.close(sessionId, { force: true })
    }

    this.flowSessions.clear()
    console.log('FlowIntegrationExample plugin unloaded')
  }
}
