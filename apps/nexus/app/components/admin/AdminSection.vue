<script setup lang="ts">
import { useId } from 'vue'

/**
 * A titled block inside an administrator page. The heading names the block, not
 * the page — `AdminPageShell` owns the one page heading — so it is an `<h2>` and
 * never repeats the page title. `padded: false` lets a table or a list run to the
 * edges; the header and footer keep their inset.
 */
withDefaults(defineProps<{
  title?: string
  description?: string
  padded?: boolean
}>(), {
  padded: true,
})

const headingId = useId()
</script>

<template>
  <section
    class="AdminSection"
    :class="{ 'is-flush': !padded, 'has-header': Boolean(title || description || $slots.actions) }"
    :aria-labelledby="title ? headingId : undefined"
  >
    <header v-if="title || description || $slots.actions" class="AdminSection-Header">
      <div v-if="title || description" class="AdminSection-Heading">
        <h2 v-if="title" :id="headingId" class="AdminSection-Title">
          {{ title }}
        </h2>
        <p v-if="description" class="AdminSection-Description">
          {{ description }}
        </p>
      </div>
      <div v-if="$slots.actions" class="AdminSection-Actions">
        <slot name="actions" />
      </div>
    </header>
    <div class="AdminSection-Body">
      <slot />
    </div>
    <footer v-if="$slots.footer" class="AdminSection-Footer">
      <slot name="footer" />
    </footer>
  </section>
</template>

<style scoped>
/* The console's card: the same 22px radius and dark-mode wash `layouts/admin.vue`
   gives `apple-card-lg`, from tokens rather than literals. Clips its content so a
   flush table follows the corners. */
.AdminSection {
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
  border-radius: 22px;
  background: var(--tx-bg-color);
  box-shadow: var(--tx-elevation-2);
}

.dark .AdminSection {
  background: color-mix(in srgb, var(--tx-text-color-primary) 4.5%, transparent);
  box-shadow: none;
}

.AdminSection-Header {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 20px 0;
}

.AdminSection.is-flush .AdminSection-Header {
  padding-bottom: 14px;
}

.AdminSection-Heading {
  min-width: 0;
}

.AdminSection-Title {
  margin: 0;
  color: var(--tx-text-color-primary);
  font-size: 16px;
  font-weight: 600;
  line-height: 1.4;
}

/* Regular ink: 13px copy is read, and secondary ink is under 4.5:1 on white. */
.AdminSection-Description {
  margin: 4px 0 0;
  color: var(--tx-text-color-regular);
  font-size: 13px;
  line-height: 1.5;
}

.AdminSection-Actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.AdminSection-Body {
  min-width: 0;
  padding: 20px;
}

.AdminSection.has-header .AdminSection-Body {
  padding-top: 14px;
}

.AdminSection.is-flush .AdminSection-Body {
  padding: 0;
}

.AdminSection-Footer {
  padding: 12px 20px;
  border-top: 1px solid var(--tx-border-color-lighter);
}
</style>
