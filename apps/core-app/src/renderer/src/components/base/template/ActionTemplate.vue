<script setup lang="ts" name="ActionTemplate">
import type { VNode } from 'vue'
import { inject, nextTick, useSlots } from 'vue'

interface ActionContext {
  checkForm: () => boolean
  setLoading: (loading: boolean) => void
  [key: string]: unknown
}

interface ActionTemplateProps {
  action: (context: ActionContext) => void
}

const props = defineProps<ActionTemplateProps>()

const checkForm = inject<() => boolean>('checkForm', () => true)
const setLoading = inject<(loading: boolean) => void>('setLoading', () => {})

const slots = useSlots()

function addListener(el: Element): void {
  if (!el) throw new Error('No element found.')

  el.addEventListener('click', () => {
    const context: ActionContext = {
      checkForm,
      setLoading
    }
    props.action?.(context)
  })
}

nextTick(() => {
  const slot = slots.default?.()
  if (slot) {
    slot.forEach((e: VNode) => {
      if (e.el instanceof Element) addListener(e.el)
    })
  }
})
</script>
