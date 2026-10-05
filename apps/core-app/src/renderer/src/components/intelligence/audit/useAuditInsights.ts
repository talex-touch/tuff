/**
 * The audit page's one read: `getUsageInsights({ range })`, and the states around it.
 *
 * - The first load shows a skeleton (through `useDeferredLoading`, so a fast answer shows none).
 * - Every later load — a range switch, a retry, coming back to the page — keeps what is on
 *   screen until the answer replaces it. A refetch that blanks the page is a regression, not a
 *   loading state.
 * - Answers arrive in any order; only the latest request's answer is applied.
 */
import type {
  UsageInsights,
  UsageRange
} from '@talex-touch/utils/transport/sdk/domains/intelligence'
import { useDeferredLoading } from '@talex-touch/tuffex/skeleton'
import { useIntelligenceSdk } from '@talex-touch/utils/renderer'
import { computed, onActivated, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'

export const AUDIT_RANGES: readonly UsageRange[] = ['today', '7d', '30d']
export const AUDIT_DEFAULT_RANGE: UsageRange = '30d'

export function useAuditInsights() {
  const sdk = useIntelligenceSdk()

  /** The range the chips show: what was asked for, which may still be loading. */
  const range = ref<UsageRange>(AUDIT_DEFAULT_RANGE)
  const insights = shallowRef<UsageInsights | null>(null)
  /** A request is out (the first one included). */
  const pending = ref(false)
  const loadFailed = ref(false)
  /** A request is out over numbers already on screen: they stay, dimmed, until it lands. */
  const refreshing = computed(() => pending.value && insights.value !== null)

  let revision = 0
  let disposed = false
  /** KeepAlive calls `onActivated` right after the first mount too; that one is not a return. */
  let activatedOnce = false

  const firstLoadPending = computed(() => insights.value === null && !loadFailed.value)
  const showSkeleton = useDeferredLoading(firstLoadPending)
  /**
   * The loading branch: while the first answer is out, and for as long as a skeleton that did
   * appear must stay up (`minDuration`), so it never vanishes half-drawn.
   */
  const showLoadingShell = computed(() => firstLoadPending.value || showSkeleton.value)

  async function load(): Promise<void> {
    if (disposed) return
    const current = ++revision
    pending.value = true
    try {
      const next = await sdk.getUsageInsights({ range: range.value })
      if (current !== revision || disposed) return
      insights.value = next
      loadFailed.value = false
    } catch {
      if (current !== revision || disposed) return
      loadFailed.value = true
    } finally {
      if (current === revision && !disposed) pending.value = false
    }
  }

  function setRange(next: UsageRange): void {
    if (!AUDIT_RANGES.includes(next) || next === range.value) return
    range.value = next
    void load()
  }

  onMounted(() => {
    void load()
  })

  onActivated(() => {
    if (!activatedOnce) {
      activatedOnce = true
      return
    }
    // Back from another page: whatever happened meanwhile (calls, a limit change) is shown,
    // over the old numbers rather than in place of them.
    void load()
  })

  onBeforeUnmount(() => {
    disposed = true
    revision += 1
  })

  return {
    range,
    insights,
    pending,
    refreshing,
    loadFailed,
    showSkeleton,
    showLoadingShell,
    load,
    setRange
  }
}
