<script setup lang="ts">
import type { IInnerItemMeta } from '~/composables/api/base/v1/aigc/completion-types'

const props = defineProps<{
  data: any
  value: any
}>()

function handleUrl(url: string) {
  window.open(url, '_blank')
}

const dialog = ref(false)
</script>

<template>
  <div class="Music">
    <div flex class="Music-Inner">
      <div v-wave flex cursor-pointer items-center gap-2 class="Music-Content" @click="handleUrl(value.song_url)">
        <div i-carbon:download />
        下载歌曲
      </div>

      <div v-wave flex cursor-pointer items-center gap-2 class="Music-Content" @click="dialog = true">
        <div i-carbon:add /> 查看歌词
      </div>
    </div>
    <p text-sm op-75>
      *请及时下载歌曲，将会在15分钟后失效.
    </p>

    <teleport to="body">
      <el-dialog v-model="dialog" title="歌曲歌词查看">
        <p v-for=" line in data.arguments?.lyrics" :key="line" my-1 text-xl>
          {{ line }}
        </p>
      </el-dialog>
    </teleport>
    <!-- <ChatQueryCollapse>
      <template #Header />
      <p v-for=" line in data.arguments?.lyrics" :key="line">
        {{ line }}
        </p>
        </ChatQueryCollapse> -->
  </div>
</template>

<style lang="scss" scoped>
.Music {
  &-Inner {
    position: relative;
    display: flex;

    margin: 0.5rem;

    justify-content: space-between;
  }
  &-Content {
    position: relative;
    padding: 0.5rem;

    color: #fff;

    font-size: 15px;
    border-radius: 12px;
    background-color: var(--theme-color);
  }

  position: relative;

  width: 300px;

  // width: 20rem;
  // height: 20rem;

  overflow: hidden;
  border-radius: 8px;
}
</style>
