<script setup lang="ts">
defineProps<{
  title: string
}>()
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

.AdminPageShell-Filters,
.AdminPageShell-Body {
  min-width: 0;
}
</style>
