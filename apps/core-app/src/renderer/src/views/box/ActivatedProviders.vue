<script setup lang="ts">
import type { IProviderActivate, ITuffIcon } from '@talex-touch/utils'
import { TxIcon as TuffIcon } from '@talex-touch/tuffex/icon'
import { useI18n } from 'vue-i18n'
import type { IUseSearch } from '~/modules/box/adapter/types'
import {
  normalizeCoreBoxIcon,
  shouldRenderCoreBoxIconColorful
} from '~/components/render/icon-color-mode'

type ProviderIconInput = ITuffIcon | string | null | undefined

const props = withDefaults(
  defineProps<{
    providers: IUseSearch['activeActivations']['value']
    closable?: boolean
  }>(),
  {
    closable: true
  }
)

const emit = defineEmits<{
  (e: 'deactivate-provider', id: string): void
}>()

function getUniqueKey(provider: IProviderActivate): string {
  if (provider.id === 'plugin-features' && provider.meta?.pluginName) {
    return `${provider.id}:${provider.meta.pluginName}`
  }
  return provider.id
}

function hasVice(provider: IProviderActivate): boolean {
  return Boolean(provider.meta?.feature || props.closable)
}

const { t } = useI18n()

/**
 * The pill's close control is icon-only, so its name has to carry the provider too -- several
 * pills can be on screen and "Remove" alone would announce all of them identically (#510).
 */
function getDeactivateLabel(provider: IProviderActivate): string {
  const name = provider.name || provider.meta?.pluginName || provider.id
  return `${t('common.remove')} ${name}`
}

function getProviderIconInput(provider: IProviderActivate): ProviderIconInput {
  return provider.icon ?? (provider.meta?.pluginIcon as ProviderIconInput)
}

function getProviderIcon(provider: IProviderActivate): ITuffIcon {
  return normalizeCoreBoxIcon(getProviderIconInput(provider))
}

function shouldRenderProviderIconColorful(provider: IProviderActivate): boolean {
  return shouldRenderCoreBoxIconColorful(getProviderIconInput(provider))
}

function getProviderIconStyle(provider: IProviderActivate): Record<string, string> {
  const icon = getProviderIconInput(provider)
  const explicitColor = typeof icon === 'object' ? icon?.color : undefined

  return {
    '--icon-color': explicitColor || 'var(--tx-color-primary)'
  }
}
</script>

<template>
  <div class="ActivatedProvidersContainer">
    <div
      v-for="provider in props.providers"
      :key="getUniqueKey(provider)"
      class="activated-provider-pill"
      :class="{ 'has-vice': hasVice(provider) }"
    >
      <div class="Activated-Provider-PillMajor">
        <TuffIcon
          :icon="getProviderIcon(provider)"
          :alt="provider.name || provider.meta?.pluginName"
          :colorful="shouldRenderProviderIconColorful(provider)"
          :style="getProviderIconStyle(provider)"
        >
          <template #empty>
            <i class="Activated-Provider-FallbackIcon i-carbon-application" aria-hidden="true" />
          </template>
        </TuffIcon>
        <span class="Activated-Provider-PillMajor-Label text-sm truncate">{{
          provider.name || provider.meta?.pluginName || provider.id
        }}</span>
      </div>
      <div v-if="hasVice(provider)" class="Activated-Provider-PillVice">
        <span v-if="provider.meta?.feature">{{ provider.meta.feature.render?.basic?.title }}</span>
        <!--
          A real button: the only content is a UnoCSS icon class, so there is no text node to
          announce and nothing made it focusable (#510). Deactivating is an action, so button
          is the honest role and it brings Enter/Space without hand-written handlers.
        -->
        <button
          v-if="props.closable"
          type="button"
          class="Activated-Provider-Deactivate"
          cursor-pointer
          i-carbon-close
          :aria-label="getDeactivateLabel(provider)"
          @click="emit('deactivate-provider', getUniqueKey(provider))"
        />
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.Activated-Provider-FallbackIcon {
  display: inline-block;
  width: 1rem;
  height: 1rem;
  flex: 0 0 1rem;
  color: var(--icon-color);
}

.Activated-Provider-Deactivate {
  // Was a div, so it carried no native chrome. Reset it back so promoting the element to a
  // button is an accessibility change only, not a visual one.
  appearance: none;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;

  // A focusable control that shows no focus is an invisible tab stop.
  &:focus-visible {
    outline: 2px solid var(--tx-color-primary);
    outline-offset: 2px;
    border-radius: 4px;
  }
}

.ActivatedProvidersContainer {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.Activated-Provider-PillMajor-Label {
  max-width: 0px;
  animation: truncateShrink 3s 0.5s linear;
}

@keyframes truncateShrink {
  0%,
  100% {
    max-width: 0px;
  }

  50% {
    max-width: 500px;
  }
}

.Activated-Provider-PillMajor {
  &::after {
    z-index: -1;
    content: '';
    position: absolute;

    inset: 0;
    opacity: 0.5;
    border-radius: 12px 0 0 12px;
    background: linear-gradient(100deg, var(--tx-color-primary-light-7) 95%, #0000 95%);
  }
  position: relative;
  margin-right: -0.25rem;
  padding: 0.5rem 0.5rem;

  display: flex;
  align-items: center;
  gap: 0.25rem;

  --fake-inner-opacity: 0.25;
}

.Activated-Provider-PillVice {
  &::after {
    z-index: -1;
    content: '';
    position: absolute;

    inset: 0;
    opacity: 0.25;
    border-radius: 0 12px 12px 0;
    background: linear-gradient(-80deg, var(--tx-color-primary-light-7) 90%, #0000 90%);
  }
  position: relative;
  padding: 0.5rem 0.75rem;

  display: flex;
  align-items: center;
  gap: 0.25rem;
  color: var(--tx-color-primary);

  --fake-inner-opacity: 0.125;
}

.activated-provider-pill {
  position: relative;

  display: flex;
  align-items: center;
  font-size: 0.8rem;
  white-space: nowrap;
  border-radius: 12px;
  border: 1px solid var(--tx-color-primary-light-5);
  overflow: hidden;

  &:not(.has-vice) {
    .Activated-Provider-PillMajor {
      margin-right: 0;

      &::after {
        border-radius: 12px;
        background: var(--tx-color-primary-light-7);
      }
    }
  }
}
</style>
