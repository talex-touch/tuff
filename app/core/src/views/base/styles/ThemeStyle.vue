<template>
  <ViewTemplate name="Styles">
    <WindowSectionVue
      tip=""
    >
      <SectionItem tip="Click to select." v-model="themeStyle.theme.window" title="Default">
      </SectionItem>
      <!-- :disabled="os?.version !== 'Windows 10 Pro'" -->
      <SectionItem
        tip="Mica style may impact device performance."
        v-model="themeStyle.theme.window"
        title="Mica"
        :disabled="os?.type !== 'Windows_NT'"
      >
      </SectionItem>
      <SectionItem
        v-model="themeStyle.theme.window"
        tip="This feature only supports Windows."
        title="Filter"
        :disabled="true"
      >
      </SectionItem>
    </WindowSectionVue>

    <t-group-block
      name="Personalized"
      icon="earth"
      description="Personalized your app"
    >
      <t-block-select
        @change="handleThemeChange"
        v-model="styleValue"
        title="Color Style"
        :icon="themeStyle.theme.style.dark ? 'moon' : 'lightbulb'"
        iconChange="line"
        description="Set color main style"
      >
        <t-select-item name="light">Light Style</t-select-item>
        <t-select-item name="dark">Dark Style</t-select-item>
        <t-select-item name="auto">Follow System</t-select-item>
      </t-block-select>
    </t-group-block>

    <t-group-switch
      :expand-fill="true"
      name="Emphasis"
      icon="record-circle"
      description="Different emphasis is suitable for different people, if the color clear is not recommended"
    >
      <t-block-switch
        v-model="themeStyle.theme.addon.coloring"
        title="Coloring"
        description="As the main interface to emphasize the coloring"
        icon="contrast-drop-2"
      />
      <t-block-switch
        disabled
        v-model="themeStyle.theme.addon.contrast"
        title="High Contrast
        "
        description="
          Suitable for amblyopia and light sensitive contrast pattern
        "
        icon="contrast"
      />
    </t-group-switch>

    <t-block-switch
      guidance
      title="Theme Help"
      description="
        Find help in the official Github Discussions
      "
      icon="search-2"
    />
  </ViewTemplate>
</template>

<script name="ThemeStyle" lang="ts" setup>
import TGroupBlock from "@comp/base/group/TGroupBlock.vue";
import TBlockSelect from "@comp/base/select/TBlockSelect.vue";
import TSelectItem from "@comp/base/select/TSelectItem.vue";
import ViewTemplate from "@comp/base/template/ViewTemplate.vue";
import TGroupSwitch from "@comp/base/group/TGroupBlock.vue";
import TBlockSwitch from "@comp/base/switch/TBlockSwitch.vue";
import WindowSectionVue from "./WindowSection.vue";
import SectionItem from "./SectionItem.vue";
import { $t } from "@modules/lang";
import { useEnv } from "~/modules/hooks/env-hooks";
import {
  themeStyle,
  triggerThemeTransition,
} from "~/modules/storage/AppStorage";

const os = ref();
const styleValue = ref(0);

watchEffect(() => {
  if (themeStyle.value.theme.style.auto) styleValue.value = 2;
  else if (themeStyle.value.theme.style.dark) styleValue.value = 1;
  else styleValue.value = 0;
});

function handleThemeChange(v: string, e: MouseEvent) {
  triggerThemeTransition([e.x, e.y], v);
}

onMounted(async () => {
  console.log( useEnv() )
  os.value = useEnv().os;
});
</script>

<style>
.Mica {
  filter: blur(16px) saturate(180%) brightness(1.125);
}

.Default {
  filter: saturate(180%);
}

.Filter {
  filter: blur(5px) saturate(180%);
}
</style>
