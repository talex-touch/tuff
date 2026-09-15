<template>
  <div class="admin-shell h-screen flex flex-col overflow-hidden from-white via-white to-slate-100 bg-gradient-to-br text-black dark:from-dark dark:via-dark/95 dark:to-dark/85 dark:text-light">
    <TheHeader class="admin-shell-header z-10" />
    <div class="admin-shell-body min-h-0 w-full flex flex-1 flex-col pt-22 lg:flex-row">
      <AdminNav />
      <main class="admin-shell-main min-h-0 min-w-0 flex-1 overflow-y-auto px-4 py-6 lg:px-8">
        <slot />
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
 * The divider sits on the header *band*, not on the pill: the pill is a
 * floating rounded card, so a border on it draws a line that stops short of
 * both edges and follows the corner radius. `.TuffHeader` is the full-width
 * fixed band the pill floats inside, and `pt-22` on the body is measured to it,
 * so a bottom border there is exactly where the content starts.
 */
.admin-shell .TuffHeader {
  border-bottom: 1px solid rgb(0 0 0 / 6%);
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

.admin-shell h1.apple-heading-md,
.admin-shell h2.apple-heading-md {
  font-size: 1.75rem;
  line-height: 1.2;
  letter-spacing: -0.02em;
}

.admin-shell .tx-button {
  border-radius: 999px;
}
</style>