<script setup lang="ts">
import { computed, ref } from 'vue'

const emit = defineEmits<{
  (event: 'openAssistant', source: HTMLElement | null): void
}>()

const runtimeConfig = useRuntimeConfig()
const { t } = useI18n()
const assistantTriggerRef = ref<HTMLElement | null>(null)
const showCardChrome = computed(() => {
  const value = runtimeConfig.public?.docs?.asideCardChrome as string | boolean | undefined
  if (value === true)
    return true
  if (typeof value === 'string')
    return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())
  return false
})
const assistantAriaLabel = computed(() => t('docs.assistant.open'))
const askAiLabel = computed(() => t('docs.aside.askAi'))
const resourcesLabel = computed(() => t('docs.aside.resources'))
const resourceLinks = computed(() => [
  {
    label: t('docs.aside.reportIssue'),
    icon: 'i-carbon-flag',
    href: 'https://github.com/talex-touch/tuff/issues/new/choose',
  },
  {
    label: t('docs.aside.requestFeature'),
    icon: 'i-carbon-add',
    href: 'https://github.com/talex-touch/tuff/discussions',
  },
  {
    label: t('docs.aside.viewGitHub'),
    icon: 'i-carbon-logo-github',
    href: 'https://github.com/talex-touch/tuff',
  },
])

function openAssistant() {
  emit('openAssistant', assistantTriggerRef.value)
}
</script>

<template>
  <section class="docs-aside-cards" :class="{ 'docs-aside-cards--chrome': showCardChrome }">
    <button
      ref="assistantTriggerRef"
      type="button"
      class="docs-aside-assistant"
      :aria-label="assistantAriaLabel"
      @click="openAssistant"
    >
      <span class="docs-aside-assistant__spark i-carbon-ai-status" aria-hidden="true" />
      <span class="docs-aside-assistant__label">{{ askAiLabel }}</span>
      <span class="docs-aside-assistant__arrow i-carbon-arrow-up-right" aria-hidden="true" />
    </button>

    <div class="docs-aside-card">
      <div class="docs-aside-card__title">
        {{ resourcesLabel }}
      </div>
      <ul class="docs-aside-card__list">
        <li v-for="link in resourceLinks" :key="link.href">
          <a class="docs-aside-card__link" :href="link.href" target="_blank" rel="noreferrer">
            <span class="docs-aside-card__link-icon" :class="link.icon" aria-hidden="true" />
            <span>{{ link.label }}</span>
          </a>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.docs-aside-cards {
  display: flex;
  flex-direction: column;
  gap: 30px;
}

.docs-aside-card {
  border-radius: var(--tx-border-radius-round, 18px);
  border: 1px solid transparent;
  background: transparent;
  padding: 0;
  box-shadow: none;
}

.docs-aside-cards--chrome .docs-aside-card {
  border-color: color-mix(in srgb, var(--tx-border-color-light, #e4e7ed) 75%, transparent);
  background: color-mix(in srgb, var(--tx-bg-color-overlay, #ffffff) 92%, transparent);
  box-shadow: var(--tx-box-shadow-light, 0px 0px 12px rgba(0, 0, 0, 0.12));
  padding: 16px;
}

/* Section label, matched to the outline's "On this page" eyebrow. */
.docs-aside-card__title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
  font-weight: 600;
  letter-spacing: 0;
  color: var(--tx-text-color-placeholder, #a8abb2);
}

/*
 * The one accent in the rail: a hairline gradient border rendered with two
 * backgrounds (padding-box over border-box) so it stays crisp at 1px.
 */
.docs-aside-assistant {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 9px;
  border: 1px solid transparent;
  padding: 11px 13px;
  border-radius: 10px;
  color: var(--tx-text-color-primary, #303133);
  background:
    linear-gradient(var(--tx-bg-color-overlay, #fff), var(--tx-bg-color-overlay, #fff)) padding-box,
    linear-gradient(135deg, #6e8bff, #b07cff 50%, #ff9fc0) border-box;
  cursor: pointer;
  font: inherit;
  transition:
    box-shadow var(--tx-transition-duration-fast, 0.2s) var(--tx-transition-function, ease-in-out),
    transform var(--tx-transition-duration-fast, 0.2s) var(--tx-transition-function, ease-in-out);
}

.docs-aside-assistant:hover,
.docs-aside-assistant:focus-visible {
  box-shadow: 0 4px 16px color-mix(in srgb, #b07cff 22%, transparent);
  transform: translateY(-1px);
  outline: none;
}

.docs-aside-assistant__spark {
  font-size: 16px;
  color: var(--tx-text-color-primary, #303133);
}

.docs-aside-assistant__label {
  flex: 1;
  text-align: left;
  font-size: 13.5px;
  font-weight: 500;
}

.docs-aside-assistant__arrow {
  color: var(--tx-text-color-placeholder, #a8abb2);
  font-size: 15px;
}

.docs-aside-card__list {
  list-style: none;
  padding: 12px 0 0;
  margin: 0;
  display: grid;
  gap: 9px;
}

.docs-aside-card__link {
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: 13px;
  padding: 2px 0;
  border: 0;
  color: var(--tx-text-color-secondary, #909399);
  text-decoration: none;
  transition: color var(--tx-transition-duration-fast, 0.2s) var(--tx-transition-function, ease-in-out);
}

.docs-aside-card__link-icon {
  font-size: 14px;
  color: var(--tx-text-color-placeholder, #a8abb2);
  transition: color var(--tx-transition-duration-fast, 0.2s) var(--tx-transition-function, ease-in-out);
}

.docs-aside-card__link:hover {
  color: var(--tx-text-color-primary, #303133);
}

.docs-aside-card__link:hover .docs-aside-card__link-icon {
  color: var(--tx-color-primary, #409eff);
}
</style>
