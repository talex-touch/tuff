<script setup lang="ts">
const expand = ref(false)

const buttons = reactive([
  {
    title: '添加表情',
    icon: 'i-carbon:face-add',
  },
  {
    title: '润色文本',
    icon: 'i-carbon:clean',
  },
  {
    title: '理解等级',
    icon: 'i-carbon:book',
  },
  {
    title: '调整篇幅',
    icon: 'i-carbon:text-line-spacing',
  },
  {
    title: '智能建议',
    icon: 'i-carbon:magic-wand',
  },
])
</script>

<template>
  <div :class="{ expand }" class="PaperFav transition-cubic" @click="expand = !expand">
    <div v-for="(item, index) in buttons" :key="index" class="PaperFav-Item">
      <el-tooltip :content="item.title" placement="left">
        <div :class="item.icon" />
      </el-tooltip>
    </div>

    <div class="PaperFav-Icon">
      <div i-carbon:pen-fountain />
    </div>
  </div>
</template>

<style lang="scss">
.PaperFav {
  &.expand {
    max-height: 300px;

    border-radius: 16px;
  }

  z-index: 1;
  position: absolute;
  padding: 1rem 0;
  display: flex;

  align-items: center;
  flex-direction: column;
  justify-content: space-between;

  width: 48px;
  height: auto;
  max-height: 48px;

  gap: 1rem;
  right: 2rem;
  bottom: 2rem;

  cursor: pointer;
  font-weight: 600;

  overflow: hidden;
  border-radius: 50%;
  box-shadow: var(--el-box-shadow);
  background-color: var(--el-bg-color);
}

.PaperFav-Item,
.PaperFav-Icon {
  &:hover {
    color: var(--el-text-color-primary);
  }

  display: flex;

  align-items: center;
  justify-content: center;

  width: 32px;
  height: 32px;

  font-size: 20px;
  font-weight: 600;

  color: var(--el-text-color-secondary);
}

.PaperFav-Icon {
  .expand & {
    opacity: 0;
    pointer-events: none;
  }
  position: absolute;

  left: 50%;
  bottom: 0;

  width: 48px;
  height: 48px;

  transform: translateX(-50%);
  background-color: var(--el-bg-color);

  &:hover {
    background-color: var(--el-bg-color-page);
  }
}
</style>
