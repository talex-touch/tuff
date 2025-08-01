<script setup lang="ts" name="Protocol">
import Protocol from '~/assets/docs/protocol.md?raw'
import AgreementTemplate from '~/components/addon/AgreementTemplate.vue'
import Forbidden from './Forbidden.vue'
import License from './License.vue'

type StepFunction = (call: { comp: any; rect?: { width: number; height: number } }) => void

const step: StepFunction = inject('step')!

function handleAgree(val: boolean): void {
  step({
    comp: val ? License : Forbidden
  })
}
</script>

<template>
  <div class="Protocol">
    <AgreementTemplate :agree="handleAgree" :agreement="Protocol" />
  </div>
</template>

<style lang="scss">
.Protocol {
  position: relative;
  height: 100%;
  padding: 1rem;
}
</style>
