<script setup lang="ts" name="License">
import type { Component } from 'vue'
import { useI18n } from 'vue-i18n'
import Protocol from '~/assets/docs/license.md?raw'
import AgreementTemplate from '~/components/addon/AgreementTemplate.vue'
import AccountDo from './AccountDo.vue'
import Forbidden from './Forbidden.vue'

type StepFunction = (call: { comp: Component; rect?: { width: number; height: number } }) => void

const step: StepFunction = inject('step')!
const { t } = useI18n()

function handleAgree(val: boolean): void {
  step({
    comp: val ? AccountDo : Forbidden
  })
}
</script>

<template>
  <div class="License">
    <AgreementTemplate
      :title="t('beginner.license.title')"
      :agree="handleAgree"
      :agreement="Protocol"
    />
  </div>
</template>

<style lang="scss">
.License {
  position: relative;
  height: 100%;
  padding: 1rem;
}
</style>
