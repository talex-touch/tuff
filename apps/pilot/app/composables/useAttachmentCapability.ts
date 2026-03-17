interface AttachmentCapabilityResponse {
  allowed?: boolean
  reason?: string
  provider?: string
  maxBytes?: number
  accept?: string
}

export interface AttachmentCapability {
  allowed: boolean
  reason: string
  provider: string
  maxBytes: number
  accept: string
}

const DEFAULT_ATTACHMENT_CAPABILITY: AttachmentCapability = {
  allowed: true,
  reason: '',
  provider: 'memory',
  maxBytes: 10 * 1024 * 1024,
  accept: 'image/*,application/pdf,text/*,.md,.json,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx',
}

const ATTACHMENT_CAPABILITY_TTL_MS = 30_000

function normalizeCapability(payload: AttachmentCapabilityResponse | null | undefined): AttachmentCapability {
  return {
    allowed: payload?.allowed !== false,
    reason: String(payload?.reason || '').trim(),
    provider: String(payload?.provider || DEFAULT_ATTACHMENT_CAPABILITY.provider).trim() || DEFAULT_ATTACHMENT_CAPABILITY.provider,
    maxBytes: Number.isFinite(payload?.maxBytes)
      ? Math.max(1, Number(payload?.maxBytes))
      : DEFAULT_ATTACHMENT_CAPABILITY.maxBytes,
    accept: String(payload?.accept || DEFAULT_ATTACHMENT_CAPABILITY.accept).trim() || DEFAULT_ATTACHMENT_CAPABILITY.accept,
  }
}

function normalizeErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error || '')
  const text = raw.trim()
  if (!text) {
    return '附件处理失败，请稍后重试。'
  }

  if (text.includes('ATTACHMENT_UNREACHABLE')) {
    return '附件不可达：请配置可公网访问的附件 Base URL（https）后重试。'
  }
  if (text.includes('ATTACHMENT_TOO_LARGE_FOR_INLINE')) {
    return '附件过大且无法走 URL/ID 投递，请缩小文件，或先配置公网可访问附件地址。'
  }
  if (text.includes('ATTACHMENT_LOAD_FAILED')) {
    return '附件读取失败，请重新上传后重试。'
  }
  if (text.includes('file is too large')) {
    return '附件大小不能超过 10MB。'
  }
  if (text.includes('Attachments are unavailable')) {
    return '当前环境未启用附件上传，请联系管理员检查 Pilot 存储设置。'
  }

  return text
}

export function useAttachmentCapability() {
  const capability = useState<AttachmentCapability>('pilot-attachment-capability', () => ({ ...DEFAULT_ATTACHMENT_CAPABILITY }))
  const updatedAt = useState<number>('pilot-attachment-capability-updated-at', () => 0)

  async function refreshCapability(force = false): Promise<AttachmentCapability> {
    const now = Date.now()
    if (!force && now - Number(updatedAt.value || 0) < ATTACHMENT_CAPABILITY_TTL_MS) {
      return capability.value
    }

    try {
      const payload = await $fetch<AttachmentCapabilityResponse>('/api/chat/attachments/capability', {
        headers: {
          Accept: 'application/json',
        },
      })
      capability.value = normalizeCapability(payload)
      updatedAt.value = now
      return capability.value
    }
    catch {
      // Capability 探测失败时保持乐观，避免误判为“暂不支持附件”
      if (!updatedAt.value) {
        capability.value = { ...DEFAULT_ATTACHMENT_CAPABILITY }
        updatedAt.value = now
      }
      return capability.value
    }
  }

  async function ensureAttachmentAllowed(): Promise<AttachmentCapability> {
    const current = await refreshCapability()
    if (!current.allowed) {
      throw new Error(current.reason || '当前环境未启用附件上传。')
    }
    return current
  }

  return {
    capability,
    refreshCapability,
    ensureAttachmentAllowed,
    normalizeAttachmentError: normalizeErrorMessage,
  }
}
