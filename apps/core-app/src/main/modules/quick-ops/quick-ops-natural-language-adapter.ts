import type { FlowDispatchOptions, FlowDispatchResult, FlowPayload } from '@talex-touch/utils'
import { createHash } from 'node:crypto'
import { parseDurationMs } from '../box-tool/addon/quick-ops/quick-ops-provider'
import { flowBus } from '../flow-bus/flow-bus'

export type QuickOpsNaturalLanguageDecision =
  | 'ready'
  | 'requires-confirmation'
  | 'blocked'
  | 'unsupported'
  | 'degraded'

export type QuickOpsNaturalLanguageRisk = 'read-only' | 'low' | 'confirm' | 'high-risk'

export interface QuickOpsNaturalLanguageRequest {
  text: string
  source?: 'ai' | 'flow' | 'corebox' | 'test'
  confirmationToken?: string
}

export interface QuickOpsNaturalLanguageTrace {
  requestHash: string
  requestLength: number
  targetId?: string
  decision: QuickOpsNaturalLanguageDecision
  confirmation: 'not-required' | 'required' | 'blocked'
  result: 'dispatch-plan' | 'blocked' | 'unsupported' | 'degraded'
  payloadKeys: string[]
  sensitivePayloadRedacted: boolean
  runtimeDispatchBridge: boolean
}

export interface QuickOpsNaturalLanguagePlan {
  decision: QuickOpsNaturalLanguageDecision
  risk: QuickOpsNaturalLanguageRisk
  targetId?: string
  payload?: FlowPayload
  dispatchOptions?: FlowDispatchOptions
  reason?: string
  trace: QuickOpsNaturalLanguageTrace
}

export interface QuickOpsNaturalLanguageDispatchResult {
  plan: QuickOpsNaturalLanguagePlan
  dispatched: boolean
  result?: FlowDispatchResult
  reason?: string
}

interface QuickOpsNaturalLanguageTargetPlan {
  decision?: QuickOpsNaturalLanguageDecision
  risk: QuickOpsNaturalLanguageRisk
  targetId: string
  payloadData?: Record<string, unknown>
  requiresConfirmation?: boolean
}

const QUICK_OPS_AI_SENDER_ID = 'quickops.ai-natural-language-adapter'
const HIGH_RISK_PATTERNS = [
  /\b(kill|terminate|stop-process)\b.*\b(port|process|pid)\b/i,
  /\b(port|process|pid)\b.*\b(kill|terminate|stop-process)\b/i,
  /\b(rm\s+-rf|delete all|bulk delete|format disk)\b/i,
  /杀掉.*(端口|进程)|删除全部|批量删除|格式化磁盘/i
] as const

const HOSTNAME_PATTERN = /\b((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63})\b/i
const PORT_PATTERN = /\bport\s+(\d{1,5})\b|端口\s*(\d{1,5})/i
const PATH_IN_QUOTES_PATTERN = /["']([^"']+)["']/

export function resolveQuickOpsNaturalLanguageRequest(
  request: QuickOpsNaturalLanguageRequest
): QuickOpsNaturalLanguagePlan {
  const text = request.text.trim()
  if (!text) return createPlan(text, 'unsupported', 'read-only', undefined, 'empty-request', {})

  const highRiskReason = detectHighRiskReason(text)
  if (highRiskReason) {
    return createPlan(
      text,
      'blocked',
      'high-risk',
      undefined,
      highRiskReason,
      {},
      {
        confirmation: 'blocked',
        result: 'blocked'
      }
    )
  }

  const targetPlan = resolveTargetPlan(text)
  if (!targetPlan) {
    return createPlan(text, 'unsupported', 'read-only', undefined, 'unsupported-request', {})
  }

  const decision =
    targetPlan.decision ?? (targetPlan.requiresConfirmation ? 'requires-confirmation' : 'ready')
  return createPlan(
    text,
    decision,
    targetPlan.risk,
    targetPlan.targetId,
    undefined,
    targetPlan.payloadData
  )
}

export async function dispatchQuickOpsNaturalLanguageRequest(
  request: QuickOpsNaturalLanguageRequest
): Promise<QuickOpsNaturalLanguageDispatchResult> {
  const plan = resolveQuickOpsNaturalLanguageRequest(request)
  const { payload, dispatchOptions } = plan

  if (
    !payload ||
    !dispatchOptions ||
    plan.decision === 'blocked' ||
    plan.decision === 'unsupported'
  ) {
    return {
      plan,
      dispatched: false,
      reason: plan.reason ?? plan.decision
    }
  }

  if (plan.decision === 'degraded') {
    return {
      plan,
      dispatched: false,
      reason: 'degraded-plan'
    }
  }

  if (plan.decision === 'requires-confirmation' && !request.confirmationToken) {
    return {
      plan,
      dispatched: false,
      reason: 'confirmation-token-required'
    }
  }

  const result = await flowBus.dispatch(QUICK_OPS_AI_SENDER_ID, payload, {
    ...dispatchOptions,
    confirmationToken: request.confirmationToken
  })

  return {
    plan: {
      ...plan,
      trace: {
        ...plan.trace,
        runtimeDispatchBridge: true
      }
    },
    dispatched: true,
    result
  }
}

function resolveTargetPlan(text: string): QuickOpsNaturalLanguageTargetPlan | null {
  const normalized = text.toLowerCase()

  if (includesAny(normalized, ['capability', 'capabilities', '能力'])) {
    return readOnly('quickops.capabilities')
  }
  if (includesAny(normalized, ['session', 'sessions', 'running', '运行中', '会话'])) {
    return readOnly('quickops.sessions')
  }
  if (includesAny(normalized, ['system info', '系统信息'])) return readOnly('quickops.system-info')
  if (includesAny(normalized, ['diagnostics', '诊断'])) return readOnly('quickops.tuff-diagnostics')
  if (includesAny(normalized, ['disk space', '磁盘空间'])) return readOnly('quickops.disk-space')
  if (includesAny(normalized, ['directory usage', '目录占用'])) {
    return readOnly('quickops.directory-usage', {
      deep: includesAny(normalized, ['deep', 'recursive', '深度'])
    })
  }
  if (includesAny(normalized, ['network status', '网络状态'])) {
    return readOnly('quickops.network-status')
  }
  if (includesAny(normalized, ['battery', '电池'])) return readOnly('quickops.battery-status')
  if (includesAny(normalized, ['proxy', '代理'])) return readOnly('quickops.system-proxy')
  if (includesAny(normalized, ['local ip', '本机 ip', '本地 ip'])) {
    return readOnly('quickops.query-local-ip')
  }
  if (includesAny(normalized, ['public ip', '公网 ip'])) {
    return confirm('quickops.public-ip')
  }

  const port = readPort(text)
  if (port) return readOnly('quickops.port-status', { port })

  if (includesAny(normalized, ['dns', '域名'])) {
    const hostname = readHostname(text)
    if (!hostname) return degraded('quickops.dns-query', { text })
    return readOnly('quickops.dns-query', {
      hostname,
      deep: includesAny(normalized, ['deep', 'full', '详细', '深度'])
    })
  }

  if (includesAny(normalized, ['hash', 'sha256', 'md5', '哈希'])) {
    return readOnly('quickops.file-hash', readPathPayload(text))
  }
  if (includesAny(normalized, ['base64']) && includesAny(normalized, ['file', '文件'])) {
    return readOnly('quickops.file-base64', readPathPayload(text))
  }
  if (includesAny(normalized, ['recent download', 'latest download', '最近下载'])) {
    return readOnly('quickops.recent-download')
  }
  if (includesAny(normalized, ['copy path', 'path format', '复制路径', '路径格式'])) {
    return readOnly('quickops.path-format', readPathPayload(text))
  }
  if (includesAny(normalized, ['downloads', 'download folder', '下载目录'])) {
    return includesAny(normalized, ['open', '打开'])
      ? confirm('quickops.open-folder', { folder: 'downloads' })
      : readOnly('quickops.common-directory', { folder: 'downloads' })
  }

  if (includesAny(normalized, ['keep awake', '禁止息屏', '保持唤醒'])) {
    return confirm('quickops.keep-awake', readDurationPayload(text))
  }
  if (includesAny(normalized, ['prevent system sleep', 'system awake', '禁止系统睡眠'])) {
    return confirm('quickops.system-awake', readDurationPayload(text))
  }
  if (includesAny(normalized, ['timer', '计时'])) {
    return confirm('quickops.start-timer', readDurationPayload(text))
  }
  if (includesAny(normalized, ['pomodoro', '番茄钟'])) {
    return confirm('quickops.start-pomodoro', readDurationPayload(text))
  }
  if (includesAny(normalized, ['stopwatch', '秒表'])) return confirm('quickops.start-stopwatch')
  if (includesAny(normalized, ['clean screen', '清洁屏幕', 'screen test', '屏幕测试'])) {
    return confirm('quickops.clean-screen', {
      ...readDurationPayload(text),
      ...readScreenModePayload(normalized)
    })
  }
  if (includesAny(normalized, ['notification', 'notify me', '提醒', '通知'])) {
    return confirm('quickops.show-notification', {
      title: 'QuickOps',
      message: readQuotedText(text) ?? text
    })
  }
  if (includesAny(normalized, ['copy to clipboard', 'clipboard', '复制到剪贴板'])) {
    const value = readQuotedText(text)
    if (!value) return degraded('quickops.copy-to-clipboard', { text })
    return confirm('quickops.copy-to-clipboard', { text: value })
  }

  return null
}

function createPlan(
  requestText: string,
  decision: QuickOpsNaturalLanguageDecision,
  risk: QuickOpsNaturalLanguageRisk,
  targetId: string | undefined,
  reason: string | undefined,
  payloadData: Record<string, unknown> | undefined,
  traceOverrides: Partial<Pick<QuickOpsNaturalLanguageTrace, 'confirmation' | 'result'>> = {}
): QuickOpsNaturalLanguagePlan {
  const payloadKeys = Object.keys(payloadData ?? {}).sort()
  const confirmation =
    traceOverrides.confirmation ??
    (decision === 'requires-confirmation' ? 'required' : 'not-required')
  const result =
    traceOverrides.result ??
    (decision === 'ready' || decision === 'requires-confirmation'
      ? 'dispatch-plan'
      : decision === 'blocked'
        ? 'blocked'
        : decision)

  return {
    decision,
    risk,
    targetId,
    payload: targetId
      ? {
          type: 'json',
          data: payloadData ?? {},
          context: {
            sourcePluginId: QUICK_OPS_AI_SENDER_ID,
            metadata: {
              adapter: 'quickops-natural-language',
              payloadKeys
            }
          }
        }
      : undefined,
    dispatchOptions: targetId
      ? {
          preferredTarget: targetId,
          skipSelector: true,
          requireAck: true
        }
      : undefined,
    reason,
    trace: {
      requestHash: createHash('sha256').update(requestText).digest('hex').slice(0, 12),
      requestLength: requestText.length,
      targetId,
      decision,
      confirmation,
      result,
      payloadKeys,
      sensitivePayloadRedacted: true,
      runtimeDispatchBridge: false
    }
  }
}

function readOnly(
  targetId: string,
  payloadData: Record<string, unknown> = {}
): QuickOpsNaturalLanguageTargetPlan {
  return { risk: 'read-only', targetId, payloadData }
}

function confirm(
  targetId: string,
  payloadData: Record<string, unknown> = {}
): QuickOpsNaturalLanguageTargetPlan {
  return { risk: 'confirm', targetId, payloadData, requiresConfirmation: true }
}

function degraded(
  targetId: string,
  payloadData: Record<string, unknown>
): QuickOpsNaturalLanguageTargetPlan {
  return { decision: 'degraded', risk: 'read-only', targetId, payloadData }
}

function includesAny(text: string, needles: string[]): boolean {
  return needles.some((needle) => text.includes(needle))
}

function detectHighRiskReason(text: string): string | undefined {
  return HIGH_RISK_PATTERNS.some((pattern) => pattern.test(text)) ? 'high-risk-blocked' : undefined
}

function readDurationPayload(text: string): Record<string, unknown> {
  const durationMs = parseDurationMs(text)
  return durationMs ? { durationMs } : {}
}

function readScreenModePayload(text: string): Record<string, unknown> {
  if (includesAny(text, ['white', '白色', '白底'])) return { screenMode: 'white' }
  if (includesAny(text, ['red', '红色', '红屏'])) return { screenMode: 'red' }
  if (includesAny(text, ['green', '绿色', '绿屏'])) return { screenMode: 'green' }
  if (includesAny(text, ['blue', '蓝色', '蓝屏'])) return { screenMode: 'blue' }
  if (includesAny(text, ['black', '黑色', '黑底'])) return { screenMode: 'black' }
  return {}
}

function readPort(text: string): number | undefined {
  const match = text.match(PORT_PATTERN)
  const value = Number(match?.[1] ?? match?.[2])
  return Number.isInteger(value) && value > 0 && value <= 65535 ? value : undefined
}

function readHostname(text: string): string | undefined {
  const match = text.match(HOSTNAME_PATTERN)
  return match?.[1]?.toLowerCase()
}

function readPathPayload(text: string): Record<string, unknown> {
  const path = readQuotedText(text)
  return path ? { path } : { text }
}

function readQuotedText(text: string): string | undefined {
  const match = text.match(PATH_IN_QUOTES_PATTERN)
  const value = match?.[1]?.trim()
  return value || undefined
}
