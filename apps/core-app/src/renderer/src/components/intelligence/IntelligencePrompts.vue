<script setup name="IntelligencePrompts" lang="ts">
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import FlatButton from '~/components/base/button/FlatButton.vue'
import { ref, computed } from 'vue'
import { touchChannel } from '~/modules/channel/channel-core'

const { t } = useI18n()
const router = useRouter()

// TODO: 从存储中获取实际数据
const promptFiles = ref<string[]>([])
const promptCount = computed(() => promptFiles.value.length)
const totalWords = ref(0)

function handlePromptsClick() {
  router.push('/intelligence/prompts')
}

async function handleOpenFolder() {
  try {
    await touchChannel.send('app:open-prompts-folder')
    toast.success(t('settings.aisdk.landing.prompts.folderOpenSuccess'))
  } catch (error) {
    console.error('Failed to open prompts folder:', error)
    toast.error(t('settings.aisdk.landing.prompts.folderOpenFailed'))
  }
}

function handleCreatePrompt() {
  console.log('Create new prompt file')
  toast.info(t('settings.aisdk.landing.prompts.createPromptHint'))
}
</script>

<template>
  <tuff-group-block
    :name="t('settings.aisdk.landing.prompts.title')"
    :description="t('settings.aisdk.landing.prompts.desc')"
    default-icon="i-carbon-language"
    active-icon="i-carbon-language"
    memory-name="intelligence-prompts"
  >
    <!-- 编辑提示词 -->
    <tuff-block-slot
      :title="t('settings.aisdk.landing.prompts.editTitle')"
      :description="t('settings.aisdk.landing.prompts.editDesc')"
      default-icon="i-carbon-edit"
      active-icon="i-carbon-edit"
      @click="handlePromptsClick"
    >
      <FlatButton primary @click="handlePromptsClick">
        <i class="i-carbon-launch" />
        <span>{{ t('settings.aisdk.landing.prompts.editButton') }}</span>
      </FlatButton>
    </tuff-block-slot>

    <!-- 打开文件夹 -->
    <tuff-block-slot
      :title="t('settings.aisdk.landing.prompts.folderTitle')"
      :description="t('settings.aisdk.landing.prompts.folderDesc')"
      default-icon="i-carbon-folder"
      active-icon="i-carbon-folder"
      @click="handleOpenFolder"
    >
      <FlatButton @click="handleOpenFolder">
        <i class="i-carbon-folder-open" />
        <span>{{ t('settings.aisdk.landing.prompts.folderButton') }}</span>
      </FlatButton>
    </tuff-block-slot>

    <!-- 提示词统计 -->
    <tuff-block-slot
      :title="t('settings.aisdk.landing.prompts.statsTitle', { count: promptCount })"
      :description="t('settings.aisdk.landing.prompts.statsDesc', { words: totalWords })"
      default-icon="i-carbon-chart-bar"
      active-icon="i-carbon-chart-bar"
      @click="handleCreatePrompt"
    >
      <FlatButton @click="handleCreatePrompt">
        <i class="i-carbon-add" />
        <span>{{ t('settings.aisdk.landing.prompts.newPromptButton') }}</span>
      </FlatButton>
    </tuff-block-slot>
  </tuff-group-block>
</template>

<style lang="scss" scoped>
</style>
