<script setup name="IntelligencePrompts" lang="ts">
import { TxButton } from '@talex-touch/tuffex'
import { useAppSdk } from '@talex-touch/utils/renderer'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'

const { t } = useI18n()
const router = useRouter()
const appSdk = useAppSdk()

// TODO: 从存储中获取实际数据
const promptFiles = ref<string[]>([])
const promptCount = computed(() => promptFiles.value.length)
const totalWords = ref(0)

function handlePromptsClick() {
  router.push('/intelligence/prompts')
}

async function handleOpenFolder() {
  try {
    await appSdk.openPromptsFolder()
    toast.success(t('settings.intelligence.landing.prompts.folderOpenSuccess'))
  } catch (error) {
    console.error('Failed to open prompts folder:', error)
    toast.error(t('settings.intelligence.landing.prompts.folderOpenFailed'))
  }
}

function handleCreatePrompt() {
  console.log('Create new prompt file')
  toast.info(t('settings.intelligence.landing.prompts.createPromptHint'))
}
</script>

<template>
  <TuffGroupBlock
    :name="t('settings.intelligence.landing.prompts.title')"
    :description="t('settings.intelligence.landing.prompts.desc')"
    default-icon="i-carbon-language"
    active-icon="i-carbon-language"
    memory-name="intelligence-prompts"
  >
    <!-- 编辑提示词 -->
    <TuffBlockSlot
      :title="t('settings.intelligence.landing.prompts.editTitle')"
      :description="t('settings.intelligence.landing.prompts.editDesc')"
      default-icon="i-carbon-edit"
      active-icon="i-carbon-edit"
      @click="handlePromptsClick"
    >
      <TxButton variant="flat" type="primary" @click="handlePromptsClick">
        <i class="i-carbon-launch" />
        <span>{{ t('settings.intelligence.landing.prompts.editButton') }}</span>
      </TxButton>
    </TuffBlockSlot>

    <!-- 打开文件夹 -->
    <TuffBlockSlot
      :title="t('settings.intelligence.landing.prompts.folderTitle')"
      :description="t('settings.intelligence.landing.prompts.folderDesc')"
      default-icon="i-carbon-folder"
      active-icon="i-carbon-folder"
      @click="handleOpenFolder"
    >
      <TxButton variant="flat" @click="handleOpenFolder">
        <i class="i-carbon-folder-open" />
        <span>{{ t('settings.intelligence.landing.prompts.folderButton') }}</span>
      </TxButton>
    </TuffBlockSlot>

    <!-- 提示词统计 -->
    <TuffBlockSlot
      :title="t('settings.intelligence.landing.prompts.statsTitle', { count: promptCount })"
      :description="t('settings.intelligence.landing.prompts.statsDesc', { words: totalWords })"
      default-icon="i-carbon-chart-bar"
      active-icon="i-carbon-chart-bar"
      @click="handleCreatePrompt"
    >
      <TxButton variant="flat" @click="handleCreatePrompt">
        <i class="i-carbon-add" />
        <span>{{ t('settings.intelligence.landing.prompts.newPromptButton') }}</span>
      </TxButton>
    </TuffBlockSlot>
  </TuffGroupBlock>
</template>

<style lang="scss" scoped></style>
