# NotificationSDK Draft (System + App + User)

Status: Draft

## Goal
Unify notifications used by the core app and plugins into one SDK that supports:
- System notifications (OS-level)
- App notifications (toast/dialog/mention/banner)
- User notifications (Nexus-backed message center, persisted + archived)

## Existing Inventory (Current State)
- System notifications:
  - Download/update: `apps/core-app/src/main/modules/download/notification-service.ts`
  - Share flow: `apps/core-app/src/main/modules/flow-bus/share-notification.ts`
- App notifications:
  - Toast: `vue-sonner` used widely in renderer
  - Mention/dialog: `apps/core-app/src/renderer/src/modules/mention/dialog-mention.ts`
- Permission:
  - `system.notification` registered in `packages/utils/permission/registry.ts`
  - Guard rule: `apps/core-app/src/main/modules/permission/permission-guard.ts`
- Transport:
  - `broadcast()` in `apps/core-app/src/main/core/channel-core.ts` (notification-style pushes)

## Unified Model
```ts
export type NotificationChannel = 'system' | 'app' | 'user'
export type AppPresentation =
  | 'toast'
  | 'dialog'
  | 'mention'
  | 'popper'
  | 'blow'
  | 'banner'

export type NotificationLevel = 'info' | 'success' | 'warning' | 'error'

export interface NotificationAction {
  id: string
  label: string
}

export interface NotificationRequest {
  id?: string
  channel: NotificationChannel
  level?: NotificationLevel
  title?: string
  message: string
  actions?: NotificationAction[]
  dedupeKey?: string
  meta?: Record<string, any>
  app?: {
    presentation: AppPresentation
    duration?: number
    modal?: boolean
  }
  user?: {
    source?: 'nexus' | 'plugin'
    persistent?: boolean
  }
  system?: {
    silent?: boolean
  }
}

export interface NotificationResult {
  id: string
}
```

## SDK Surface (Unified Entry)
```ts
export interface NotificationSDK {
  notify(req: NotificationRequest): Promise<NotificationResult>
  dismiss(id: string): void
  update(id: string, patch: Partial<NotificationRequest>): void
  onAction(handler: (payload: { id: string; action?: string }) => void): void
}
```

## Routing Strategy
1. **Plugin or renderer** calls `notification.notify(...)`.
2. **Main process router**:
   - `channel=system`: handle in main (Electron Notification).
   - `channel=user`: persist + push to message center, optionally broadcast.
   - `channel=app`: forward to renderer via broadcast (active window).
3. **Renderer hub** receives `app.*` payloads and uses presentation providers.

## Providers (Mapping to Current Implementations)
- System provider:
  - Wrap `NotificationService` (download/update)
  - Wrap `ShareNotificationService` (share flow)
  - Future: system notification generic wrapper for simple `title/body`
- App providers:
  - `toast` -> `vue-sonner`
  - `dialog` -> `forDialogMention`
  - `mention` -> `forTouchTip`
  - `blow` -> `blowMention`
  - `popper` -> `popperMention`
  - `banner` -> reserved (new component)
- User provider:
  - Nexus message center (list + archive)
  - Server-to-client push reserved (SSE/WebSocket/IPC bridge)

## Persistence (User Notifications)
Define a local inbox to support "message center list + archive":
```ts
export interface NotificationInboxEntry {
  id: string
  source: 'nexus' | 'plugin'
  title?: string
  message: string
  level?: NotificationLevel
  createdAt: number
  readAt?: number
  archivedAt?: number
  payload?: Record<string, any>
  dedupeKey?: string
}
```
Suggested persistence:
- Use existing storage module or DB to store `NotificationInboxEntry[]`.
- Provide CRUD: list, markRead, archive, delete, clear.
- Allow sync merge (server ID -> local ID) and dedupe by `dedupeKey`.

## Permissions
- `system.notification` required only for `channel=system`.
- `channel=app` and `channel=user` do not require `system.notification`.
- If needed, introduce `notification.user` later for fine-grained control.

## Transport & Events (Suggested Additions)
Add `NotificationEvents` in `packages/utils/transport/events/index.ts`:
```ts
notification: {
  notify: defineEvent('notification').event('notify'),
  dismiss: defineEvent('notification').event('dismiss'),
  update: defineEvent('notification').event('update'),
  action: defineEvent('notification').event('action'),
}
```
Add SDK domain in `packages/utils/transport/sdk/domains/notification.ts` and export
from `packages/utils/transport/sdk/domains/index.ts`.

## Migration Map (Current Call Sites)
System notifications (main):
- `apps/core-app/src/main/modules/download/notification-service.ts`
- `apps/core-app/src/main/modules/flow-bus/share-notification.ts`
- `apps/core-app/src/main/modules/download/download-center.ts`
- `apps/core-app/src/main/modules/update/update-system.ts`

Toast (renderer):
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useDetach.ts`
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/useActionPanel.ts`
- `apps/core-app/src/renderer/src/modules/box/adapter/hooks/usePreviewHistory.ts`
- `apps/core-app/src/renderer/src/modules/auth/useAuth.ts`
- `apps/core-app/src/renderer/src/modules/hooks/useUpdate.ts`
- `apps/core-app/src/renderer/src/composables/market/usePluginUpdates.ts`
- `apps/core-app/src/renderer/src/stores/plugin.ts`
- `apps/core-app/src/renderer/src/views/box/DivisionBoxHeader.vue`
- `apps/core-app/src/renderer/src/views/test/LoginTest.vue`
- `apps/core-app/src/renderer/src/views/base/settings/SettingSetup.vue`
- `apps/core-app/src/renderer/src/views/base/settings/SettingAbout.vue`
- `apps/core-app/src/renderer/src/views/base/settings/SettingSentry.vue`
- `apps/core-app/src/renderer/src/views/base/settings/SettingPlatformCapabilities.vue`
- `apps/core-app/src/renderer/src/views/base/settings/SettingDownload.vue`
- `apps/core-app/src/renderer/src/views/base/settings/SettingUser.vue`
- `apps/core-app/src/renderer/src/views/base/settings/SettingUpdate.vue`
- `apps/core-app/src/renderer/src/views/base/intelligence/IntelligencePromptsPage.vue`
- `apps/core-app/src/renderer/src/views/base/begin/internal/SetupPermissions.vue`
- `apps/core-app/src/renderer/src/views/base/begin/internal/AccountDo.vue`
- `apps/core-app/src/renderer/src/components/intelligence/config/IntelligenceModelConfig.vue`
- `apps/core-app/src/renderer/src/components/intelligence/IntelligencePrompts.vue`
- `apps/core-app/src/renderer/src/components/plugin/PluginInfo.vue`
- `apps/core-app/src/renderer/src/components/plugin/tabs/PluginStorage.vue`
- `apps/core-app/src/renderer/src/components/render/custom/CoreIntelligenceAnswer.vue`
- `apps/core-app/src/renderer/src/components/download/DownloadCenterView.vue`
- `apps/core-app/src/renderer/src/components/download/DownloadCenterTest.vue`
- `apps/core-app/src/renderer/src/components/download/DownloadCenter.vue`
- `apps/core-app/src/renderer/src/components/download/DownloadHistoryView.vue`
- `apps/core-app/src/renderer/src/components/download/ErrorLogViewer.vue`
- `apps/core-app/src/renderer/src/components/download/DownloadSettings.vue`

Mention / dialog (renderer):
- `apps/core-app/src/renderer/src/modules/mention/dialog-mention.ts`
- `apps/core-app/src/renderer/src/composables/market/useMarketInstall.ts`
- `apps/core-app/src/renderer/src/components/intelligence/config/IntelligenceApiConfig.vue`
- `apps/core-app/src/renderer/src/components/plugin/action/mention/PluginApplyInstall.vue`
- `apps/core-app/src/renderer/src/components/plugin/PluginView.vue`
- `apps/core-app/src/renderer/src/modules/install/install-manager.ts`
- `apps/core-app/src/renderer/src/modules/hooks/useUpdate.ts`
- `apps/core-app/src/renderer/src/modules/hooks/application-hooks.ts`
- `apps/core-app/src/renderer/src/modules/hooks/dropper-resolver.ts`
- `apps/core-app/src/renderer/src/modules/hooks/useUrlProcessor.ts`
- `apps/core-app/src/renderer/src/views/base/settings/SettingFileIndex.vue`
- `apps/core-app/src/renderer/src/views/base/MarketDetail.vue`
- `apps/core-app/src/renderer/src/views/base/plugin/PluginNew.vue`

## Open Questions
- Should `channel=app` notifications be persisted in message center, or only `channel=user`?
- Should app notifications fallback to toast when dialog/mention is unavailable?
- What is the Nexus push mechanism (polling vs SSE vs WebSocket)?
