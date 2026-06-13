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

export const PERMISSION_REQUEST_TIMEOUT_MS = 30_000

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

export function showPermissionRequestCard(
  options: PermissionRequestCardOptions
): PermissionRequestCardResult {
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

  return { id: toastId, result }
}
