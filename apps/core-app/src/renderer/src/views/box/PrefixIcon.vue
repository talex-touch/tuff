<!--
  PrefixIcon Component

  Displays the prefix icon in the search box.
  Shows the app logo when no feature is active, or the feature icon when a feature is active.
-->
<script setup lang="ts">
// Import the app icon
import AppIcon from '~/assets/logo.svg'

// Import the SearchItem type
import { SearchItem } from '@renderer/modules/box/adapter/types'

// Define component props
interface Props {
  feature?: SearchItem
}

const props = defineProps<Props>()

// Define component emits
const emits = defineEmits(['close'])

const featureName = computed(() => props.feature?.render?.basic?.title)
const featureIcon = computed(() => {
  const icon = props.feature?.render?.basic?.icon
  console.log('icon', icon)
  if (typeof icon === 'string') {
    return {
      type: 'remix',
      value: icon
    }
  }
  if (icon) {
    return icon.value
  }
  return undefined
})
</script>

<!--
  PrefixIcon Component Template

  Displays the prefix icon with app logo or feature information.
-->
<template>
  <!-- Main container for prefix icon -->
  <div :class="{ feature }" class="PrefixIcon transition-cubic">
    <!-- App logo (shown when no feature is active) -->
    <img v-if="!feature" class="transition-cubic" :src="AppIcon" />

    <!-- Feature information (shown when a feature is active) -->
    <div
      v-else
      v-wave
      class="PrefixIcon-Feature fake-background cursor-pointer hover:op-75 flex gap-2 items-center transition-cubic"
      @click="emits('close')"
    >
      <PluginIcon v-if="featureIcon" :icon="featureIcon" :alt="featureName ?? ''" />
      <span>{{ featureName }}</span>
      <div i-ri-close-line />
    </div>
  </div>
</template>

<style lang="scss" scoped>
/** Styles for when a feature is active */
.PrefixIcon.feature img {
  transform: scale(0);
}

.PrefixIcon.feature .PrefixIcon-Feature {
  transform: scale(1);
}

/** Styles for the feature icon container */
.PrefixIcon-Feature {
  /** Plugin icon container styles */
  :deep(.PluginIcon-Container) {
    width: 1.25em;
  }

  padding: 0.25rem 0.5rem;

  border-radius: 12px;
  transform: scale(0);

  background-color: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}
</style>
