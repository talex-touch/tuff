<script setup lang="ts">
import type { ITuffIcon, TuffItem, TuffRender } from '@talex-touch/utils'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import DefaultIcon from '~/assets/svg/EmptyAppPlaceholder.svg'
import { TxIcon as TuffIcon } from '@talex-touch/tuffex/icon'
import { resolveI18nText } from '~/modules/lang/resolve-i18n-text'
import {
  normalizeCoreBoxIcon,
  resolveCoreBoxIconColor,
  shouldRenderCoreBoxIconColorful
} from './icon-color-mode'

interface Props {
  item: TuffItem
  active: boolean
  render: TuffRender
  quickKey?: string
  /** Icon only: the title and badge recede (shrink and fade) and the key hint moves under the icon. */
  compact?: boolean
}

const props = defineProps<Props>()
const { t } = useI18n()

const displayIcon = computed<ITuffIcon>(() => normalizeCoreBoxIcon(props.render?.basic?.icon))
const iconStyle = computed(() => ({
  '--icon-color': resolveCoreBoxIconColor(displayIcon.value)
}))

const isPinned = computed(() => props.item.meta?.pinned?.isPinned)
const title = computed(() => resolveI18nText(props.render.basic?.title || '', t))
const shouldRenderIconColorful = computed(() =>
  shouldRenderCoreBoxIconColorful(props.render.basic?.icon)
)
const recommendationBadge = computed(() => {
  const meta = props.item.meta as Record<string, unknown> | undefined
  const recommendation = meta?.recommendation as
    | { badge?: { variant?: string; icon?: string; text?: string } }
    | undefined
  return recommendation?.badge
})
const recommendationBadgeIcon = computed(() => {
  const icon = recommendationBadge.value?.icon?.trim()
  return icon?.startsWith('i-') ? icon : ''
})
/** Main sends an `$i18n:` key so one badge table serves both locales. */
const recommendationBadgeText = computed(() =>
  resolveI18nText(recommendationBadge.value?.text ?? '', t)
)
</script>

<template>
  <div
    class="BoxGridItem fake-background"
    :class="{ 'is-active': active, 'is-pinned': isPinned, 'is-compact': compact }"
  >
    <!-- Counter-scaled by the FLIP morph, so the content keeps its size while the box changes. -->
    <div class="BoxGridItem-Inner" data-flip-inner>
      <div class="BoxGridItem-Icon">
        <TuffIcon
          :empty="DefaultIcon"
          :icon="displayIcon"
          :alt="title"
          :size="36"
          :colorful="shouldRenderIconColorful"
          :style="iconStyle"
        />
        <span v-if="isPinned" class="BoxGridItem-Pin">
          <i class="i-ri-pushpin-2-fill" />
        </span>
      </div>
      <span class="BoxGridItem-Title">{{ title }}</span>
      <span
        v-if="recommendationBadge"
        class="BoxGridItem-Badge"
        :class="`badge-${recommendationBadge.variant}`"
      >
        <i v-if="recommendationBadgeIcon" :class="recommendationBadgeIcon" aria-hidden="true" />
        {{ recommendationBadgeText }}
      </span>
      <span v-if="quickKey" class="BoxGridItem-QuickKey">{{ quickKey }}</span>
      <span v-if="quickKey" class="BoxGridItem-QuickKeyInline">{{ quickKey }}</span>
    </div>
  </div>
</template>

<style scoped lang="scss">
// Only transform and opacity animate here. Layout — padding, the label rows, the key under the
// icon — switches in one pass, and the FLIP driven from CoreBox carries the box from its old size
// to the new one on the compositor. Transitioning padding, icon size and label height instead
// re-laid out the whole grid on every frame of a collapse, which is what stuttered.
.BoxGridItem {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0.5rem;
  border-radius: 16px;
  cursor: pointer;
  position: relative;
  min-width: 0;
  box-sizing: border-box;

  --fake-inner-opacity: 0;
  // Keep the border width constant and only recolor it on hover/active. The
  // previous 5px→1px swap changed the box size on every state change, which
  // reflows the card (and, under content-box sizing, offsets its row
  // neighbours — the misaligned recommend cards).
  border: 1px solid transparent;
  transition: border-color 0.125s ease;

  &:hover {
    --fake-inner-opacity: 0.5;
    border-color: var(--tx-border-color);
  }

  &.is-active {
    --fake-inner-opacity: 0.75;
    border-color: var(--tx-color-primary);
  }

  &.is-pinned .BoxGridItem-Icon::after {
    content: '';
    position: absolute;
    inset: -2px;
    border-radius: 14px;
    border: 1px dashed var(--tx-color-warning);
    pointer-events: none;
  }

  &.is-compact {
    padding: 6px;
  }
}

.BoxGridItem-Inner {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  min-width: 0;
}

// The icon keeps its 36px box in both states; a compact tile scales it down visually instead of
// resizing it, so the change rides the compositor.
.BoxGridItem-Icon {
  position: relative;
  width: 36px;
  height: 36px;
  transition: transform 0.2s ease;
}

.BoxGridItem.is-compact .BoxGridItem-Icon {
  transform: scale(0.78);
}

.BoxGridItem-Pin {
  position: absolute;
  top: -4px;
  right: -4px;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--tx-color-warning);
  border-radius: 50%;
  font-size: 10px;
  color: #fff;
}

.BoxGridItem-Title {
  font-size: 11px;
  font-weight: 500;
  text-align: center;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--tx-text-color-primary);
  line-height: 1.2;
}

.BoxGridItem-Title,
.BoxGridItem-Badge {
  margin-top: 4px;
  transform-origin: 50% 0;
  transition:
    opacity 0.16s ease 0.06s,
    transform 0.2s ease;
}

// Compact: out of flow at once (the box shrinks in one layout pass and the FLIP morphs it) and
// fading where they stood; back in flow at once and fading in when the tile expands.
.BoxGridItem.is-compact {
  .BoxGridItem-Title,
  .BoxGridItem-Badge {
    position: absolute;
    top: 40px;
    left: 0;
    right: 0;
    width: max-content;
    max-width: 100%;
    margin: 0 auto;
    opacity: 0;
    transform: scale(0.6);
    pointer-events: none;
    transition:
      opacity 0.12s ease,
      transform 0.18s ease;
  }
}

.BoxGridItem-QuickKey {
  position: absolute;
  top: 6px;
  right: 6px;
  font-size: 10px;
  font-weight: 600;
  padding: 2px 4px;
  border-radius: 8px;
  background: var(--tx-fill-color-dark);
  color: var(--tx-text-color-primary);
  transform-origin: 100% 0;
  transition:
    opacity 0.14s ease,
    transform 0.14s ease;
}

// No room beside a 28px icon for the corner badge, and the title it used to sit above is gone, so
// a compact tile shows the key under the icon instead. Two elements cross-fade: `position` cannot
// animate, and a badge that teleports reads as a glitch.
.BoxGridItem-QuickKeyInline {
  display: none;
  margin-top: 3px;
  padding: 1px 3px;
  font-size: 9px;
  font-weight: 600;
  line-height: 1.1;
  border-radius: 6px;
  background: var(--tx-fill-color-dark);
  color: var(--tx-text-color-primary);
  transform-origin: 50% 0;
}

.BoxGridItem.is-compact {
  .BoxGridItem-QuickKey {
    opacity: 0;
    transform: scale(0.6);
    pointer-events: none;
  }

  .BoxGridItem-QuickKeyInline {
    display: inline-block;
    animation: tile-key-in 0.2s ease both;
  }
}

@keyframes tile-key-in {
  from {
    opacity: 0;
    transform: scale(0.6);
  }

  to {
    opacity: 1;
    transform: none;
  }
}

.BoxGridItem-Badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 12px;
  white-space: nowrap;

  &.badge-frequent {
    background: rgba(255, 107, 107, 0.15);
    color: #ff6b6b;
  }

  &.badge-recent {
    background: rgba(78, 205, 196, 0.15);
    color: #4ecdc4;
  }

  &.badge-trending {
    background: rgba(255, 159, 67, 0.15);
    color: #ff9f43;
  }

  &.badge-intelligent {
    background: rgba(116, 185, 255, 0.15);
    color: #74b9ff;
  }

  &.badge-newly-installed {
    background: rgba(162, 155, 254, 0.15);
    color: #a29bfe;
  }

  &.badge-plugin {
    background: rgba(153, 128, 250, 0.15);
    color: #9980fa;
  }
}
</style>
