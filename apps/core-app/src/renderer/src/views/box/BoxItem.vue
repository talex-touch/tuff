<!--
  BoxItem Component

  Displays a single item in the search results box.
  Highlights matched text and shows item details like name, description, and type.
-->
<script setup lang="ts">
// Define component props
interface Props {
  data: any
  i: number
  active: boolean
  selected: boolean
}

defineProps<Props>()

/**
 * Highlight matched text in a string
 * Wraps matched characters in span tags with "matched" class
 * @param text - The text to highlight
 * @param matched - Array containing start and end indices of matched text
 * @returns The text with matched characters wrapped in span tags
 */
function highlightText(text: string, matched: Array<any>): string {
  if (!matched) return text

  let result = ''

  const [startIndex, endIndex] = matched

  // Replace text index with HTML span tags for matched characters
  for (let i = 0; i < text.length; i++) {
    if (i >= startIndex && i <= endIndex) {
      result += `<span class="matched">${text[i]}</span>`
    } else {
      result += text[i]
    }
  }

  return result
}

/**
 * Highlight matched text in abridged format
 * Wraps first character of matched words in span tags with "matched" class
 * @param text - The text to highlight
 * @param matched - Array containing start and end indices of matched words
 * @returns Array of text parts with matched words highlighted
 */
function highlightAbridgeText(text: string, matched: Array<any>): string[] {
  const textArr = text.split(' ')

  const [startIndex, endIndex] = matched
  const newText = [...textArr].map((item, ind) => {
    if (ind >= startIndex && ind <= endIndex) {
      const [first, ...rest] = item
      return `<span class="matched">${first}</span>${rest.join('')}`
    }
    return item
  })

  return newText
}
</script>

<!--
  BoxItem Component Template

  Displays a single item in the search results box with icon, name, description, and type.
-->
<template>
  <!-- Main container for box item -->
  <div class="BoxItem fake-background" :class="{ active, selected }">
    <!-- Item icon container -->
    <div class="BoxItem-Icon" relative>
      <PluginIcon :icon="data.icon" :alt="data.name" />
      <!-- Notification badge if amo property exists -->
      <span v-if="data.amo" class="amo" v-text="data.amo"></span>
    </div>

    <!-- Item content container -->
    <div class="BoxItem-Content">
      <!-- Display when description is matched -->
      <template v-if="data.descMatched">
        <h5 v-text="data.name" />
        <p class="desc" v-html="highlightText(data.desc, data.matched)" />
      </template>

      <!-- Display when abridged text is matched -->
      <template v-else-if="data.abridgeMatched">
        <h5 v-html="highlightAbridgeText(data.name, data.matched)" />
        <p class="desc">{{ data.desc }}</p>
      </template>

      <!-- Display when name is matched -->
      <template v-else>
        <h5 v-html="highlightText(data.name, data.matched)" />
        <p class="desc">{{ data.desc }}</p>
      </template>

      <!-- Item type indicator -->
      <span class="end"> {{ (data.pluginType || data.type).toUpperCase() }} </span>
    </div>
  </div>
</template>

<!--
  BoxItem Component Styles

  SCSS styles for the box item including highlighting, layout, and visual effects.
-->
<style lang="scss">
/** Styles for matched text */
.matched {
  font-weight: 600;
  color: var(--el-color-primary);
}

/** Styles for item type indicator */
.end {
  position: absolute;

  top: 50%;
  right: 1rem;

  opacity: 0.75;
  font-size: 12px;
  transform: translateY(-50%);
}

/** Styles for notification badge */
.amo {
  position: absolute;
  display: flex;

  align-items: center;
  justify-content: center;

  right: 0;
  bottom: 0;

  width: 12px;
  height: 12px;

  font-size: 10px;
  line-height: 12px;
  border-radius: 50%;
  background-color: var(--el-color-primary);
}

/** Main box item styles */
.BoxItem {
  /** Styles for selected item */
  &.selected::after {
    z-index: -1;

    left: 0;
    top: 0%;

    width: 100%;
    height: 100%;

    opacity: 0.85;
    transition: 0.25s;
    box-shadow: 0 0 4px 0 var(--el-color-primary);
  }

  /** Styles for active item indicator */
  &::after {
    content: '';
    position: absolute;

    left: 6px;
    top: 30%;

    height: 40%;
    width: 3px;

    opacity: 0;
    transition: 0.125s;
    border-radius: 12px;
    box-shadow: 0 0 2px 0 var(--el-color-primary);
    background-color: var(--el-color-primary);
  }

  /** Reset margins for headings and paragraphs */
  h5,
  p {
    margin: 0;
  }

  /** Description text styles */
  p {
    opacity: 0.75;
    font-size: 12px;
  }

  /** Description text truncation */
  .desc {
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 1;
    -webkit-box-orient: vertical;
  }

  /** Plugin icon container styles */
  .PluginIcon-Container {
    display: block;

    width: 36px;
    height: 36px;
  }

  position: relative;
  display: flex;
  margin: 0.25rem 0.5rem;
  padding: 0.25rem 0.75rem;

  gap: 0.5rem;
  align-items: center;

  width: calc(100% - 1rem);
  height: 44px;

  cursor: pointer;
  overflow: hidden;
  box-sizing: border-box;

  --fake-radius: 0;
  --fake-inner-opacity: 0;

  /** Styles for active item */
  &.active {
    &::after {
      opacity: 1;
    }

    --fake-color: var(--el-bg-color);
    --fake-inner-opacity: 0.85;
  }
}
</style>
