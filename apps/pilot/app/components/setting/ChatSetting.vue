<script setup lang="ts">
import type { ThHistory } from '../history/history-types'

const props = defineProps<{
  show: boolean
  data: ThHistory
}>()

const emits = defineEmits<{
  (e: 'modelValue:show', show: boolean): void
  (e: 'modelValue:data', data: any): void
}>()

const display = useVModel(props, 'show', emits)
const data = useVModel(props, 'data', emits)

function analyze(item: any) {
  item.agent = JSON.parse(item._agent || '{}')
}
</script>

<template>
  <teleport to="body">
    <div :class="{ display }" class="ChatSettings">
      <div my-2 text-center class="ChatSettings-Header">
        <h1 text-lg font-600>
          CHAT - SETTINGS
        </h1>
        <p op-75>
          {{ data.id }}
        </p>
      </div>

      <div class="ChatSettings-Container">
        <el-scrollbar>
          <el-form mt-4 label-position="left" label-width="auto" :model="data">
            <el-form-item label="Topic">
              <el-input v-model="data.topic" style="width: 90%" :disabled="true" />
            </el-form-item>
            <el-form-item label="Messages">
              <div class="ChatSettings-Messages">
                <div v-for="(item, index) in data.messages" :key="index" class="ChatSettings-Messages-Item">
                  <el-input v-model="item.content" :disabled="true" />

                  <div class="chat-agent-settings">
                    {{ item.agent }}
                    <el-input v-model="item._agent" />
                    <el-button @click="item._agent = JSON.stringify(item.agent)">
                      Get
                    </el-button>
                    <el-button @click="analyze(item)">
                      Apply
                    </el-button>
                  </div>

                  <span class="role">{{ item.role }}</span>
                  |
                  <span class="time">{{ item.date }}</span>
                </div>
              </div>
            </el-form-item>
          </el-form>
        </el-scrollbar>
      </div>
    </div>
  </teleport>
</template>

<style lang="scss">
.chat-agent-settings {
  margin: 0.25rem;
  padding: 0.25rem;

  border: 1px solid var(--el-border-color);
}

.ChatSettings-Messages {
  display: flex;

  flex-direction: column;

  gap: 1rem;
}

.ChatSettings-Container {
  position: relative;

  height: calc(100% - 60px - 1rem);
}

.ChatSettings {
  &.display {
    visibility: unset;
    transform: translate(-50%, -50%) translateY(0);
  }
  z-index: 10;
  position: absolute;
  padding: 1rem;

  top: 50%;
  left: 50%;

  width: 40%;
  height: 45%;

  visibility: hidden;
  border-radius: 16px;
  box-sizing: border-box;
  box-shadow: var(--el-box-shadow);
  background-color: var(--el-bg-color-page);
  transform: translate(-50%, -50%) translateY(300%);
  transition: 0.5s cubic-bezier(0.785, 0.135, 0.15, 0.86);
}
</style>
