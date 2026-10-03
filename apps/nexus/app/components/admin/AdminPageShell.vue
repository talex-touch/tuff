<script setup lang="ts">
import { inject, onMounted } from 'vue'
import { ADMIN_PAGE_MOUNTED_KEY } from '~/composables/useAdminRouteSkeleton'

/**
 * The frame of every administrator page: the one page heading (its text is the
 * rail entry's), then `#actions` beside it, `#nav` for a section strip under it
 * (`?section=` / `?tab=`), `#filters`, and the body. Nothing inside the body
 * adds a second page heading or subtitle; blocks are titled by `AdminSection`.
 */
defineProps<{
  title: string
}>()

// Tells `layouts/admin.vue` that the next page is on screen, which is what ends
// its route-change skeleton. Outside the console layout there is no provider.
const notifyPageMounted = inject(ADMIN_PAGE_MOUNTED_KEY, null)

onMounted(() => {
  notifyPageMounted?.()
})
</script>

<template>
  <section class="AdminPageShell">
    <header class="AdminPageShell-Header">
      <h1 class="AdminPageShell-Title">
        {{ title }}
      </h1>
      <div v-if="$slots.actions" class="AdminPageShell-Actions">
        <slot name="actions" />
      </div>
    </header>
    <div v-if="$slots.nav" class="AdminPageShell-Nav">
      <slot name="nav" />
    </div>
    <div v-if="$slots.filters" class="AdminPageShell-Filters">
      <slot name="filters" />
    </div>
    <div class="AdminPageShell-Body">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.AdminPageShell {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 16px;
}

.AdminPageShell-Header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.AdminPageShell-Title {
  margin: 0;
  color: var(--tx-text-color-primary, inherit);
  font-size: 20px;
  font-weight: 600;
  line-height: 1.4;
}

.AdminPageShell-Actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.AdminPageShell-Nav,
.AdminPageShell-Filters,
.AdminPageShell-Body {
  min-width: 0;
}
</style>
