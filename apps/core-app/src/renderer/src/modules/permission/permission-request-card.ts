import { markRaw } from 'vue'
import { toast } from 'vue-sonner'
import { INSTALL_CONFIRM_BUDGET_MS } from '@talex-touch/utils/plugin/install-budgets'
import PermissionRequestToast, {
  type PermissionRequestToastAction,
  type PermissionRequestToastItem
} from '~/components/permission/PermissionRequestToast.vue'
import type { Translate } from '~/modules/lang'

export type PermissionRequestDecision = 'deny' | 'session' | 'always'

export interface PermissionRequestCardPermission {
  id: string
  reason?: string
}

export interface PermissionRequestCardOptions {
  /**
   * 提问的稳定身份：插件 id ＋ 它要的权限集合。
   *
   * 文案里只有插件的**显示名**，而两个插件可能重名，两个提问方连显示名都不一定一致（安装侧取
   * `clientMetadata.pluginName`，门禁侧取 manifest 的 `name`），所以显示文本不能当身份：否则后来者
   * 会读到用户为**另一个插件**做出的答复，而启动门禁正是拿这条答复去给 `request.pluginId` 放行。
   */
  identity: string
  title: string
  message: string
  permissions: PermissionRequestCardPermission[]
  timeoutText?: string
  timeoutMs?: number
  actionLabels: Record<PermissionRequestDecision, string>
  duration?: number
  onDismiss?: () => PermissionRequestDecision
  t: Translate
}

export interface PermissionRequestCardResult {
  id: string | number
  result: Promise<PermissionRequestDecision>
}

/**
 * The install confirmation budget: the main process waits for this prompt, so the install's
 * transport deadline is derived from it (see `install-budgets.ts` in `@talex-touch/utils/plugin`).
 */
export const PERMISSION_REQUEST_TIMEOUT_MS = INSTALL_CONFIRM_BUDGET_MS

export function resolvePermissionDisplayName(permissionId: string, t: Translate): string {
  const key = `plugin.permissions.registry.${permissionId}.name`
  const translated = t(key)
  return translated === key ? permissionId : translated
}

export function buildPermissionRequestItems(
  permissions: PermissionRequestCardPermission[],
  t: Translate
): PermissionRequestToastItem[] {
  return permissions.map((permission) => ({
    id: permission.id,
    name: resolvePermissionDisplayName(permission.id, t),
    reason: permission.reason
  }))
}

/**
 * Identity of one permission question: the plugin plus the permission set it asks for, order-free.
 *
 * Both flows that ask build it this way — the install confirmation (`kind: 'permissions'`) and the
 * enable-time gate (`permission:startup-request`) — and both ask about the plugin's missing required
 * set, so the same plugin asking for the same set is one question. Anything else is a different one:
 * a second plugin, or a different set, must not read back a decision the user made about something
 * else.
 */
export function permissionRequestIdentity(
  pluginId: string,
  permissionIds: readonly string[]
): string {
  return `${pluginId}\u0000${[...new Set(permissionIds)].sort().join(',')}`
}

/**
 * Prompts that are on screen right now, keyed by {@link permissionRequestIdentity}.
 *
 * The two flows arrive over different transports and neither knows about the other, so both used to
 * build a card: the user saw the same question twice, each counting down on its own, and answering
 * one left the other standing. A second ask for the same plugin and the same set joins the open
 * card, and both callers read the one decision, which is what each of them wants: the install
 * confirm needs the grant mode, and the gate needs the grant.
 */
const openRequests = new Map<string, PermissionRequestCardResult>()

export function showPermissionRequestCard(
  options: PermissionRequestCardOptions
): PermissionRequestCardResult {
  const requestKey = options.identity
  const openRequest = openRequests.get(requestKey)
  if (openRequest) {
    return openRequest
  }

  let resolved = false
  let toastId: string | number
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  let resolveResult: (value: PermissionRequestDecision) => void

  const result = new Promise<PermissionRequestDecision>((resolve) => {
    resolveResult = resolve
  })

  const finish = (value: PermissionRequestDecision) => {
    if (resolved) return
    resolved = true
    openRequests.delete(requestKey)
    if (timeoutId) {
      clearTimeout(timeoutId)
      timeoutId = undefined
    }
    toast.dismiss(toastId)
    resolveResult(value)
  }

  const actions: PermissionRequestToastAction[] = [
    {
      label: options.actionLabels.deny,
      tone: 'danger',
      onSelect: () => finish('deny')
    },
    {
      label: options.actionLabels.session,
      tone: 'neutral',
      onSelect: () => finish('session')
    },
    {
      label: options.actionLabels.always,
      tone: 'primary',
      onSelect: () => finish('always')
    }
  ]

  toastId = toast.custom(markRaw(PermissionRequestToast), {
    duration: options.duration ?? Infinity,
    dismissible: false,
    closeButton: false,
    componentProps: {
      title: options.title,
      message: options.message,
      permissions: buildPermissionRequestItems(options.permissions, options.t),
      timeoutText: options.timeoutText,
      actions
    },
    onDismiss: () => {
      finish(options.onDismiss?.() ?? 'deny')
    }
  })

  if (options.timeoutMs && options.timeoutMs > 0) {
    timeoutId = setTimeout(() => {
      finish('deny')
    }, options.timeoutMs)
  }

  const handle: PermissionRequestCardResult = { id: toastId, result }
  openRequests.set(requestKey, handle)
  return handle
}
