<script setup lang="ts">
defineProps<{
  title: string
}>()
</script>

<template>
  <section class="ConsolePage">
    <header class="ConsolePage-Header">
      <h1 class="ConsolePage-Title">
        {{ title }}
      </h1>
      <div v-if="$slots.actions" class="ConsolePage-Actions">
        <slot name="actions" />
      </div>
    </header>
    <div v-if="$slots.nav" class="ConsolePage-Nav">
      <slot name="nav" />
    </div>
    <div v-if="$slots.filters" class="ConsolePage-Filters">
      <slot name="filters" />
    </div>
    <div class="ConsolePage-Body">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.ConsolePage {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.ConsolePage-Header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.ConsolePage-Title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  line-height: 1.4;
  color: var(--tx-text-color-primary);
  text-wrap: balance;
}

.ConsolePage-Actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.ConsolePage-Nav,
.ConsolePage-Filters,
.ConsolePage-Body {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
</style>
