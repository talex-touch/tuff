<!--
  SettingSentry Component

  Sentry privacy controls and analytics settings
-->
<script setup lang="ts" name="SettingSentry">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import FlatButton from '~/components/base/button/FlatButton.vue'
import TuffBlockLine from '~/components/tuff/TuffBlockLine.vue'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import TuffBlockSwitch from '~/components/tuff/TuffBlockSwitch.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import { touchChannel } from '~/modules/channel/channel-core'

const { t } = useI18n()

const NEXUS_URL = import.meta.env.VITE_NEXUS_URL || 'https://tuff.tagzxia.com'

const enabled = ref(false)
const anonymous = ref(true)
const loading = ref(false)
const searchCount = ref(0)

async function loadConfig() {
  try {
    const config = (await touchChannel.send('storage:get', 'sentry-config.json')) as {
      enabled?: boolean
      anonymous?: boolean
    }
    enabled.value = config?.enabled ?? false
    anonymous.value = config?.anonymous ?? true

    try {
      const count = await touchChannel.send('sentry:get-search-count')
      searchCount.value = count || 0
    }
    catch {
      // Ignore if unavailable
    }
  }
  catch (error) {
    console.error('Failed to load Sentry config', error)
  }
}

async function saveConfig() {
  loading.value = true
  try {
    await touchChannel.send('storage:save', {
      key: 'sentry-config.json',
      content: JSON.stringify({
        enabled: enabled.value,
        anonymous: anonymous.value,
      }),
    })
    toast.success(t('settingSentry.saveSuccess', '设置已保存'))
  }
  catch (error) {
    console.error('Failed to save Sentry config', error)
    toast.error(t('settingSentry.saveError', '保存设置失败'))
  }
  finally {
    loading.value = false
  }
}

async function updateEnabled(value: boolean) {
  enabled.value = value
  await saveConfig()
}

async function updateAnonymous(value: boolean) {
  anonymous.value = value
  await saveConfig()
}

function openPrivacySettings() {
  const privacyUrl = `${NEXUS_URL}/dashboard/privacy`
  touchChannel.send('open-external', { url: privacyUrl })
}

function openSentryDashboard() {
  touchChannel.send('open-external', { url: 'https://sentry.io' })
}

onMounted(() => {
  loadConfig()
})
</script>

<template>
  <TuffGroupBlock
    :name="t('settingSentry.title', 'Sentry 数据分析')"
    :description="t('settingSentry.groupDesc', '帮助改进应用体验')"
    default-icon="i-carbon-chart-bar"
    active-icon="i-carbon-chart-column"
    memory-name="setting-sentry"
  >
    <section class="SentryBanner">
      <p>
        {{
          t(
            'settingSentry.descriptionText',
            '启用数据分析可以帮助我们改进应用性能和用户体验。所有数据都经过匿名化处理，不会包含敏感信息。',
          )
        }}
      </p>
    </section>

    <TuffBlockSwitch
      v-model="enabled"
      :title="t('settingSentry.enableDataUpload', '启用数据上传')"
      :description="t('settingSentry.enableDesc', '上传匿名性能指标，帮助快速定位问题。')"
      default-icon="i-carbon-cloud"
      active-icon="i-carbon-cloud"
      :loading="loading"
      @update:model-value="updateEnabled"
    />

    <TuffBlockSwitch
      v-if="enabled"
      v-model="anonymous"
      :title="t('settingSentry.anonymousMode', '匿名模式')"
      :description="t('settingSentry.anonymousDesc', '仅记录必要字段，不包含个人身份信息。')"
      default-icon="i-carbon-user-avatar"
      active-icon="i-carbon-user-avatar-filled"
      :loading="loading"
      @update:model-value="updateAnonymous"
    />

    <TuffBlockLine v-if="enabled" :title="t('settingSentry.searchCount', '已记录搜索次数')">
      <template #description>
        <span class="font-mono text-base text-[var(--el-text-color-primary)]">
          {{ searchCount }}
        </span>
      </template>
    </TuffBlockLine>

    <section v-if="enabled && !anonymous" class="SentryBanner warning">
      <p>
        {{
          t(
            'settingSentry.warning',
            '非匿名模式下，会包含设备指纹信息以帮助追踪问题。用户 ID 仅在登录时包含。',
          )
        }}
      </p>
    </section>

    <!-- Privacy Management -->
    <TuffBlockSlot
      :title="t('settingSentry.privacyManagement', '隐私数据管理')"
      :description="t('settingSentry.privacyManagementDesc', '在官网管理您的隐私设置和数据')"
      default-icon="i-carbon-security"
      active-icon="i-carbon-security"
      @click="openPrivacySettings"
    >
      <FlatButton mini>
        <span class="i-carbon-launch text-sm" />
      </FlatButton>
    </TuffBlockSlot>

    <!-- Learn More -->
    <section class="SentryLinks">
      <a class="sentry-link" @click="openSentryDashboard">
        <span class="i-carbon-information text-sm" />
        {{ t('settingSentry.learnMore', '了解 Sentry 如何处理数据') }}
      </a>
    </section>
  </TuffGroupBlock>
</template>

<style scoped lang="scss">
.SentryBanner {
  padding: 16px 18px;
  border-radius: 14px;
  border: 1px solid var(--el-border-color-lighter);
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--el-color-primary) 5%, transparent) 0%,
    color-mix(in srgb, var(--el-color-primary) 8%, transparent) 100%
  );
  margin-bottom: 12px;
  color: var(--el-text-color-regular);
  font-size: 13px;
  line-height: 1.7;
  backdrop-filter: blur(8px);

  p {
    margin: 0;
  }
}

.SentryBanner.warning {
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--el-color-warning) 8%, transparent) 0%,
    color-mix(in srgb, var(--el-color-warning) 12%, transparent) 100%
  );
  border-color: color-mix(in srgb, var(--el-color-warning) 30%, var(--el-border-color-lighter));
  color: var(--el-text-color-regular);

  :deep(.dark) & {
    color: var(--el-color-warning-light-3);
  }
}

.SentryLinks {
  margin-top: 12px;
  padding: 8px 12px;
  background: var(--el-fill-color-lighter);
  border-radius: 10px;
  display: inline-flex;
}

.sentry-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--el-color-primary);
  cursor: pointer;
  transition: all 0.2s ease;
  padding: 4px 0;

  &:hover {
    opacity: 0.85;
    transform: translateX(2px);
  }

  span {
    font-size: 14px;
  }
}
</style>
