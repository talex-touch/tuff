<script setup lang="ts">
import type { MarketProviderType } from '@talex-touch/utils/market'
import { onMounted, reactive, ref } from 'vue'
import { onClickOutside } from '@vueuse/core'
import { vDraggable } from 'vue-draggable-plus'
import { marketSourcesStorage } from '~/modules/storage/market-sources'

const props = defineProps<{
  show: boolean
  toggle: Function
}>()

const editor = ref()
onMounted(() => {
  onClickOutside(editor, () => {
    if (props.show) props.toggle()
  })
})

const storageState = marketSourcesStorage.get()
const sources = storageState.sources

const providerTypeOptions: { label: string; value: MarketProviderType }[] = [
  { label: 'Nexus Store', value: 'nexusStore' },
  { label: 'Repository', value: 'repository' },
  { label: 'NPM Package', value: 'npmPackage' }
]

const newSource = reactive({
  name: '',
  url: '',
  type: providerTypeOptions[0]!.value as MarketProviderType
})

function generateSourceId(name: string): string {
  return `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`
}

function deleteSource(ind: number) {
  const list = sources
  if (list.length === 1)
    return

  const target = list[ind]
  if (!target || target.readOnly)
    return

  list.splice(ind, 1)
}

function resetNewSource() {
  newSource.name = ''
  newSource.url = ''
  newSource.type = providerTypeOptions[0]!.value
}

function handleAdd() {
  if (!newSource.name.trim() || !newSource.url.trim())
    return

  const list = sources
  const id = generateSourceId(newSource.name)

  list.push({
    id,
    name: newSource.name.trim(),
    type: newSource.type,
    url: newSource.url.trim(),
    enabled: true,
    priority: list.length ? Math.max(...list.map((item) => item.priority ?? 0)) + 1 : 1,
    trustLevel: 'unverified',
    config: newSource.type === 'nexusStore'
      ? {
          manifestUrl: newSource.url.trim()
        }
      : {},
  })

  resetNewSource()
}
</script>

<template>
  <div ref="editor" :class="{ show }" class="transition-cubic MarketSourceEditor">
    <h2 text-xl my-2 font-bold>Source</h2>
    <p op-75 text-lg>Edit plugin market source.</p>

    <div class="MarketSourceEditor-Container">
      <el-scrollbar>
        <div
          v-draggable="[sources, { animation: 150, handle: '.handle', ghostClass: 'ghost' }]"
          class="MarketSourceEditor-Content"
        >
          <div
            v-for="(item, ind) in sources"
            :key="ind"
            class="MarketSourceEditor-Content-Item Item"
          >
            <div class="handle" />
            <div class="GhostTitle" v-html="item.name" />

            <div class="Item-Container">
              <div class="Item-Title">
                {{ item.name }}<span class="adapter">({{ item.type }})</span>
              </div>
              <div class="Item-Desc">
                {{ item.url }}
              </div>
            </div>
            <div
              :class="{ disabled: sources.length === 1 || item.readOnly }"
              class="transition-cubic action"
              @click="deleteSource(ind)"
            >
              <div v-if="sources.length !== 1 && !item.readOnly" class="i-carbon-close" />
              <div v-else class="i-carbon-carbon-for-salesforce" />
            </div>
          </div>

          <div class="MarketSourceEditor-Content-Item Item New">
            <div class="Item-Container">
              <div flex gap-2 class="Item-Title">
                <FlatInput v-model="newSource.name" flex-1 placeholder="Source name" />
                <select v-model="newSource.type" class="TypeSelect">
                  <option v-for="option in providerTypeOptions" :key="option.value" :value="option.value">
                    {{ option.label }}
                  </option>
                </select>
              </div>
              <div mt-2 class="Item-Desc">
                <FlatInput v-model="newSource.url" placeholder="Source url" />
              </div>
              <FlatButton mt-2 @click="handleAdd"> Add </FlatButton>
            </div>
          </div>
        </div>
      </el-scrollbar>
    </div>
  </div>
</template>

<style lang="scss">
.MarketSourceEditor-Content-Item {
  .GhostTitle {
    position: absolute;
    font-size: 18px;

    line-height: 45px;

    top: 50%;
    left: 50%;
    opacity: 0;
    transition: 0.125s;
    --s: 0;
    transform: translate(-50%, -50%) scale(var(--s));
  }

  &.ghost {
    .Item-Title,
    .Item-Desc,
    .action {
      opacity: 0 !important;
      transition: none !important;
    }

    div.GhostTitle {
      opacity: 1;

      --s: 1;
    }

    border: 2px dashed currentColor;
    background-color: var(--el-fill-color-dark);
  }

  &:hover .action {
    &:hover {
      opacity: 0.95;

      width: 100%;
      font-size: 2rem;
      border-radius: 8px 8px 8px 8px;
    }
    opacity: 1;
    transform: translate(0, 0);
  }

  .action {
    position: absolute;
    display: flex;

    & > div {
      font-weight: 600;
    }
    align-items: center;
    justify-content: center;

    top: 0;
    right: 0;

    width: 10%;
    height: 100%;

    opacity: 0;
    border-radius: 0 8px 8px 0;
    transform: translateX(100%);
    background-color: var(--el-color-danger);
    &.disabled {
      background-color: var(--el-color-success);
    }
  }

  .handle {
    position: absolute;

    top: 0;
    left: 0;

    width: 5%;
    height: 100%;

    cursor: move;
    background:
      radial-gradient(circle, currentColor 10%, transparent 11%) 25% 25%,
      radial-gradient(circle, currentColor 10%, transparent 11%) 75% 25%,
      radial-gradient(circle, currentColor 10%, transparent 11%) 25% 75%,
      radial-gradient(circle, currentColor 10%, transparent 11%) 75% 75%,
      radial-gradient(circle, currentColor 10%, transparent 11%) 25% 50%,
      radial-gradient(circle, currentColor 10%, transparent 11%) 75% 50%;
    background-color: var(--el-fill-color-dark);
    background-size: 50% 50%;
    background-repeat: no-repeat;
    border-radius: 12px 0 0 12px;
  }

  .Item-Container {
    position: relative;
    text-align: left;

    left: 6%;
    .Item-Title {
      .adapter {
        margin-left: 2px;
        opacity: 0.58;
      }
      font-weight: 600;
    }
    .Item-Desc {
      opacity: 0.75;
    }
  }
  &.New .Item-Container {
    left: 0%;
    .Item-Title {
      .adapter {
        margin-left: 2px;
        opacity: 0.58;
      }
      font-weight: 600;
    }
    .Item-Desc {
      opacity: 0.75;
    }
  }
  position: relative;
  margin: 0.5rem;
  padding: 0.5rem;

  height: 65px;

  cursor: pointer;
  overflow: hidden;
  border-radius: 12px;
  border: 2px dashed transparent;
  background-color: var(--el-fill-color);
}

.MarketSourceEditor-Content {
  padding: 0.5rem;

  height: 100%;
}

.MarketSourceEditor-Container {
  height: 80%;
}

.TypeSelect {
  width: 30%;
  padding: 0.35rem 0.5rem;
  border-radius: 10px;
  border: 1px solid var(--el-border-color);
  background-color: var(--el-color-primary-light-9);
  color: var(--el-text-color-primary);
}

.MarketSourceEditor {
  &.show {
    transform: translate(-50%, -50%);
  }
  z-index: 100;
  position: absolute;
  padding: 1rem;

  top: 50%;
  left: 50%;

  width: 45%;
  height: 60%;

  text-align: center;

  border-radius: 12px;
  transform: translate(-50%, -200%);
  background-color: var(--el-fill-color-light);
  // box-shadow: 0 0 8px 2px var(--el-fill-color-light);
  backdrop-filter: blur(18px) saturate(180%);
}
</style>
