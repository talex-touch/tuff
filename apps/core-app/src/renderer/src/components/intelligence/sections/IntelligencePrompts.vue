<script setup name="IntelligencePrompts" lang="ts">
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
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
  router.push('/aisdk/prompts')
}

async function handleOpenFolder() {
  try {
    await touchChannel.send('app:open-prompts-folder')
    ElMessage.success('已打开提示词文件夹')
  } catch (error) {
    console.error('Failed to open prompts folder:', error)
    ElMessage.error('打开文件夹失败')
  }
}

function handleCreatePrompt() {
  console.log('Create new prompt file')
  ElMessage.info('创建提示词功能开发中')
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
      title="编辑提示词"
      description="集中管理系统提示词模板"
      default-icon="i-carbon-edit"
      active-icon="i-carbon-edit"
      @click="handlePromptsClick"
    >
      <FlatButton primary @click="handlePromptsClick">
        <i class="i-carbon-launch" />
        <span>进入编辑</span>
      </FlatButton>
    </tuff-block-slot>

    <!-- 打开文件夹 -->
    <tuff-block-slot
      title="打开文件夹"
      description="查看提示词存储位置"
      default-icon="i-carbon-folder"
      active-icon="i-carbon-folder"
      @click="handleOpenFolder"
    >
      <FlatButton @click="handleOpenFolder">
        <i class="i-carbon-folder-open" />
        <span>打开文件夹</span>
      </FlatButton>
    </tuff-block-slot>

    <!-- 提示词统计 -->
    <tuff-block-slot
      :title="`提示词统计: ${promptCount} 个`"
      :description="`总字数: ${totalWords}`"
      default-icon="i-carbon-chart-bar"
      active-icon="i-carbon-chart-bar"
      @click="handleCreatePrompt"
    >
      <FlatButton @click="handleCreatePrompt">
        <i class="i-carbon-add" />
        <span>新建提示词</span>
      </FlatButton>
    </tuff-block-slot>
  </tuff-group-block>
</template>

<style lang="scss" scoped>
</style>