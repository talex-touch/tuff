export type RiskLevel = 'trusted' | 'needs_confirmation' | 'blocked'

export interface RiskPromptInput {
  /** 资源来源标识，例如 provider 类型。 */
  sourceType: string
  /** 用户可识别的资源名称或路径。 */
  sourceId: string
  /** 风险等级，用于决定是否需要拦截或弹窗确认。 */
  level: RiskLevel
  /** 供 UI 展示的标题。 */
  title?: string
  /** 供 UI 展示的详细描述。 */
  description?: string
  /** 附加元数据，方便调用方扩展。 */
  metadata?: Record<string, unknown>
}

export type RiskPromptHandler = (input: RiskPromptInput) => Promise<boolean>

export const defaultRiskPromptHandler: RiskPromptHandler = async () => true
