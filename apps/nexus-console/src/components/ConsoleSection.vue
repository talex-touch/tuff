<script setup lang="ts">
import { useId } from 'vue'

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
    class="ConsoleSection"
    :class="{ 'is-flush': !padded, 'has-header': Boolean(title || description || $slots.actions) }"
    :aria-labelledby="title ? headingId : undefined"
  >
    <header v-if="title || description || $slots.actions" class="ConsoleSection-Header">
      <div v-if="title || description" class="ConsoleSection-Heading">
        <h2 v-if="title" :id="headingId" class="ConsoleSection-Title">
          {{ title }}
        </h2>
        <p v-if="description" class="ConsoleSection-Description">
          {{ description }}
        </p>
      </div>
      <div v-if="$slots.actions" class="ConsoleSection-Actions">
        <slot name="actions" />
      </div>
    </header>
    <div class="ConsoleSection-Body">
      <slot />
    </div>
    <footer v-if="$slots.footer" class="ConsoleSection-Footer">
      <slot name="footer" />
    </footer>
  </section>
</template>

<style scoped>
.ConsoleSection {
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
  border-radius: 18px;
  background: var(--tx-bg-color);
  box-shadow: inset 0 0 0 1px var(--tx-border-color-lighter);
}

.ConsoleSection-Header {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 20px 0;
}

.ConsoleSection.is-flush .ConsoleSection-Header {
  padding-bottom: 14px;
}

.ConsoleSection-Heading {
  min-width: 0;
}

.ConsoleSection-Title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  line-height: 1.4;
  color: var(--tx-text-color-primary);
}

.ConsoleSection-Description {
  margin: 4px 0 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--tx-text-color-regular);
  text-wrap: pretty;
}

.ConsoleSection-Actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.ConsoleSection-Body {
  min-width: 0;
  padding: 20px;
}

.ConsoleSection.has-header .ConsoleSection-Body {
  padding-top: 14px;
}

.ConsoleSection.is-flush .ConsoleSection-Body {
  padding: 0;
}

.ConsoleSection-Footer {
  padding: 12px 20px;
  border-top: 1px solid var(--tx-border-color-lighter);
}
</style>
