<script setup lang="ts">
import { computed, ref, watch } from 'vue'

const { locale } = useI18n()

const activeTop = ref('A')
const activeRight = ref('')
const actionWide = ref(false)

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      action: '操作',
      actionWide: '更多操作',
      topA: '顶部 - A',
      topB: '顶部 - B',
      topC: '顶部 - C',
      generalTab: '通用',
      accountTab: '账户',
      rightGeneral: '右侧 - 通用',
      rightAccount: '右侧 - 账户',
    }
  }

  return {
    action: 'Action',
    actionWide: 'More Actions',
    topA: 'Top - A',
    topB: 'Top - B',
    topC: 'Top - C',
    generalTab: 'General',
    accountTab: 'Account',
    rightGeneral: 'Right - General',
    rightAccount: 'Right - Account',
  }
})

watch(
  () => locale.value,
  () => {
    activeRight.value = labels.value.generalTab
  },
  { immediate: true },
)
</script>

<template>
  <div style="display: flex; flex-direction: column; gap: 12px; align-items: stretch;">
    <div style="height: 240px;">
      <TxTabs
        v-model="activeTop"
        placement="top"
        auto-width
        :animation="{ indicator: { durationMs: 220, easing: 'ease' } }"
      >
        <TxTabHeader v-slot="{ props }">
          <div style="display: flex; align-items: center; width: 100%; padding: 10px 12px;">
            <div style="font-weight: 600;">
              {{ props.node?.props?.name }}
            </div>
          </div>
        </TxTabHeader>

        <template #nav-right>
          <TxButton size="small" type="primary" @click="actionWide = !actionWide">
            {{ actionWide ? labels.actionWide : labels.action }}
          </TxButton>
        </template>

        <TxTabItem name="A" activation>
          <div style="padding: 8px;">
            {{ labels.topA }}
          </div>
        </TxTabItem>
        <TxTabItem name="B">
          <div style="padding: 8px;">
            {{ labels.topB }}
          </div>
        </TxTabItem>
        <TxTabItem name="C">
          <div style="padding: 8px;">
            {{ labels.topC }}
          </div>
        </TxTabItem>
      </TxTabs>
    </div>

    <div style="height: 240px;">
      <TxTabs v-model="activeRight" placement="right">
        <TxTabItem :name="labels.generalTab" icon-class="i-carbon-settings" activation>
          <div style="padding: 8px;">
            {{ labels.rightGeneral }}
          </div>
        </TxTabItem>
        <TxTabItem :name="labels.accountTab" icon-class="i-carbon-user">
          <div style="padding: 8px;">
            {{ labels.rightAccount }}
          </div>
        </TxTabItem>
      </TxTabs>
    </div>
  </div>
</template>
