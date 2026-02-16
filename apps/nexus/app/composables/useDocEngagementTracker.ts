import { useDebounceFn, useEventListener } from '@vueuse/core'
import type {
  DocActionPayload,
  DocChallengePayload,
  DocEngagementSource,
  DocSectionPayload,
  DocViewSessionResponse,
} from '~/types/docs-engagement'

const FLUSH_INTERVAL_MS = 15_000
const ACTIVE_WINDOW_MS = 20_000
const SECTION_BUCKETS = 20
const MAX_ACTIONS_PER_FLUSH = 80
const MAX_HEAT_BUCKETS_PER_FLUSH = 200

interface ManualActionInput {
  type: string
  source: string
  sectionId?: string
  sectionTitle?: string
  count?: number
  textHash?: string
  text?: string
  textLength?: number
  anchorStart?: number
  anchorEnd?: number
  anchorBucket?: number
}

interface UseDocEngagementTrackerOptions {
  source: DocEngagementSource
  path: () => string
  title?: () => string
  clientId?: () => string
  enabled?: () => boolean
  contentSelector?: string
  sectionSelector?: string
  trackSections?: boolean
  captureSelection?: boolean
  onViewTracked?: (views: number) => void
}

interface RuntimeSection {
  id: string
  title: string
  headingEl: HTMLElement | null
  nextHeadingEl: HTMLElement | null
  activeMs: number
  totalMs: number
  buckets: Map<number, { activeMs: number, totalMs: number }>
}

interface SessionState {
  sessionId: string
  token: string
  challenge: DocChallengePayload | null
  riskLevel: number
}

function normalizeDocPath(path: string): string {
  return path.replace(/^\/+|\/+$/g, '').toLowerCase()
}

function normalizeSource(value: unknown): DocEngagementSource {
  return value === 'doc_comments_admin' ? 'doc_comments_admin' : 'docs_page'
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object')
    return JSON.stringify(value)

  if (Array.isArray(value))
    return `[${value.map(stableSerialize).join(',')}]`

  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a.localeCompare(b),
  )

  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`).join(',')}}`
}

async function sha256Hex(value: string): Promise<string> {
  if (!import.meta.client)
    return ''
  if (!globalThis.crypto?.subtle)
    throw new Error('WebCrypto unavailable')
  const bytes = new TextEncoder().encode(value)
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('')
}

function randomNonce() {
  if (!import.meta.client)
    return `${Date.now()}`
  if (globalThis.crypto?.randomUUID)
    return globalThis.crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
}

function clampInt(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value)))
}

function normalizeAction(action: DocActionPayload): DocActionPayload {
  const type = action.type.trim().toLowerCase().slice(0, 24)
  const source = action.source.trim().toLowerCase().slice(0, 24)
  const sectionId = (action.sectionId || 'root').trim().toLowerCase().slice(0, 120) || 'root'
  const sectionTitle = (action.sectionTitle || '').trim().slice(0, 200)
  return {
    type,
    source,
    sectionId,
    sectionTitle,
    count: clampInt(action.count || 0, 0, 10_000),
    textHash: action.textHash?.trim().toLowerCase().slice(0, 128) || '',
    textLength: action.textLength ? clampInt(action.textLength, 0, 200_000) : 0,
    anchorStart: typeof action.anchorStart === 'number' ? Math.max(0, Math.round(action.anchorStart)) : 0,
    anchorEnd: typeof action.anchorEnd === 'number' ? Math.max(0, Math.round(action.anchorEnd)) : 0,
    anchorBucket: typeof action.anchorBucket === 'number' ? clampInt(action.anchorBucket, 0, SECTION_BUCKETS - 1) : -1,
  }
}

function sumSectionHeatBuckets(sections: DocSectionPayload[]) {
  return sections.reduce((sum, section) => {
    return sum + (section.buckets?.length ?? 0)
  }, 0)
}

function trimHeatBuckets(sections: DocSectionPayload[], limit: number): DocSectionPayload[] {
  if (!sections.length)
    return sections

  const ranked: Array<{ sectionIndex: number, bucketIndex: number, score: number }> = []
  sections.forEach((section, sectionIndex) => {
    section.buckets?.forEach((bucket, bucketIndex) => {
      ranked.push({
        sectionIndex,
        bucketIndex,
        score: bucket.activeMs + bucket.totalMs,
      })
    })
  })

  if (ranked.length <= limit)
    return sections

  ranked.sort((a, b) => b.score - a.score)
  const keepSet = new Set(ranked.slice(0, limit).map(entry => `${entry.sectionIndex}:${entry.bucketIndex}`))

  return sections.map((section, sectionIndex) => {
    if (!section.buckets?.length)
      return section
    const buckets = section.buckets.filter((_, bucketIndex) => keepSet.has(`${sectionIndex}:${bucketIndex}`))
    return { ...section, buckets }
  })
}

async function minePowNonce(proof: string, difficulty: number): Promise<string> {
  if (difficulty <= 0)
    return ''

  const prefix = '0'.repeat(difficulty)
  for (let attempt = 0; attempt < 300_000; attempt++) {
    const candidate = attempt.toString(36)
    const digest = await sha256Hex(`${proof}${candidate}`)
    if (digest.startsWith(prefix))
      return candidate
    if (attempt % 500 === 0)
      await Promise.resolve()
  }

  return ''
}

export function useDocEngagementTracker(options: UseDocEngagementTrackerOptions) {
  const route = useRoute()
  const viewCount = ref<number | null>(null)
  const session = ref<SessionState | null>(null)
  const sections = ref<RuntimeSection[]>([])
  const actionQueue = ref<DocActionPayload[]>([])

  const sourceType = computed(() => normalizeSource(options.source))
  const normalizedPath = computed(() => normalizeDocPath(options.path() || ''))
  const normalizedTitle = computed(() => (options.title?.() || '').trim().slice(0, 200))
  const clientId = computed(() => (options.clientId?.() || '').trim())
  const isEnabled = computed(() => options.enabled?.() ?? true)
  const trackSections = computed(() => options.trackSections ?? sourceType.value === 'docs_page')
  const captureSelection = computed(() => options.captureSelection ?? sourceType.value === 'docs_page')
  const sectionSelector = computed(() => options.sectionSelector ?? '.docs-prose h1, .docs-prose h2, .docs-prose h3, .docs-prose h4')
  const contentSelector = computed(() => options.contentSelector ?? '.docs-prose')

  const hasSession = computed(() => Boolean(session.value?.sessionId && session.value?.token))

  let totalDurationMs = 0
  let activeDurationMs = 0
  let lastTickAt = 0
  let lastInteractionAt = 0
  let flushTimer: ReturnType<typeof setInterval> | null = null
  let flushInFlight = false
  let flushPending = false
  let initInFlight = false
  let sessionRecovering = false
  let lastSelectionFingerprint = ''

  function getContentRoot() {
    if (!import.meta.client)
      return null
    return document.querySelector<HTMLElement>(contentSelector.value)
  }

  function resetRuntimeStats() {
    totalDurationMs = 0
    activeDurationMs = 0
    for (const section of sections.value) {
      section.activeMs = 0
      section.totalMs = 0
      section.buckets.clear()
    }
  }

  function resetState() {
    session.value = null
    actionQueue.value = []
    sections.value = []
    resetRuntimeStats()
    lastSelectionFingerprint = ''
  }

  function ensureRootSection() {
    if (!sections.value.length) {
      sections.value = [{
        id: 'root',
        title: 'Root',
        headingEl: null,
        nextHeadingEl: null,
        activeMs: 0,
        totalMs: 0,
        buckets: new Map(),
      }]
    }
  }

  function refreshSections() {
    if (!import.meta.client)
      return

    if (!trackSections.value) {
      ensureRootSection()
      return
    }

    const root = getContentRoot()
    if (!root) {
      ensureRootSection()
      return
    }

    const headings = Array.from(root.querySelectorAll<HTMLElement>(sectionSelector.value))
      .filter((heading) => {
        return Boolean(heading.id?.trim())
      })

    if (!headings.length) {
      ensureRootSection()
      return
    }

    sections.value = headings.map((heading, index) => ({
      id: heading.id.trim().slice(0, 120),
      title: (heading.textContent || heading.id || 'Untitled').trim().slice(0, 200),
      headingEl: heading,
      nextHeadingEl: headings[index + 1] || null,
      activeMs: 0,
      totalMs: 0,
      buckets: new Map(),
    }))
  }

  function resolveCurrentSection() {
    if (!import.meta.client || !sections.value.length)
      return { section: null as RuntimeSection | null, bucket: 0 }

    if (sections.value.length === 1 && sections.value[0]?.id === 'root')
      return { section: sections.value[0], bucket: 0 }

    const anchorY = window.scrollY + Math.round(window.innerHeight * 0.35)

    for (const section of sections.value) {
      const startY = section.headingEl
        ? section.headingEl.getBoundingClientRect().top + window.scrollY
        : 0
      const endY = section.nextHeadingEl
        ? section.nextHeadingEl.getBoundingClientRect().top + window.scrollY
        : Number.POSITIVE_INFINITY

      if (anchorY < startY || anchorY >= endY)
        continue

      const span = Math.max(1, endY - startY)
      const ratio = Math.min(0.9999, Math.max(0, (anchorY - startY) / span))
      const bucket = clampInt(Math.floor(ratio * SECTION_BUCKETS), 0, SECTION_BUCKETS - 1)
      return { section, bucket }
    }

    const fallback = sections.value[sections.value.length - 1] || null
    return { section: fallback, bucket: SECTION_BUCKETS - 1 }
  }

  function applyElapsed(now = Date.now()) {
    if (!import.meta.client)
      return

    if (!lastTickAt) {
      lastTickAt = now
      return
    }

    const elapsed = now - lastTickAt
    lastTickAt = now

    if (elapsed <= 0 || document.hidden)
      return

    totalDurationMs += elapsed
    const active = now - lastInteractionAt <= ACTIVE_WINDOW_MS
    if (active)
      activeDurationMs += elapsed

    const { section, bucket } = resolveCurrentSection()
    if (!section)
      return

    section.totalMs += elapsed
    if (active)
      section.activeMs += elapsed

    const current = section.buckets.get(bucket) || { activeMs: 0, totalMs: 0 }
    current.totalMs += elapsed
    if (active)
      current.activeMs += elapsed
    section.buckets.set(bucket, current)
  }

  function markInteraction() {
    lastInteractionAt = Date.now()
  }

  function resolveSectionTitle(sectionId?: string) {
    const id = (sectionId || 'root').trim().toLowerCase()
    const section = sections.value.find(item => item.id === id)
    return section?.title || ''
  }

  function actionKey(action: DocActionPayload) {
    return [
      action.type,
      action.source,
      action.sectionId,
      action.textHash || '',
      action.anchorStart ?? '',
      action.anchorEnd ?? '',
      action.anchorBucket ?? '',
    ].join('|')
  }

  function enqueueAction(action: DocActionPayload) {
    const normalized = normalizeAction(action)
    if (!normalized.type || !normalized.source || !normalized.count)
      return

    const key = actionKey(normalized)
    const hit = actionQueue.value.find(item => actionKey(item) === key)
    if (hit) {
      hit.count = clampInt(hit.count + normalized.count, 0, 10_000)
      return
    }

    actionQueue.value.push(normalized)
  }

  function createRangeForSection(section: RuntimeSection, root: HTMLElement): Range {
    const sectionRange = document.createRange()
    if (section.headingEl)
      sectionRange.setStartBefore(section.headingEl)
    else
      sectionRange.setStart(root, 0)

    if (section.nextHeadingEl)
      sectionRange.setEndBefore(section.nextHeadingEl)
    else if (root.lastChild)
      sectionRange.setEndAfter(root.lastChild)
    else
      sectionRange.setEnd(root, 0)

    return sectionRange
  }

  function resolveSectionByPoint(root: HTMLElement, node: Node, offset: number): RuntimeSection | null {
    if (!sections.value.length)
      return null

    if (sections.value.length === 1 && sections.value[0]?.id === 'root')
      return sections.value[0]

    const pointRange = document.createRange()
    const normalizedOffset = Math.max(0, Math.min(offset, node.nodeType === Node.TEXT_NODE ? (node.textContent?.length || 0) : node.childNodes.length))
    pointRange.setStart(node, normalizedOffset)
    pointRange.collapse(true)

    for (const section of sections.value) {
      const sectionRange = createRangeForSection(section, root)
      const afterStart = pointRange.compareBoundaryPoints(Range.START_TO_START, sectionRange) >= 0
      const beforeEnd = pointRange.compareBoundaryPoints(Range.START_TO_END, sectionRange) <= 0
      if (afterStart && beforeEnd)
        return section
    }

    return sections.value[sections.value.length - 1] || null
  }

  function computeOffsetInSection(range: Range, node: Node, offset: number): number {
    const probe = range.cloneRange()
    const normalizedOffset = Math.max(0, Math.min(offset, node.nodeType === Node.TEXT_NODE ? (node.textContent?.length || 0) : node.childNodes.length))
    probe.setEnd(node, normalizedOffset)
    return Math.max(0, probe.toString().length)
  }

  async function buildSelectionAction(actionType: 'copy' | 'select'): Promise<DocActionPayload | null> {
    if (!import.meta.client)
      return null

    const root = getContentRoot()
    const selection = window.getSelection()

    if (!root || !selection || selection.rangeCount < 1 || selection.isCollapsed)
      return null

    const range = selection.getRangeAt(0)
    const selectionText = selection.toString().replace(/\s+/g, ' ').trim()
    if (!selectionText)
      return null

    const commonAncestor = range.commonAncestorContainer
    if (!(commonAncestor instanceof Node))
      return null

    const ancestorElement = commonAncestor.nodeType === Node.ELEMENT_NODE
      ? commonAncestor as Element
      : commonAncestor.parentElement

    if (!ancestorElement || !root.contains(ancestorElement))
      return null

    const section = resolveSectionByPoint(root, range.startContainer, range.startOffset) || {
      id: 'root',
      title: 'Root',
      headingEl: null,
      nextHeadingEl: null,
      activeMs: 0,
      totalMs: 0,
      buckets: new Map(),
    }

    const sectionRange = createRangeForSection(section, root)
    const anchorStart = computeOffsetInSection(sectionRange, range.startContainer, range.startOffset)
    const anchorEnd = computeOffsetInSection(sectionRange, range.endContainer, range.endOffset)
    const sectionTextLength = Math.max(1, sectionRange.toString().length)
    const anchorRatio = Math.min(0.9999, Math.max(0, anchorStart / sectionTextLength))
    const anchorBucket = clampInt(Math.floor(anchorRatio * SECTION_BUCKETS), 0, SECTION_BUCKETS - 1)

    const textHash = await sha256Hex(selectionText.slice(0, 5000))

    return normalizeAction({
      type: actionType,
      source: 'selection',
      sectionId: section.id,
      sectionTitle: section.title,
      count: 1,
      textHash,
      textLength: selectionText.length,
      anchorStart,
      anchorEnd,
      anchorBucket,
    })
  }

  const recordSelection = useDebounceFn(async () => {
    if (!captureSelection.value || !isEnabled.value || !hasSession.value)
      return

    try {
      const action = await buildSelectionAction('select')
      if (!action)
        return

      const fingerprint = `${action.sectionId}|${action.textHash || ''}|${action.anchorStart ?? ''}|${action.anchorEnd ?? ''}`
      if (fingerprint && fingerprint === lastSelectionFingerprint)
        return

      lastSelectionFingerprint = fingerprint
      enqueueAction(action)
      markInteraction()
    }
    catch (error) {
      console.warn('[docs-engagement] record selection failed', error)
    }
  }, 260)

  async function recordCopyFromSelection() {
    if (!captureSelection.value || !isEnabled.value || !hasSession.value)
      return

    try {
      const action = await buildSelectionAction('copy')
      if (!action)
        return
      enqueueAction(action)
      markInteraction()
    }
    catch (error) {
      console.warn('[docs-engagement] record copy failed', error)
    }
  }

  async function recordAction(input: ManualActionInput) {
    if (!isEnabled.value || !hasSession.value)
      return

    const sectionId = (input.sectionId || 'root').trim().toLowerCase() || 'root'
    const sectionTitle = (input.sectionTitle || '').trim()
    let textHash = input.textHash?.trim().toLowerCase()

    if (!textHash && input.text) {
      const sanitized = input.text.replace(/\s+/g, ' ').trim()
      if (sanitized)
        textHash = await sha256Hex(sanitized.slice(0, 5000))
    }

    enqueueAction({
      type: input.type,
      source: input.source,
      sectionId,
      sectionTitle,
      count: Math.max(1, Math.round(input.count || 1)),
      textHash,
      textLength: input.textLength ?? (input.text ? input.text.replace(/\s+/g, ' ').trim().length : undefined),
      anchorStart: input.anchorStart,
      anchorEnd: input.anchorEnd,
      anchorBucket: input.anchorBucket,
    })

    markInteraction()
  }

  async function recordJump(sectionId: string, source = 'hash') {
    if (!sectionId)
      return
    await recordAction({
      type: 'jump',
      source,
      sectionId,
      sectionTitle: resolveSectionTitle(sectionId),
      count: 1,
    })
  }

  function flushableSectionPayload() {
    const payload = sections.value.map<DocSectionPayload>((section) => {
      const buckets = Array.from(section.buckets.entries())
        .map(([bucket, value]) => ({
          bucket,
          activeMs: Math.max(0, Math.round(value.activeMs)),
          totalMs: Math.max(0, Math.round(value.totalMs)),
        }))
        .filter(item => item.activeMs > 0 || item.totalMs > 0)
      return {
        id: section.id,
        title: section.title,
        activeMs: Math.max(0, Math.round(section.activeMs)),
        totalMs: Math.max(0, Math.round(section.totalMs)),
        buckets,
      }
    }).filter(section => section.activeMs > 0 || section.totalMs > 0 || (section.buckets?.length ?? 0) > 0)

    return trimHeatBuckets(payload, MAX_HEAT_BUCKETS_PER_FLUSH)
  }

  async function flush(reason = 'interval') {
    if (!import.meta.client || !hasSession.value)
      return

    applyElapsed(Date.now())

    if (flushInFlight) {
      flushPending = true
      return
    }

    const sectionsPayload = flushableSectionPayload()
    const actionsPayload = actionQueue.value.slice(0, MAX_ACTIONS_PER_FLUSH)
    const hasOverflowActions = actionQueue.value.length > actionsPayload.length
    const hasOverflowBuckets = sumSectionHeatBuckets(sectionsPayload) > MAX_HEAT_BUCKETS_PER_FLUSH

    const snapshotActiveMs = Math.max(0, Math.round(activeDurationMs))
    const snapshotTotalMs = Math.max(0, Math.round(totalDurationMs))

    if (!snapshotActiveMs && !snapshotTotalMs && !actionsPayload.length && !sectionsPayload.length)
      return

    const payloadForHash = {
      path: normalizedPath.value,
      title: normalizedTitle.value,
      source: sourceType.value,
      activeMs: snapshotActiveMs,
      totalMs: snapshotTotalMs,
      sections: sectionsPayload,
      actions: actionsPayload,
    }

    const payloadHash = await sha256Hex(stableSerialize(payloadForHash))
    const nonce = randomNonce()

    let proof = ''
    let powNonce = ''

    if (session.value?.challenge) {
      proof = await sha256Hex(`${session.value.challenge.seed}${nonce}${payloadHash}`)
      if ((session.value.challenge.difficulty || 0) > 0)
        powNonce = await minePowNonce(proof, session.value.challenge.difficulty)
    }

    const requestBody: Record<string, unknown> = {
      path: normalizedPath.value,
      title: normalizedTitle.value,
      source: sourceType.value,
      sessionId: session.value?.sessionId,
      token: session.value?.token,
      clientId: clientId.value,
      nonce,
      payloadHash,
      proof,
      powNonce,
      activeDurationMs: snapshotActiveMs,
      totalDurationMs: snapshotTotalMs,
      sections: sectionsPayload,
      actions: actionsPayload,
      reason,
      truncated: hasOverflowActions || hasOverflowBuckets,
    }

    flushInFlight = true
    try {
      await $fetch('/api/docs/engagement', {
        method: 'POST',
        body: requestBody,
      })

      resetRuntimeStats()
      actionQueue.value = actionQueue.value.slice(actionsPayload.length)
    }
    catch (error) {
      console.warn('[docs-engagement] flush failed', error)
      const statusCode = Number(
        (error as any)?.statusCode
        ?? (error as any)?.data?.statusCode
        ?? (error as any)?.response?.status
        ?? 0,
      )
      const statusMessage = String(
        (error as any)?.statusMessage
        ?? (error as any)?.data?.statusMessage
        ?? (error as any)?.message
        ?? '',
      )
      const needsSessionRecovery = statusCode === 403
        || statusCode === 404
        || statusMessage.includes('Invalid token')
        || statusMessage.includes('Session not found')
        || statusMessage.includes('Invalid source')

      if (needsSessionRecovery && !sessionRecovering) {
        sessionRecovering = true
        resetState()
        await initSession()
        sessionRecovering = false
      }
    }
    finally {
      flushInFlight = false
      if (flushPending) {
        flushPending = false
        void flush('pending')
      }
    }
  }

  async function initSession() {
    if (!import.meta.client || !isEnabled.value)
      return

    const path = normalizedPath.value
    if (!path)
      return

    const cid = clientId.value
    if (!cid)
      return

    if (initInFlight)
      return

    initInFlight = true
    try {
      const result = await $fetch<DocViewSessionResponse>('/api/docs/view', {
        method: 'POST',
        body: {
          path,
          title: normalizedTitle.value,
          source: sourceType.value,
          clientId: cid,
        },
      })

      viewCount.value = typeof result?.views === 'number' ? result.views : viewCount.value
      if (typeof result?.views === 'number')
        options.onViewTracked?.(result.views)

      if (result?.sessionId && result?.token) {
        session.value = {
          sessionId: result.sessionId,
          token: result.token,
          challenge: result.challenge || null,
          riskLevel: Number(result.riskLevel || 0),
        }
      }
      else {
        session.value = null
      }

      resetRuntimeStats()
      refreshSections()
      lastInteractionAt = Date.now()
      lastTickAt = Date.now()
    }
    catch (error) {
      console.warn('[docs-engagement] init session failed', error)
      session.value = null
    }
    finally {
      initInFlight = false
    }
  }

  function startTimer() {
    if (!import.meta.client || flushTimer)
      return

    flushTimer = setInterval(() => {
      void flush('interval')
    }, FLUSH_INTERVAL_MS)
  }

  function stopTimer() {
    if (!flushTimer)
      return
    clearInterval(flushTimer)
    flushTimer = null
  }

  if (import.meta.client) {
    onMounted(() => {
      refreshSections()

      useEventListener(window, 'scroll', markInteraction, { passive: true })
      useEventListener(window, 'pointerdown', markInteraction, { passive: true })
      useEventListener(window, 'keydown', markInteraction)
      useEventListener(window, 'touchstart', markInteraction, { passive: true })
      useEventListener(window, 'mousemove', useDebounceFn(markInteraction, 400), { passive: true })

      useEventListener(window, 'resize', () => {
        refreshSections()
      }, { passive: true })

      useEventListener(document, 'visibilitychange', () => {
        if (document.hidden)
          void flush('visibility-hidden')
        else
          markInteraction()
      })

      useEventListener(window, 'beforeunload', () => {
        void flush('beforeunload')
      })
      useEventListener(window, 'pagehide', () => {
        void flush('pagehide')
      })

      useEventListener(document, 'selectionchange', () => {
        if (!captureSelection.value)
          return
        void recordSelection()
      })

      useEventListener(document, 'copy', () => {
        if (!captureSelection.value)
          return
        void recordCopyFromSelection()
      })

      useEventListener(window, 'hashchange', () => {
        const raw = window.location.hash.replace(/^#/, '')
        if (!raw)
          return
        const sectionId = decodeURIComponent(raw).trim().toLowerCase()
        if (!sectionId)
          return
        void recordJump(sectionId, 'hashchange')
      })

      useEventListener(document, 'click', (event) => {
        const target = event.target as HTMLElement | null
        const anchor = target?.closest?.('a[href^="#"]') as HTMLAnchorElement | null
        if (!anchor)
          return
        const href = anchor.getAttribute('href') || ''
        const raw = href.replace(/^#/, '')
        if (!raw)
          return
        const sectionId = decodeURIComponent(raw).trim().toLowerCase()
        if (!sectionId)
          return
        void recordJump(sectionId, 'anchor_click')
      }, { passive: true })

      const initialHash = window.location.hash.replace(/^#/, '')
      if (initialHash) {
        const sectionId = decodeURIComponent(initialHash).trim().toLowerCase()
        if (sectionId)
          void recordJump(sectionId, 'initial_hash')
      }
    })

    onBeforeUnmount(() => {
      void flush('unmount')
      stopTimer()
    })

    watch(
      () => [normalizedPath.value, sourceType.value, clientId.value, isEnabled.value],
      async (_, __, onCleanup) => {
        let cancelled = false
        onCleanup(() => {
          cancelled = true
        })

        if (!isEnabled.value) {
          stopTimer()
          return
        }

        await flush('session-change')
        if (cancelled)
          return

        resetState()
        await initSession()
        if (!cancelled)
          startTimer()
      },
      { immediate: true },
    )

    watch(
      () => route.fullPath,
      async () => {
        if (!isEnabled.value)
          return
        await flush('route-change')
        refreshSections()
      },
    )
  }

  return {
    viewCount: readonly(viewCount),
    hasSession,
    flush,
    recordAction,
    refreshSections,
    stableSerialize,
    sha256Hex,
  }
}
