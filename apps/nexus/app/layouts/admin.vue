<script setup lang="ts">
import { TxErrorState } from '@talex-touch/tuffex/error-state'
import { TxPermissionState } from '@talex-touch/tuffex/permission-state'
import AdminGateSkeleton from '~/components/admin/AdminGateSkeleton.vue'
import { useAdminGate } from '~/composables/useAdminGate'
import { useAdminRouteSkeleton } from '~/composables/useAdminRouteSkeleton'

const { t } = useI18n()
const { state: gateState, retrying: gateRetrying, retry: retryGate } = useAdminGate()
const { visible: routeSkeletonVisible } = useAdminRouteSkeleton()
</script>

<template>
  <div class="admin-shell h-screen flex flex-col overflow-hidden from-white via-white to-slate-100 bg-gradient-to-br text-black dark:from-dark dark:via-dark/95 dark:to-dark/85 dark:text-light">
    <TheHeader class="admin-shell-header z-10" />
    <div class="admin-shell-body min-h-0 w-full flex flex-1 flex-col pt-11 lg:flex-row">
      <AdminNav />
      <main
        class="admin-shell-main min-h-0 min-w-0 flex-1 overflow-y-auto px-4 py-4 lg:px-8"
        :aria-busy="gateState === 'resolving' || routeSkeletonVisible ? 'true' : undefined"
      >
        <AdminGateSkeleton v-if="gateState === 'resolving'" />
        <div v-else-if="gateState === 'denied'" class="admin-shell-gate-state">
          <TxPermissionState
            :title="t('dashboard.sections.adminGate.deniedTitle', 'Administrator access required')"
            :description="t('dashboard.sections.adminGate.deniedDescription', 'This console is only open to administrators. Taking you back to your dashboard.')"
          />
        </div>
        <div v-else-if="gateState === 'error'" class="admin-shell-gate-state">
          <TxErrorState
            :title="t('dashboard.sections.adminGate.errorTitle', 'Could not load your account')"
            :description="t('dashboard.sections.adminGate.errorDescription', 'The console needs your account details to check your access. Try again.')"
            :loading="gateRetrying"
            :primary-action="{ label: t('common.retry', 'Retry'), variant: 'flat', disabled: gateRetrying }"
            @primary="retryGate"
          />
        </div>
        <div v-else class="admin-shell-stage">
          <AdminGateSkeleton v-if="routeSkeletonVisible" class="admin-shell-route-skeleton" />
          <div class="admin-shell-page" :class="{ 'is-covered': routeSkeletonVisible }" :inert="routeSkeletonVisible">
            <slot />
          </div>
        </div>
      </main>
    </div>
  </div>
</template>

<style>
/**
 * Administrator console. Two structural differences from
 * `layouts/dashboard.vue`, both deliberate and both the reason this layout
 * exists at all:
 *
 * 1. No max-width. The account workspace is a centred column
 *    (`max-width: min(1180px, …)` in `pages/dashboard.vue`) because most of it
 *    is forms and cards, while the console is tables — audit logs, analytics,
 *    provider registries — that were being squeezed into that column.
 *
 * 2. One screen, not a document. The shell is `h-screen` with the scroll moved
 *    onto `<main>`, so the rail is a real full-height column pinned under the
 *    header instead of a `sticky` block that drifts down the page, and there is
 *    no footer: a console is an application surface, and marketing links below
 *    a table only exist because the page used to scroll.
 *
 * The surface treatment is repeated here rather than shared with
 * `layouts/dashboard.vue` because layouts are lazy chunks: a hard load of
 * `/admin/updates` never loads the dashboard layout, so a rule parked there
 * would simply be absent. Keeping it duplicated means each shell is complete.
 *
 * `<main>` has four states (`useAdminGate`): a skeleton while the session and
 * profile resolve, an access-denied state for a signed-in non-administrator
 * (who is then sent to `/dashboard/overview`), a retry when the profile request
 * failed, and the page. The page slot only mounts for an administrator, so a page
 * never needs a gate of its own and never sends a request that could only
 * answer 403.
 *
 * While a navigation moves to another console page, the same skeleton stands in
 * for the page until the next one has mounted (`useAdminRouteSkeleton`), instead
 * of an empty column. The page slot stays mounted underneath, collapsed and
 * `inert`, so nothing in it can take focus or be read out until it is shown.
 */

/*
 * The header pill sizes itself from `--nexus-frame-max` (66rem, the marketing
 * frame). Inside the console it spans the shell instead, so it lines up with a
 * rail on the left edge and tables on the right rather than floating in the
 * middle of them. `--nexus-frame-compact` is the *scrolled* width and is
 * overridden too: `<main>` owns the scroll here, so `window.scrollY` never
 * moves and the pill would otherwise be stuck at whichever width it started
 * at if that state were ever entered.
 */
.admin-shell {
  --nexus-frame-max: calc(100vw - 2rem);
  --nexus-frame-compact: calc(100vw - 2rem);
}

/*
 * The console uses a compact 44px application bar: exactly half the public
 * site's 88px floating-header band. The main scroll surface starts at the
 * same 44px boundary, so the divider, rail and content remain aligned.
 */
.admin-shell .TuffHeader {
  height: 44px;
  border-bottom: 1px solid rgb(0 0 0 / 6%);
}

.admin-shell .TuffHeader-Main {
  top: 0;
  height: 44px;
  min-height: 44px;
  padding-block: 0.25rem;
}

:root.dark .admin-shell .TuffHeader {
  border-bottom-color: rgb(255 255 255 / 8%);
}

.admin-shell .apple-card,
.admin-shell .apple-card-lg {
  border-color: transparent;
  border-radius: 22px;
  box-shadow: 0 1px 2px rgb(0 0 0 / 4%), 0 12px 32px -20px rgb(0 0 0 / 18%);
}

:root.dark .admin-shell .apple-card,
:root.dark .admin-shell .apple-card-lg {
  background-color: rgb(255 255 255 / 4.5%);
  box-shadow: none;
}


.admin-shell .tx-button {
  border-radius: 999px;
}

.admin-shell-gate-state {
  display: grid;
  min-height: 60vh;
  place-content: center;
}

.admin-shell-stage,
.admin-shell-page {
  min-width: 0;
}

/* Collapsed and hidden, not removed: the outgoing page finishes its transition
   and the incoming one mounts and lays out at its real width underneath, so the
   swap back moves nothing. Collapsing it also lets `<main>` clamp its scroll to
   the skeleton, so the next page starts at the top rather than at the old one's
   scroll offset. The element is also `inert` meanwhile: a descendant that sets
   `visibility: visible` would otherwise stay focusable and readable here. */
.admin-shell-page.is-covered {
  height: 0;
  overflow: hidden;
  visibility: hidden;
}
</style>
