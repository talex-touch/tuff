<script setup lang="ts">
const props = defineProps<{
  data: any;
  i: number;
  active: boolean;
  selected: boolean;
}>();

function highlightText(text: string, matched: Array<any>) {
  if (!matched) return text;

  let result = "";

  const [startIndex, endIndex] = matched;

  // replace text index 2 html
  for (let i = 0; i < text.length; i++) {
    if (i >= startIndex && i <= endIndex) {
      result += `<span class="matched">${text[i]}</span>`;
    } else {
      result += text[i];
    }
  }

  return result;
}

function highlightAbridgeText(text: string, matched: Array<any>) {
  const textArr = text.split(" ");

  const [startIndex, endIndex] = matched;
  const newText = [...textArr].map((item, ind) => {
    if (ind >= startIndex && ind <= endIndex) {
      const [first, ...rest] = item;
      return `<span class="matched">${first}</span>${rest.join("")}`;
    }
    return item;
  });

  return newText;
}
</script>

<template>
  <div class="BoxItem fake-background" :class="{ active, selected }">
    <!-- <div class="BoxItem-Main"> -->
    <img :src="data.icon" :alt="data.name" />
    <!-- </div> -->
    <div class="BoxItem-Content">
      <template v-if="data.descMatched">
        <h5 v-text="data.name" />
        <p v-html="highlightText(data.desc, data.matched)" />
      </template>
      <template v-else-if="data.abridgeMatched">
        <h5 v-html="highlightAbridgeText(data.name, data.matched)" />
        <p>{{ data.desc }}</p>
      </template>
      <template v-else="data.descMatched">
        <h5 v-html="highlightText(data.name, data.matched)" />
        <p>{{ data.desc }}</p>
      </template>

      <span class="end"> {{ (data.pluginType || data.type).toUpperCase() }} </span>

      <span class="index">{{ i }}</span>
      <span class="amo">{{ data.amo }}</span>
    </div>
  </div>
</template>

<style lang="scss">
.matched {
  // opacity: 0.75;
  font-weight: 600;
  filter: invert(0) brightness(150%);
  color: var(--el-color-primary);
}

.index {
  position: absolute;

  right: 8px;
  bottom: 4px;

  opacity: 0.15;
  font-size: 12px;
  color: var(--el-color-primary);
}

.end {
  position: absolute;

  top: 50%;
  right: 1rem;

  opacity: 0.75;
  transform: translateY(-50%);
}

.amo {
  position: absolute;

  right: 8px;
  top: 4px;

  opacity: 0.15;
  font-size: 12px;
  color: var(--el-color-success);
}

.BoxItem {
  &.selected::after {
    z-index: -1;

    left: 0;
    top: 0%;

    width: 100%;
    height: 100%;

    opacity: 0.5;
    border-radius: 0;
    transition: 0.25s;
    box-shadow: 0 0 4px 0 var(--el-color-primary);
  }

  &::after {
    content: "";
    position: absolute;

    left: 6px;
    top: 30%;

    height: 40%;
    width: 3px;

    opacity: 0;
    transition: 0.125s;
    border-radius: 5px;
    box-shadow: 0 0 2px 0 var(--el-color-primary);
    background-color: var(--el-color-primary);
  }

  h5,
  p {
    margin: 0;
  }

  p {
    opacity: 0.75;
    font-size: 12px;
  }

  img {
    width: 40px;
    height: 40px;

    object-fit: none;
  }

  position: relative;
  display: flex;
  padding: 4px 0.75rem;

  gap: 0.5rem;
  align-items: center;

  width: 100%;
  height: 48px;

  cursor: pointer;
  overflow: hidden;
  box-sizing: border-box;

  --fake-radius: 0;
  --fake-inner-opacity: 0;

  &.active {
    &::after {
      opacity: 1;
    }

    --fake-inner-opacity: 0.25;
  }
}
</style>
