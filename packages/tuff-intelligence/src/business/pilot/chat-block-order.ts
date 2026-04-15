export interface PilotChatBlockLike {
  type?: unknown
  data?: unknown
  extra?: unknown
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }
  return value as Record<string, unknown>
}

function toPositiveInteger(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0
  }
  return Math.floor(parsed)
}

export function toPilotChatBlockSeq(block: PilotChatBlockLike): number {
  const extra = toRecord(block.extra)
  const extraSeq = toPositiveInteger(extra.seq)
  if (extraSeq > 0) {
    return extraSeq
  }

  if (String(block.type || '').trim().toLowerCase() !== 'card') {
    return 0
  }

  try {
    const payload = JSON.parse(String(block.data || '')) as Record<string, unknown>
    return toPositiveInteger(payload.seq)
  }
  catch {
    return 0
  }
}

export function toPilotChatBlockStreamOrder(block: PilotChatBlockLike): number {
  const extra = toRecord(block.extra)
  return toPositiveInteger(extra.streamOrder)
}

export function sortPilotChatBlocksByTimeline<T extends PilotChatBlockLike>(blocks: T[]): T[] {
  if (!Array.isArray(blocks) || blocks.length <= 1) {
    return blocks
  }

  const list = blocks.map((block, index) => ({
    block,
    index,
    seq: toPilotChatBlockSeq(block),
    order: toPilotChatBlockStreamOrder(block),
  }))

  if (!list.some(item => item.seq > 0 || item.order > 0)) {
    return blocks
  }

  return list
    .slice()
    .sort((left, right) => {
      if (left.seq > 0 && right.seq > 0 && left.seq !== right.seq) {
        return left.seq - right.seq
      }
      if (left.seq > 0 && right.seq <= 0) {
        return -1
      }
      if (left.seq <= 0 && right.seq > 0) {
        return 1
      }
      if (left.order > 0 && right.order > 0 && left.order !== right.order) {
        return left.order - right.order
      }
      if (left.order > 0 && right.order <= 0) {
        return -1
      }
      if (left.order <= 0 && right.order > 0) {
        return 1
      }
      return left.index - right.index
    })
    .map(item => item.block)
}
