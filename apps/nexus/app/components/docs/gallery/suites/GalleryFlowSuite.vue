<script setup lang="ts">
import { computed, ref } from 'vue'
import ClientOnly from '../GallerySpecimenGate.vue'

const props = defineProps<{
  docPath: (slug: string) => string
  cellLabel: (en: string, zh: string) => string
  localeKey: 'en' | 'zh'
}>()

const copy = computed(() => (props.localeKey === 'zh'
  ? {
      flowAria: '订单工作流',
      flowNodes: {
        trigger: { label: '触发', title: '新订单创建', detail: '有新订单时触发' },
        branch: { label: '条件', title: '口味是 Rocky Road', detail: '否则按默认规则补货' },
      },
    }
  : {
      flowAria: 'Order workflow',
      flowNodes: {
        trigger: { label: 'Trigger', title: 'New order created', detail: 'Runs when a new order arrives' },
        branch: { label: 'If / Else', title: 'Flavor is Rocky Road', detail: 'Otherwise restock by the default rule' },
      },
    }))

type FlowSpecimenId = 'trigger' | 'branch'

// Flowchart is controlled: it reports a drag and leaves the write to the host.
// Positions live apart from the copy so a locale switch keeps a dragged node
// where the reader left it.
const flowPositions = ref<Record<FlowSpecimenId, { x: number, y: number }>>({
  trigger: { x: 200, y: 8 },
  branch: { x: 200, y: 150 },
})

const flowNodes = computed(() => [
  { id: 'trigger', tone: 'violet' as const, label: copy.value.flowNodes.trigger.label, ...flowPositions.value.trigger },
  { id: 'branch', tone: 'orange' as const, label: copy.value.flowNodes.branch.label, ...flowPositions.value.branch },
])

const flowEdges = [{ from: 'trigger', to: 'branch' }]

function flowCopy(id: string) {
  return copy.value.flowNodes[id as FlowSpecimenId]
}

function moveFlowNode({ id, x, y }: { id: string, x: number, y: number }): void {
  if (id in flowPositions.value)
    flowPositions.value[id as FlowSpecimenId] = { x, y }
}
</script>

<template>
  <div class="docs-gallery__grid docs-gallery__grid--single">
    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('flowchart')">
        {{ cellLabel('Flowchart', '流程画布') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__flow">
            <TxFlowchart
              :nodes="flowNodes"
              :edges="flowEdges"
              :height="260"
              :node-width="240"
              draggable
              :aria-label="copy.flowAria"
              @node-move="moveFlowNode"
            >
              <template #node="{ node }">
                <div class="docs-gallery__flow-card">
                  <strong>{{ flowCopy(node.id).title }}</strong>
                  <small>{{ flowCopy(node.id).detail }}</small>
                </div>
              </template>
            </TxFlowchart>
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>
  </div>
</template>
