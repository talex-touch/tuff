<script setup lang="ts">
import CmsMenu from '../cms/CmsMenu.vue'
import CmsMenuItem from '../cms/CmsMenuItem.vue'

defineProps(['data'])

const emits = defineEmits<{
  (e: 'select', data: any): void
}>()

function handleSelect(data: any) {
  // const router = useRouter()

  // router.push({
  //   query: {
  //     doc: data.id,
  //     title: data.title,
  //   },
  // })

  emits('select', data)
}
</script>

<template>
  <div class="GuideAside">
    <div class="GuideAside-Title">
      <h1>Guide.</h1>
    </div>

    <div class="GuideAside-Wrapper">
      <el-scrollbar>
        <!-- <CmsMenu expandable>
          <template #header>
            <div i-carbon-folder />
            所有文档
          </template> -->

        <CmsMenuItem v-for="doc in data" :key="doc.id" :query="doc.title" @click="handleSelect(doc)">
          <div i-carbon-document />
          {{ doc.title }}
        </CmsMenuItem>
        <!-- </CmsMenu> -->
        <div class="GuideAside-Content">
          <!-- <GuideAsideSection
            v-for="(section, index) in GuideAsideList"
            :key="index"
            v-model:selectIndex="selectIndex"
            :title="section.title"
            :GuideAside="section.children"
            @delete="handleDelete"
          /> -->
        </div>
      </el-scrollbar>
    </div>

    <div class="GuideAside-Bottom">
      <DarkToggle />
      <!-- <CloseCheckbox v-model="expand" /> -->
    </div>
  </div>
</template>

<style lang="scss">
div.GuideAside {
  .el-scrollbar__bar.is-vertical {
    width: 3px;
  }
}

.GuideAside-Wrapper {
  &::before {
    z-index: 1;
    content: '';
    position: absolute;

    left: 0;
    bottom: 0px;

    width: 100%;
    height: 50px;

    background: linear-gradient(to top, var(--el-bg-color-page) 0%, #0000 100%);
  }
  position: relative;
  padding-top: 80px;

  width: 100%;
  height: calc(100% - 50px);

  box-sizing: border-box;
}

.GuideAside-Indicator {
  &.expand {
    left: 270px;
  }
  &:hover {
    opacity: 0.75;
    height: 100px;

    cursor: pointer;
    transform: translateX(2px) translateY(-50%);
  }
  z-index: 2;
  position: absolute;

  top: 50%;
  left: 10px;

  width: 8px;
  height: 50px;

  opacity: 0.5;
  border-radius: 100px;
  transform: translateX(0px) translateY(-50%);
  background-color: var(--el-text-color-primary);
  transition: 0.5s cubic-bezier(0.785, 0.135, 0.15, 0.86);
}

.GuideAside-Content {
  position: relative;
  display: flex;
  padding-left: 0.5rem;
  padding-right: 0.5rem;
  padding-top: 80px;
  padding-bottom: 2rem;
  flex-direction: column;

  gap: 0.5rem;
}

.GuideAside {
  &-Title {
    z-index: 2;
    position: absolute;
    padding: 1rem 0;
    font-size: 24px;

    width: 100%;
    height: 70px;

    font-weight: 600;
    text-align: center;

    background-size: 4px 4px;
    background-image: radial-gradient(transparent 1px, var(--el-bg-color) 1px);
    backdrop-filter: saturate(50%) blur(4px);
  }
  &-Bottom {
    position: absolute;
    padding: 0.5rem;
    display: flex;

    align-items: center;
    justify-content: center;

    bottom: 0;

    width: 100%;
    height: 50px;

    box-sizing: border-box;
    // backdrop-filter: blur(18px) saturate(180%);
    background-color: var(--el-bg-color-page);
  }

  .expand & {
    margin-left: 0;

    width: 260px;

    opacity: 1;
    transform: translateX(0);

    pointer-events: all;
    transition:
      0.5s width cubic-bezier(0.785, 0.135, 0.15, 0.86),
      0.75s opacity cubic-bezier(0.785, 0.135, 0.15, 0.86),
      0.75s transform cubic-bezier(0.785, 0.135, 0.15, 0.86);
  }
  z-index: 10;
  position: relative;
  margin-left: -1px;

  width: 0;

  height: 100%;

  opacity: 0;
  pointer-events: none;
  transform: translateX(-100%);
  background-color: var(--el-bg-color);
  border-right: 1px solid var(--el-border-color);
  transition:
    0.75s width cubic-bezier(0.785, 0.135, 0.15, 0.86),
    0.5s opacity cubic-bezier(0.785, 0.135, 0.15, 0.86),
    0.25s transform cubic-bezier(0.785, 0.135, 0.15, 0.86);
}
</style>
