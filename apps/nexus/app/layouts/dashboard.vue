<template>
  <div class="dashboard-shell min-h-screen from-white via-white to-slate-100 bg-gradient-to-br text-black dark:from-dark dark:via-dark/95 dark:to-dark/85 dark:text-light">
    <TheHeader class="z-10 border-b border-transparent" />
    <main class="mx-auto max-w-7xl w-full flex flex-1 flex-col gap-8 px-4 py-20 lg:px-12 sm:px-8">
      <slot />
    </main>
    <TuffFooter />
  </div>
</template>

<style>
/**
 * Dashboard surface treatment. Every rule is prefixed with `.dashboard-shell`
 * so the store, docs and marketing pages keep the bordered card look — the
 * shortcuts themselves (`apple-card`, `tx-button`) are shared, and rewriting
 * them in uno.config.ts would have restyled all of those too.
 *
 * The panels drop their hairline border and lean on surface + shadow instead:
 * on a dashboard route there are enough nested rows that a border on every
 * card reads as a grid of boxes rather than as grouping.
 */
.dashboard-shell .apple-card,
.dashboard-shell .apple-card-lg {
  border-color: transparent;
  border-radius: 22px;
  box-shadow: 0 1px 2px rgb(0 0 0 / 4%), 0 12px 32px -20px rgb(0 0 0 / 18%);
}

:root.dark .dashboard-shell .apple-card,
:root.dark .dashboard-shell .apple-card-lg {
  background-color: rgb(255 255 255 / 4.5%);
  box-shadow: none;
}

/* Page headings sit directly on the page, with no card to give them weight. */
.dashboard-shell h1.apple-heading-md,
.dashboard-shell h2.apple-heading-md {
  font-size: 1.75rem;
  line-height: 1.2;
  letter-spacing: -0.02em;
}

.dashboard-shell .tx-button {
  border-radius: 999px;
}
</style>
