<script setup lang="ts">
const props = defineProps<{
  data: any;
  i: number;
  active: boolean;
}>();

function highlightText(text: string, matched: Array<any>) {
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
</script>

<template>
  <div class="BoxItem fake-background" :class="{ active }">
    <!-- <div class="BoxItem-Main"> -->
    <img :src="data.icon" :alt="data.name" />
    <!-- </div> -->
    <div class="BoxItem-Content">
      <template v-if="data.descMatched">
        <h5 v-text="data.name" />
        <p v-html="highlightText(data.desc, data.matched)" />
      </template>
      <template v-else="data.descMatched">
        <h5 v-html="highlightText(data.name, data.matched)" />
        <p>{{ data.desc }}</p>
      </template>

      <span class="index">{{ i }}</span>
      <span class="amo">{{ data.amo }}</span>
    </div>
  </div>
</template>

<style lang="scss">
.matched {
  color: var(--el-color-primary);
  font-weight: 600;
}

.index {
  position: absolute;

  right: 8px;
  bottom: 4px;

  opacity: 0.15;
  font-size: 12px;
  color: var(--el-color-primary);
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
