import type { AdminFormat } from '~/composables/useAdminFormat'
import type { ProviderRegistryAdmin } from '~/composables/useProviderRegistryAdmin'
import type { ProviderDrawerMode, RegistryTranslate, SceneDrawerMode } from '~/utils/admin-provider-registry'
import type { ProviderRegistryRecord, SceneRegistryRecord } from '~/utils/provider-registry-admin'
import { reactive, ref, shallowRef } from 'vue'
import { useToast } from '~/composables/useToast'
import { bindingsRemovedBySave, capabilitiesRemovedBySave } from '~/utils/admin-provider-registry'

/**
 * What the provider registry panel does when the operator acts: which drawer is
 * open and for what, what needs confirming first, and when a save may close
 * the drawer it came from. The panel only binds it, so every rule here is
 * tested without a DOM.
 *
 * - Switching a provider or a route on or off (both ways), a real 执行, a save
 *   that deletes capabilities or bindings, and every delete go through one
 *   `AdminConfirmDialog`. Cancelling sends nothing.
 * - 试运行 and 检查 do not ask: neither bills (检查 sends one small probe).
 * - Every drawer opening takes a new token; a save closes its drawer only when
 *   that drawer is still the one it was started from. A save that fails after
 *   its drawer was closed, or opened for something else, says so in a toast:
 *   no drawer is left to show the error.
 */
export function useProviderRegistryPanel(admin: ProviderRegistryAdmin, t: RegistryTranslate, format: Pick<AdminFormat, 'number'>) {
  const toast = useToast()

  function providerName(providerId: string): string {
    return admin.providers.value.find(provider => provider.id === providerId)?.displayName ?? providerId
  }

  function joinList(items: string[]): string {
    return items.join(t('dashboard.providerRegistry.form.listSeparator', ', '))
  }

  // ─── Confirmation ──────────────────────────────────────────────────────────
  // Switching a provider or a route on or off, a real 执行, a save that deletes
  // capabilities or bindings, and every delete ask first. Cancelling sends nothing.

  interface PendingConfirm {
    title: string
    description: string
    confirmLabel: string
    tone: 'danger' | 'warning'
    run: () => Promise<unknown>
  }

  const confirmOpen = ref(false)
  const confirmLoading = ref(false)
  const pendingConfirm = shallowRef<PendingConfirm | null>(null)

  function requestConfirm(pending: PendingConfirm) {
    pendingConfirm.value = pending
    confirmOpen.value = true
  }

  // Closing keeps `pendingConfirm`: the dialog fades out with its own title and
  // text instead of blanking first. `runConfirmed` only runs an open dialog's.
  function setConfirmOpen(open: boolean) {
    // The dialog stays up while its action runs.
    if (confirmLoading.value)
      return
    confirmOpen.value = open
  }

  async function runConfirmed() {
    const pending = pendingConfirm.value
    if (!pending || !confirmOpen.value || confirmLoading.value)
      return
    confirmLoading.value = true
    try {
      await pending.run()
    }
    finally {
      confirmLoading.value = false
      confirmOpen.value = false
    }
  }

  /** A failed save whose drawer is gone: the error it would have shown, as a toast. */
  function reportUnseenFailure(saved: boolean) {
    if (!saved)
      toast.warning(admin.lastSaveError.value ?? t('dashboard.providerRegistry.errors.saveFailed', 'The change was not saved.'))
  }

  // ─── Provider drawer: create, edit, quota ──────────────────────────────────
  // Every opening takes a new token. A save closes the drawer only when it is
  // still the drawer that started it: a save that finishes after the operator
  // opened another record's drawer leaves that drawer open.

  const providerDrawer = reactive({
    open: false,
    mode: 'create' as ProviderDrawerMode,
    provider: null as ProviderRegistryRecord | null,
    token: 0,
  })

  function openProviderDrawer(mode: ProviderDrawerMode, provider: ProviderRegistryRecord | null) {
    if (provider && mode === 'edit')
      admin.resetProviderEditPanel(provider)
    if (provider && mode === 'quota')
      admin.resetProviderQuotaPanel(provider)
    if (mode === 'create')
      admin.providerCreateError.value = null
    providerDrawer.token += 1
    providerDrawer.mode = mode
    providerDrawer.provider = provider
    providerDrawer.open = true
  }

  function closeProviderDrawer() {
    providerDrawer.token += 1
    providerDrawer.open = false
  }

  /**
   * The drawer's `update:open`. Its own ways out (Escape, ×, the mask) end it as
   * 取消 does, with a new token: a save still running then reports a failure in
   * a toast instead of into a drawer no one sees.
   */
  function setProviderDrawerOpen(open: boolean) {
    if (!open)
      closeProviderDrawer()
  }

  async function saveProviderDrawer() {
    const token = providerDrawer.token
    const { mode, provider } = providerDrawer
    let saved = false
    if (mode === 'create')
      saved = await admin.createProvider()
    else if (mode === 'edit' && provider)
      saved = await admin.saveProviderEdit(provider)
    else if (mode === 'quota' && provider)
      saved = await admin.saveProviderQuota(provider)
    if (token !== providerDrawer.token)
      reportUnseenFailure(saved)
    else if (saved)
      closeProviderDrawer()
  }

  function submitProviderDrawer() {
    const { mode, provider } = providerDrawer
    if (mode === 'edit' && provider) {
      const removed = capabilitiesRemovedBySave(provider, admin.getProviderEditPanel(provider))
      if (removed.length) {
        const list = joinList(removed.map(capability => capability.capability))
        requestConfirm({
          title: t('dashboard.providerRegistry.providers.removeCapabilitiesTitle', 'Delete capabilities'),
          description: t(
            'dashboard.providerRegistry.providers.removeCapabilitiesConfirm',
            { provider: provider.displayName, list },
            `Saving deletes these capabilities from "${provider.displayName}": ${list}. This cannot be undone.`,
          ),
          confirmLabel: t('dashboard.providerRegistry.actions.saveAndDelete', 'Save and delete'),
          tone: 'danger',
          run: saveProviderDrawer,
        })
        return
      }
    }
    void saveProviderDrawer()
  }

  // ─── Scene drawer: create, edit, run ───────────────────────────────────────

  const sceneDrawer = reactive({
    open: false,
    mode: 'create' as SceneDrawerMode,
    scene: null as SceneRegistryRecord | null,
    token: 0,
  })

  function openSceneDrawer(mode: SceneDrawerMode, scene: SceneRegistryRecord | null) {
    if (scene && mode === 'edit')
      admin.resetSceneEditPanel(scene)
    if (scene && mode === 'run')
      admin.getSceneRunPanel(scene)
    if (mode === 'create')
      admin.sceneCreateError.value = null
    sceneDrawer.token += 1
    sceneDrawer.mode = mode
    sceneDrawer.scene = scene
    sceneDrawer.open = true
  }

  function closeSceneDrawer() {
    sceneDrawer.token += 1
    sceneDrawer.open = false
  }

  /** The scene drawer's `update:open`, as `setProviderDrawerOpen`. */
  function setSceneDrawerOpen(open: boolean) {
    if (!open)
      closeSceneDrawer()
  }

  async function saveSceneDrawer() {
    const token = sceneDrawer.token
    const { mode, scene } = sceneDrawer
    let saved = false
    if (mode === 'create')
      saved = await admin.createScene()
    else if (mode === 'edit' && scene)
      saved = await admin.saveSceneEdit(scene)
    if (token !== sceneDrawer.token)
      reportUnseenFailure(saved)
    else if (saved)
      closeSceneDrawer()
  }

  function submitSceneDrawer() {
    const { mode, scene } = sceneDrawer
    if (mode === 'edit' && scene) {
      const removed = bindingsRemovedBySave(scene, admin.getSceneEditPanel(scene))
      if (removed.length) {
        const list = joinList(removed.map(binding => `${providerName(binding.providerId)} · ${binding.capability}`))
        requestConfirm({
          title: t('dashboard.providerRegistry.scenes.removeBindingsTitle', 'Delete bindings'),
          description: t(
            'dashboard.providerRegistry.scenes.removeBindingsConfirm',
            { scene: scene.displayName, list },
            `Saving deletes these bindings from "${scene.displayName}": ${list}. This cannot be undone.`,
          ),
          confirmLabel: t('dashboard.providerRegistry.actions.saveAndDelete', 'Save and delete'),
          tone: 'danger',
          run: saveSceneDrawer,
        })
        return
      }
    }
    void saveSceneDrawer()
  }

  function confirmExecute() {
    const scene = sceneDrawer.scene
    if (!scene)
      return
    requestConfirm({
      title: t('dashboard.providerRegistry.routes.executeTitle', 'Run for real'),
      description: t(
        'dashboard.providerRegistry.routes.executeConfirm',
        { scene: scene.displayName },
        `Run "${scene.displayName}" for real? It calls the provider and may be billed. A dry run calls nothing.`,
      ),
      confirmLabel: t('dashboard.providerRegistry.actions.execute', 'Execute'),
      tone: 'warning',
      run: () => admin.runScene(scene, false),
    })
  }

  // ─── Check drawer ──────────────────────────────────────────────────────────
  // 检查 sends one small probe request; it does not ask first.

  const checkDrawer = reactive({
    open: false,
    provider: null as ProviderRegistryRecord | null,
    capability: '',
    token: 0,
  })

  function openCheckDrawer(provider: ProviderRegistryRecord) {
    checkDrawer.token += 1
    checkDrawer.provider = provider
    checkDrawer.capability = provider.capabilities.map(item => item.capability).find(Boolean) ?? ''
    checkDrawer.open = true
  }

  function closeCheckDrawer() {
    checkDrawer.token += 1
    checkDrawer.open = false
  }

  /** The check drawer's `update:open`, as `setProviderDrawerOpen`. */
  function setCheckDrawerOpen(open: boolean) {
    if (!open)
      closeCheckDrawer()
  }

  async function submitCheck() {
    const provider = checkDrawer.provider
    if (!provider)
      return
    const token = checkDrawer.token
    await admin.checkProvider(provider, checkDrawer.capability || undefined)
    if (token === checkDrawer.token)
      closeCheckDrawer()
  }

  // ─── Row actions ───────────────────────────────────────────────────────────

  function confirmProviderStatus(provider: ProviderRegistryRecord, enabled: boolean) {
    requestConfirm(enabled
      ? {
          title: t('dashboard.providerRegistry.providers.enableTitle', 'Enable provider'),
          description: t('dashboard.providerRegistry.providers.enableConfirm', { provider: provider.displayName }, `Enable "${provider.displayName}"? Routes can send calls to it again.`),
          confirmLabel: t('dashboard.providerRegistry.actions.enable', 'Enable'),
          tone: 'warning',
          run: () => admin.updateProviderStatus(provider, 'enabled'),
        }
      : {
          title: t('dashboard.providerRegistry.providers.disableTitle', 'Disable provider'),
          description: t('dashboard.providerRegistry.providers.disableConfirm', { provider: provider.displayName }, `Disable "${provider.displayName}"? Routes stop sending calls to it.`),
          confirmLabel: t('dashboard.providerRegistry.actions.disable', 'Disable'),
          tone: 'danger',
          run: () => admin.updateProviderStatus(provider, 'disabled'),
        })
  }

  function confirmSceneStatus(scene: SceneRegistryRecord, enabled: boolean) {
    requestConfirm(enabled
      ? {
          title: t('dashboard.providerRegistry.scenes.enableTitle', 'Enable route'),
          description: t('dashboard.providerRegistry.scenes.enableConfirm', { scene: scene.displayName }, `Enable "${scene.displayName}"? It starts serving calls.`),
          confirmLabel: t('dashboard.providerRegistry.actions.enable', 'Enable'),
          tone: 'warning',
          run: () => admin.updateSceneStatus(scene, 'enabled'),
        }
      : {
          title: t('dashboard.providerRegistry.scenes.disableTitle', 'Disable route'),
          description: t('dashboard.providerRegistry.scenes.disableConfirm', { scene: scene.displayName }, `Disable "${scene.displayName}"? Calls to it stop.`),
          confirmLabel: t('dashboard.providerRegistry.actions.disable', 'Disable'),
          tone: 'danger',
          run: () => admin.updateSceneStatus(scene, 'disabled'),
        })
  }

  // Deleting a provider cascades to its capability declarations, and deleting a
  // scene takes its bindings with it, so the counts go in the prompt.
  function confirmDeleteProvider(provider: ProviderRegistryRecord) {
    const count = format.number(provider.capabilities.length)
    requestConfirm({
      title: t('dashboard.providerRegistry.providers.deleteTitle', 'Delete provider'),
      description: t(
        'dashboard.providerRegistry.providers.deleteConfirm',
        { provider: provider.displayName, count },
        `Delete "${provider.displayName}" and its ${count} capability declaration(s)? This cannot be undone.`,
      ),
      confirmLabel: t('common.delete', 'Delete'),
      tone: 'danger',
      run: () => admin.deleteProvider(provider),
    })
  }

  function confirmDeleteScene(scene: SceneRegistryRecord) {
    const count = format.number(scene.bindings.length)
    requestConfirm({
      title: t('dashboard.providerRegistry.scenes.deleteTitle', 'Delete capability route'),
      description: t(
        'dashboard.providerRegistry.scenes.deleteConfirm',
        { scene: scene.displayName, count },
        `Delete "${scene.displayName}" and its ${count} provider binding(s)? This cannot be undone.`,
      ),
      confirmLabel: t('common.delete', 'Delete'),
      tone: 'danger',
      run: () => admin.deleteScene(scene),
    })
  }

  return {
    confirmOpen,
    confirmLoading,
    pendingConfirm,
    requestConfirm,
    setConfirmOpen,
    runConfirmed,
    providerDrawer,
    openProviderDrawer,
    closeProviderDrawer,
    setProviderDrawerOpen,
    submitProviderDrawer,
    sceneDrawer,
    openSceneDrawer,
    closeSceneDrawer,
    setSceneDrawerOpen,
    submitSceneDrawer,
    confirmExecute,
    checkDrawer,
    openCheckDrawer,
    closeCheckDrawer,
    setCheckDrawerOpen,
    submitCheck,
    confirmProviderStatus,
    confirmSceneStatus,
    confirmDeleteProvider,
    confirmDeleteScene,
  }
}

export type ProviderRegistryPanel = ReturnType<typeof useProviderRegistryPanel>
