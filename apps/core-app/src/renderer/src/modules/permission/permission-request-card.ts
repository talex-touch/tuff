import { markRaw } from 'vue'
import { toast } from 'vue-sonner'
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

export const PERMISSION_REQUEST_TIMEOUT_MS = 120_000

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
 * Prompts that are on screen right now, keyed by the question they ask.
 *
 * Two flows ask about one plugin's permissions: the install confirmation
 * (`kind: 'permissions'` in the install manager) and the enable-time startup gate
 * (`permission:startup-request`). They arrive over different transports and neither knows about the
 * other, so both used to build a card: the user saw the same question twice, each counting down on
 * its own, and answering one left the other standing.
 *
 * The identity is the question itself, because the copy already names the plugin. A second ask for
 * the same plugin joins the open card and both callers read the one decision, which is also what
 * each of them wants: the install confirm needs the grant mode, and the gate needs the grant.
 */
const openRequests = new Map<string, PermissionRequestCardResult>()

export function showPermissionRequestCard(
  options: PermissionRequestCardOptions
): PermissionRequestCardResult {
  const requestKey = `${options.title}\u0000${options.message}`
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
