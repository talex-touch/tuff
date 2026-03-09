<script setup lang="ts">
import type { IChatConversation } from '~/composables/api/base/v1/aigc/completion-types'
import { $endApi } from '~/composables/api/base'
import { createTapTip } from '~/composables/tip'

const props = defineProps<{
  modelValue: IChatConversation
}>()

const shareOptions = reactive<any>({
  visible: false,
  loading: false,
  waiting: false,
  data: null,
  share: null,
  origin: location.origin,
})

async function openShareDialog() {
  shareOptions.loading = true

  await sleep(500)

  shareOptions.visible = true

  const shareData = await $endApi.v1.aigc.getChatShareMessage(props.modelValue.id)

  shareOptions.share = reactive(shareData.data)

  await sleep(200)

  shareOptions.loading = false

  return computed(() => shareOptions.visible)
}

async function createShareLink() {
  shareOptions.waiting = true

  const tip = createTapTip()

  tip.setMessage('正在创建分享对话').setLoading(true).setType(TipType.INFO).show()

  await sleep(600)

  const res = await $endApi.v1.aigc.createShareMessage(props.modelValue.id)

  if (res.code === 200 && res.data) {
    shareOptions.share = reactive(res.data)
    shareOptions.origin = location.origin

    tip.setMessage('分享链接已创建').setLoading(false).setType(TipType.SUCCESS).show()
  }
  else {
    tip.setMessage(`分享链接创建失败0(${res.message})`).setLoading(false).setType(TipType.ERROR).show()
  }

  await sleep(200)

  shareOptions.waiting = false
}

// 判断是否需要更新
const update = computed(() => {
  const time = shareOptions.share?.updatedAt
  if (!time)
    return false

  const date = new Date(time)

  return props.modelValue.lastUpdate >= date.getTime()
})

defineExpose({
  openShareDialog,
})
</script>

<template>
  <DialogTouchDialog v-model="shareOptions.visible" header :footer="false" :loading="shareOptions.loading">
    <template #Title>
      <div i-carbon:share />
      <span>分享对话</span>
    </template>

    <p px-2>
      <el-text>您的个人信息、自定义指令以及您在共享后添加的任何消息都将予以保密处理。<el-link>了解更多</el-link></el-text>
    </p>

    <template v-if="update">
      <div class="ShareButton" disabled>
        <span class="url">
          {{ shareOptions.origin
          }}<span v-if="shareOptions.share?.uuid">?share={{ shareOptions.share.uuid }}</span></span>

        <div v-loader="shareOptions.waiting" v-wave class="ShareButton-Inner" @click="createShareLink">
          <div i-carbon:share />
          <span>更新链接</span>
        </div>
      </div>

      <p px-4>
        自上次共享后，会话被修改。
      </p>
      <p px-4>
        已共享此聊天的旧版本。您可以通过设置管理此前共享的聊天。
      </p>
    </template>
    <template v-else-if="shareOptions.share?.uuid">
      <div class="ShareButton" disabled>
        <span class="url">
          {{ shareOptions.origin
          }}<span v-if="shareOptions.share?.uuid">?share={{ shareOptions.share.uuid }}</span></span>

        <div
          v-loader="shareOptions.waiting" v-wave v-copy="`${shareOptions.origin}?share=${shareOptions.share.uuid}`"
          class="ShareButton-Inner"
        >
          <div i-carbon:share />
          <span>复制链接</span>
        </div>
      </div>

      <p px-4>
        已共享此聊天。您可以通过设置管理共享的聊天。
      </p>
    </template>

    <div v-else class="ShareButton" disabled>
      <span class="url">
        {{ shareOptions.origin
        }}<span v-if="shareOptions.share?.uuid">?share={{ shareOptions.share.uuid }}</span></span>

      <div v-loader="shareOptions.waiting" v-wave class="ShareButton-Inner" @click="createShareLink">
        <div i-carbon:share />
        <span>创建链接</span>
      </div>
    </div>
  </DialogTouchDialog>
</template>

<style lang="scss">
.ShareButton {
  .url {
    max-width: 85%;

    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  span {
    width: 80%;
  }

  &-Inner {
    &:hover {
      background-color: var(--el-fill-color-light);
    }

    position: absolute;
    padding: 0.75rem;
    display: flex;

    gap: 0.5rem;
    align-items: center;
    justify-content: center;

    height: 48px;
    right: 6px;

    cursor: pointer;
    border-radius: 12px;
    background-color: var(--el-fill-color);

    color: var(--el-text-color-primary);
  }

  position: relative;
  margin: 1rem 0;
  display: flex;
  padding: 1rem;

  width: 95%;
  left: 2.5%;

  height: 64px;

  font-size: 18px;
  align-items: center;
  justify-content: space-between;

  overflow: hidden;
  border-radius: 18px;
  color: var(--el-text-color-secondary);
  border: 1px solid var(--el-border-color);
}
</style>
