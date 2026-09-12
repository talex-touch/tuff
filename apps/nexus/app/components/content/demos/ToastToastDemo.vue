<script setup lang="ts">
import type { TxToastPosition } from '@talex-touch/tuffex/toast'
import type { TxToastVariant } from '@talex-touch/tuffex/utils'
import { toast } from '@talex-touch/tuffex/utils'
import { computed, ref } from 'vue'

const { locale } = useI18n()

const position = ref<TxToastPosition>('bottom-right')
const expand = ref(false)

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      saved: '已保存',
      savedBody: '草稿已同步到云端。',
      stack: '堆三条',
      withAction: '带操作',
      deleted: '已删除 1 项',
      undo: '撤销',
      expand: '常驻展开',
      hint: '把指针移到通知上：栈会展开，计时也会停住。向下拖可以甩掉一条。',
      variants: { success: '成功', warning: '警告', danger: '错误', info: '信息' },
    }
  }

  return {
    saved: 'Saved',
    savedBody: 'Your draft is synced to the cloud.',
    stack: 'Stack 3',
    withAction: 'With action',
    deleted: 'Deleted 1 item',
    undo: 'Undo',
    expand: 'Keep expanded',
    hint: 'Hover the stack: it fans out and the countdowns stop. Drag one toward the edge to flick it away.',
    variants: { success: 'Success', warning: 'Warning', danger: 'Danger', info: 'Info' },
  }
})

const variants: TxToastVariant[] = ['success', 'warning', 'danger', 'info']

function fire(variant: TxToastVariant) {
  toast({ title: labels.value.saved, description: labels.value.savedBody, variant })
}

function fireStack() {
  variants.slice(0, 3).forEach((variant, i) => {
    globalThis.setTimeout(() => fire(variant), i * 140)
  })
}

function fireAction() {
  toast({
    title: labels.value.deleted,
    action: { label: labels.value.undo, onClick: () => fire('success') },
  })
}
</script>

<template>
  <div class="tx-demo tx-demo__col" style="gap: 14px;">
    <TxToastHost :position="position" :expand="expand" />

    <TxFlatRadio v-model="position" size="sm">
      <TxFlatRadioItem value="top-left" label="top-left" />
      <TxFlatRadioItem value="top-center" label="top-center" />
      <TxFlatRadioItem value="top-right" label="top-right" />
      <TxFlatRadioItem value="bottom-left" label="bottom-left" />
      <TxFlatRadioItem value="bottom-center" label="bottom-center" />
      <TxFlatRadioItem value="bottom-right" label="bottom-right" />
    </TxFlatRadio>

    <div class="toast-demo__row">
      <TxButton size="small" @click="fireStack">
        {{ labels.stack }}
      </TxButton>
      <TxButton
        v-for="v in variants"
        :key="v"
        size="small"
        variant="ghost"
        @click="fire(v)"
      >
        {{ labels.variants[v as 'success' | 'warning' | 'danger' | 'info'] }}
      </TxButton>
      <TxButton size="small" variant="ghost" @click="fireAction">
        {{ labels.withAction }}
      </TxButton>
    </div>

    <TxSwitch v-model="expand" :label="labels.expand" />

    <div class="tx-demo__meta">
      {{ labels.hint }}
    </div>
  </div>
</template>

<style scoped>
.toast-demo__row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
