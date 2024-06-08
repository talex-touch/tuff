<script setup lang="ts">
import { vDraggable } from "vue-draggable-plus";
import { onClickOutside } from "@vueuse/core";
import { pluginSettings } from "~/modules/storage/plugin-settings";

const props = defineProps<{
  show: boolean;
  toggle: Function;
}>();

const editor = ref();
onMounted(() => {
  onClickOutside(editor, () => {
    if (props.show) props.toggle();
  });
});

const newSource = reactive({
  name: "",
  url: "",
  adapter: "",
});

function deleteSource(ind: number) {
  pluginSettings.value.source.list.length !== 1 &&
    pluginSettings.value.source.list.splice(ind, 1);
}

function handleAdd() {
  // validate newSource
  if (!newSource.name || !newSource.url || !newSource.adapter) return;

  pluginSettings.value.source.list.push({
    url: newSource.url,
    name: newSource.name,
    adapter: newSource.adapter,
  });
}
</script>

<template>
  <div ref="editor" :class="{ show }" class="transition-cubic MarketSourceEditor">
    <h2 my-2>Source</h2>
    <p op-75 my-1>Edit plugin market source.</p>

    <div
      v-draggable="[
        pluginSettings.source.list,
        { animation: 150, handle: '.handle', ghostClass: 'ghost' },
      ]"
      class="MarketSourceEditor-Content"
    >
      <el-scrollbar>
        <div
          v-for="(item, ind) in pluginSettings.source.list"
          class="MarketSourceEditor-Content-Item Item"
        >
          <div class="handle" />
          <div class="Item-Container">
            <div class="Item-Title">
              {{ item.name }}<span class="adapter">({{ item.adapter }})</span>
            </div>
            <div class="Item-Desc">{{ item.url }}</div>
          </div>
          <div
            :class="{ disabled: pluginSettings.source.list.length === 1 }"
            @click="deleteSource(ind)"
            class="transition-cubic action"
          >
            <div v-if="pluginSettings.source.list.length !== 1" class="i-carbon-close" />
            <div v-else class="i-carbon-carbon-for-salesforce" />
          </div>
        </div>

        <div class="MarketSourceEditor-Content-Item Item New">
          <div class="Item-Container">
            <div flex gap-2 class="Item-Title">
              <FlatInput flex-1 placeholder="Source name" v-model="newSource.name" />
              <!-- <t-select v-model="newSource.adapter">
                <t-select-item v-for="adapter in pluginSettings.source.adapter">{{
                  adapter
                }}</t-select-item>
              </t-select> -->
              <FlatInput
                style="width: 30%"
                placeholder="Source adapter"
                v-model="newSource.adapter"
              />
            </div>
            <div mt-2 class="Item-Desc">
              <FlatInput placeholder="Source url" v-model="newSource.url" />
            </div>
            <FlatButton @click="handleAdd" mt-2> Add </FlatButton>
          </div>
        </div>
      </el-scrollbar>
    </div>
  </div>
</template>

<style lang="scss">
.MarketSourceEditor-Content-Item {
  &.ghost {
    * {
      opacity: 0 !important;
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
    background: radial-gradient(circle, currentColor 10%, transparent 11%) 25% 25%,
      radial-gradient(circle, currentColor 10%, transparent 11%) 75% 25%,
      radial-gradient(circle, currentColor 10%, transparent 11%) 25% 75%,
      radial-gradient(circle, currentColor 10%, transparent 11%) 75% 75%,
      radial-gradient(circle, currentColor 10%, transparent 11%) 25% 50%,
      radial-gradient(circle, currentColor 10%, transparent 11%) 75% 50%;
    background-color: var(--el-fill-color-dark);
    background-size: 50% 50%;
    background-repeat: no-repeat;
    border-radius: 8px 0 0 8px;
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

  cursor: pointer;
  overflow: hidden;
  border-radius: 8px;
  background-color: var(--el-fill-color);
}

.MarketSourceEditor-Content {
  padding: 0.5rem;

  height: 80%;
}

.MarketSourceEditor {
  &.show {
    transform: translate(-50%, -50%);
  }
  z-index: 1;
  position: absolute;
  padding: 1rem;

  top: 50%;
  left: 50%;

  width: 45%;
  height: 60%;

  text-align: center;

  border-radius: 8px;
  transform: translate(-50%, -185%);
  background-color: var(--el-fill-color-light);
  box-shadow: 0 0 8px 2px var(--el-fill-color-light);
  backdrop-filter: blur(18px) saturate(180%);
}
</style>
