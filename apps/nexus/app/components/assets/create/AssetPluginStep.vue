<script setup lang="ts">
const emit = defineEmits<{
  (e: 'open-plugin-drawer'): void
}>()

const { t } = useI18n()
</script>

<template>
  <div class="AssetPluginStep">
    <div class="AssetPluginStep-Card">
      <p class="AssetPluginStep-Title">
        {{ t('dashboard.sections.plugins.assetCreate.pluginTitle', 'Plugin Publishing') }}
      </p>
      <p class="AssetPluginStep-Desc">
        {{
          t(
            'dashboard.sections.plugins.assetCreate.pluginDesc',
            'You selected plugin. Next step opens the full publishing form with package parsing, icon extraction, channel, and metadata fields.'
          )
        }}
      </p>

      <div class="AssetPluginStep-Tips">
        <p>
          <span class="i-carbon-checkmark" />
          {{ t('dashboard.sections.plugins.assetCreate.pluginTips.package', 'Supports .tpex package parsing and manifest autofill') }}
        </p>
        <p>
          <span class="i-carbon-checkmark" />
          {{ t('dashboard.sections.plugins.assetCreate.pluginTips.release', 'Supports RELEASE / BETA / SNAPSHOT channel workflow') }}
        </p>
        <p>
          <span class="i-carbon-checkmark" />
          {{ t('dashboard.sections.plugins.assetCreate.pluginTips.resource', 'Can reference CSS/layout presets and image resources later') }}
        </p>
      </div>

      <div class="AssetPluginStep-Actions">
        <TxButton variant="primary" size="small" @click="emit('open-plugin-drawer')">
          <span class="i-carbon-launch mr-1" />
          {{
            t(
              'dashboard.sections.plugins.assetCreate.pluginContinue',
              'Continue to Plugin Form'
            )
          }}
        </TxButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
.AssetPluginStep {
  width: min(860px, 92vw);
  padding: 12px;
}

.AssetPluginStep-Card {
  border-radius: 16px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  background: rgba(255, 255, 255, 0.92);
  padding: 18px;

  .dark & {
    border-color: rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.04);
  }
}

.AssetPluginStep-Title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: rgba(0, 0, 0, 0.88);

  .dark & {
    color: rgba(255, 255, 255, 0.9);
  }
}

.AssetPluginStep-Desc {
  margin: 10px 0 0;
  font-size: 13px;
  line-height: 1.6;
  color: rgba(0, 0, 0, 0.58);

  .dark & {
    color: rgba(255, 255, 255, 0.6);
  }
}

.AssetPluginStep-Tips {
  margin-top: 14px;
  display: grid;
  gap: 8px;

  p {
    margin: 0;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: rgba(0, 0, 0, 0.66);

    .dark & {
      color: rgba(255, 255, 255, 0.66);
    }
  }
}

.AssetPluginStep-Actions {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}
</style>
