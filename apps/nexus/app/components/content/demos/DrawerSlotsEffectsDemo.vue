<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()
const visibleChrome = ref(false)
const visibleNoChrome = ref(false)
const visibleMaskBlur = ref(false)
const visibleMaskOpacity = ref(false)
const visibleMaskTransparent = ref(false)
const visiblePanelTransparent = ref(false)
const visibleMobileDefault = ref(false)
const visibleMobileDisabled = ref(false)
const visibleCloseControl = ref(false)

const labels = computed(() => (locale.value === 'zh'
  ? {
      chromeTrigger: 'Header / Footer',
      noChromeTrigger: '关闭头尾',
      maskBlurTrigger: 'mask blur',
      maskOpacityTrigger: 'mask opacity',
      maskTransparentTrigger: 'mask transparent',
      panelTransparentTrigger: 'panel transparent',
      mobileDefaultTrigger: 'mobile adapt 默认',
      mobileDisabledTrigger: 'mobile adapt 关闭',
      closeControlTrigger: '关闭行为',
      title: '发布策略',
      subtitle: '自定义 Header、Footer 与 TxDivider 分割线',
      description: 'Header/Footer 的内置分隔线复用 TxDivider。',
      noChromeTitle: '纯内容抽屉',
      noChromeBody: 'showHeader=false 与 showFooter=false 会关闭头尾区域。',
      maskBlurTitle: 'maskEffect = blur',
      maskBlurBody: '默认遮罩：透明度 + backdrop blur。',
      maskOpacityTitle: 'maskEffect = opacity',
      maskOpacityBody: '仅保留透明度遮罩，不启用 blur。',
      maskTransparentTitle: 'maskEffect = transparent',
      maskTransparentBody: '遮罩透明，但仍可点击遮罩关闭。',
      panelTitle: '透明面板',
      panelBody: 'panelTransparent 会让面板半透明，并启用面板自身 blur。',
      mobileDefaultTitle: '移动端默认 bottom',
      mobileDefaultBody: '移动端视口下，direction="right" 会自动以 bottom 打开。',
      mobileDisabledTitle: '保持指定方向',
      mobileDisabledBody: 'mobileAdapt=false 后会保持配置的 right 方向。',
      closeTitle: '持久化抽屉',
      closeBody: '禁用了遮罩点击、Escape 和默认关闭按钮。',
      closeManual: '手动关闭',
      cancel: '取消',
      save: '保存配置',
    }
  : {
      chromeTrigger: 'Header / Footer',
      noChromeTrigger: 'Hide chrome',
      maskBlurTrigger: 'mask blur',
      maskOpacityTrigger: 'mask opacity',
      maskTransparentTrigger: 'mask transparent',
      panelTransparentTrigger: 'panel transparent',
      mobileDefaultTrigger: 'mobile adapt default',
      mobileDisabledTrigger: 'mobile adapt off',
      closeControlTrigger: 'close behavior',
      title: 'Release policy',
      subtitle: 'Custom header, footer, and TxDivider separators',
      description: 'Built-in header/footer separators reuse TxDivider.',
      noChromeTitle: 'Content only drawer',
      noChromeBody: 'showHeader=false and showFooter=false hide both chrome areas.',
      maskBlurTitle: 'maskEffect = blur',
      maskBlurBody: 'Default mask: opacity plus backdrop blur.',
      maskOpacityTitle: 'maskEffect = opacity',
      maskOpacityBody: 'Opacity-only mask without blur.',
      maskTransparentTitle: 'maskEffect = transparent',
      maskTransparentBody: 'Invisible mask that can still close on click.',
      panelTitle: 'Transparent panel',
      panelBody: 'panelTransparent makes the panel translucent and applies panel blur.',
      mobileDefaultTitle: 'Mobile defaults to bottom',
      mobileDefaultBody: 'On mobile viewports, direction="right" opens from bottom.',
      mobileDisabledTitle: 'Preserve direction',
      mobileDisabledBody: 'mobileAdapt=false preserves the requested right direction.',
      closeTitle: 'Persistent drawer',
      closeBody: 'Mask click, Escape, and default close button are disabled.',
      closeManual: 'Close manually',
      cancel: 'Cancel',
      save: 'Save config',
    }))
</script>

<template>
  <div class="drawer-effects-demo__triggers">
    <TxButton @click="visibleChrome = true">
      {{ labels.chromeTrigger }}
    </TxButton>
    <TxButton @click="visibleNoChrome = true">
      {{ labels.noChromeTrigger }}
    </TxButton>
    <TxButton @click="visibleMaskBlur = true">
      {{ labels.maskBlurTrigger }}
    </TxButton>
    <TxButton @click="visibleMaskOpacity = true">
      {{ labels.maskOpacityTrigger }}
    </TxButton>
    <TxButton @click="visibleMaskTransparent = true">
      {{ labels.maskTransparentTrigger }}
    </TxButton>
    <TxButton @click="visiblePanelTransparent = true">
      {{ labels.panelTransparentTrigger }}
    </TxButton>
    <TxButton @click="visibleMobileDefault = true">
      {{ labels.mobileDefaultTrigger }}
    </TxButton>
    <TxButton @click="visibleMobileDisabled = true">
      {{ labels.mobileDisabledTrigger }}
    </TxButton>
    <TxButton @click="visibleCloseControl = true">
      {{ labels.closeControlTrigger }}
    </TxButton>
  </div>

  <TxDrawer v-model:visible="visibleChrome" :title="labels.title" size="min(460px, 92vw)" :mobile-adapt="false">
    <template #header="{ close }">
      <div class="drawer-effects-demo__header">
        <div>
          <strong>{{ labels.title }}</strong>
          <p>{{ labels.subtitle }}</p>
        </div>
        <TxButton variant="ghost" size="sm" icon="i-carbon-close" @click="close" />
      </div>
    </template>

    <div class="drawer-effects-demo__body">
      <p>{{ labels.description }}</p>
    </div>

    <template #footer="{ close }">
      <div class="drawer-effects-demo__footer">
        <TxButton variant="secondary" @click="close">
          {{ labels.cancel }}
        </TxButton>
        <TxButton variant="primary" @click="close">
          {{ labels.save }}
        </TxButton>
      </div>
    </template>
  </TxDrawer>

  <TxDrawer v-model:visible="visibleNoChrome" :title="labels.noChromeTitle" :show-header="false" :show-footer="false" size="420px" :mobile-adapt="false">
    <p>{{ labels.noChromeBody }}</p>
  </TxDrawer>

  <TxDrawer v-model:visible="visibleMaskBlur" :title="labels.maskBlurTitle" mask-effect="blur" size="420px" :mobile-adapt="false">
    <p>{{ labels.maskBlurBody }}</p>
  </TxDrawer>

  <TxDrawer v-model:visible="visibleMaskOpacity" :title="labels.maskOpacityTitle" mask-effect="opacity" size="420px" :mobile-adapt="false">
    <p>{{ labels.maskOpacityBody }}</p>
  </TxDrawer>

  <TxDrawer v-model:visible="visibleMaskTransparent" :title="labels.maskTransparentTitle" mask-effect="transparent" size="420px" :mobile-adapt="false">
    <p>{{ labels.maskTransparentBody }}</p>
  </TxDrawer>

  <TxDrawer v-model:visible="visiblePanelTransparent" :title="labels.panelTitle" mask-effect="opacity" panel-transparent size="420px" :mobile-adapt="false">
    <p>{{ labels.panelBody }}</p>
  </TxDrawer>

  <TxDrawer v-model:visible="visibleMobileDefault" :title="labels.mobileDefaultTitle" direction="right" size="420px">
    <p>{{ labels.mobileDefaultBody }}</p>
  </TxDrawer>

  <TxDrawer v-model:visible="visibleMobileDisabled" :title="labels.mobileDisabledTitle" direction="right" size="420px" :mobile-adapt="false">
    <p>{{ labels.mobileDisabledBody }}</p>
  </TxDrawer>

  <TxDrawer
    v-model:visible="visibleCloseControl"
    :title="labels.closeTitle"
    :close-on-click-mask="false"
    :close-on-press-escape="false"
    :show-close="false"
    size="420px"
    :mobile-adapt="false"
  >
    <div class="drawer-effects-demo__body">
      <p>{{ labels.closeBody }}</p>
      <TxButton @click="visibleCloseControl = false">
        {{ labels.closeManual }}
      </TxButton>
    </div>
  </TxDrawer>
</template>

<style scoped>
.drawer-effects-demo__triggers {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.drawer-effects-demo__header,
.drawer-effects-demo__footer,
.drawer-effects-demo__body {
  display: grid;
  gap: 12px;
}

.drawer-effects-demo__header {
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
}

.drawer-effects-demo__header strong {
  color: var(--tx-text-color-primary);
  font-size: 18px;
}

.drawer-effects-demo__header p,
.drawer-effects-demo__body p {
  margin: 4px 0 0;
  color: var(--tx-text-color-secondary);
}

.drawer-effects-demo__footer {
  grid-template-columns: 1fr 1fr;
}
</style>
