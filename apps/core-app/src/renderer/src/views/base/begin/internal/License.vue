<script setup lang="ts" name="License">
import Protocol from '~/assets/docs/license.md?raw'
import AgreementTemplate from '~/components/addon/AgreementTemplate.vue'
import Forbidden from './Forbidden.vue'
import AccountDo from './AccountDo.vue'

type StepFunction = (call: { comp: any; rect?: { width: number; height: number } }) => void

const step: StepFunction = inject('step')!

function handleAgree(val: boolean): void {
  step({
    comp: val ? AccountDo : Forbidden
  })
}
</script>

<template>
  <div class="License">
    <AgreementTemplate title="License" :agree="handleAgree" :agreement="Protocol" />
  </div>
</template>

<style lang="scss">
.License {
  position: relative;
  height: 100%;
  padding: 1rem;
}
</style>
