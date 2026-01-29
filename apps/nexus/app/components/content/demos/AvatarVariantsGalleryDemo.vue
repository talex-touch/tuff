<script setup lang="ts">
import { ref } from 'vue'
import AvatarVariantCard from './AvatarVariantCard.vue'

type Category = 'All' | 'Status' | 'Activity' | 'Platform' | 'System' | 'Social' | 'Context'

const tabs: Category[] = ['All', 'Status', 'Activity', 'Platform', 'System', 'Social', 'Context']
const activeTab = ref<Category>('All')

function isActive(category: Category) {
  return activeTab.value === 'All' || activeTab.value === category
}
</script>

<template>
  <div class="tx-avatar-variants">
    <div class="tx-avatar-variants__tabs">
      <TxRadioGroup v-model="activeTab" type="button" indicator-variant="glass" glass>
        <TxRadio v-for="tab in tabs" :key="tab" :value="tab" :label="tab" />
      </TxRadioGroup>
    </div>

    <div class="tx-avatar-variants__grid">
      <!-- Status -->
      <AvatarVariantCard v-show="isActive('Status')" category="Status" title="Online Dot" desc="Classic green status indicator with ring offset.">
        <template #preview>
          <TxCornerOverlay placement="bottom-right" :offset-x="-2" :offset-y="-2">
            <TxAvatar src="https://i.pravatar.cc/150?u=online" size="large" />
            <template #overlay>
              <span class="tx-avatar-variants__dot tx-avatar-variants__dot--online" />
            </template>
          </TxCornerOverlay>
        </template>
      </AvatarVariantCard>

      <AvatarVariantCard v-show="isActive('Status')" category="Status" title="Offline / Gray" desc="Muted gray status dot.">
        <template #preview>
          <TxCornerOverlay placement="bottom-right" :offset-x="-2" :offset-y="-2">
            <TxAvatar src="https://i.pravatar.cc/150?u=offline" size="large" class="tx-avatar-variants__grayscale" />
            <template #overlay>
              <span class="tx-avatar-variants__dot tx-avatar-variants__dot--offline" />
            </template>
          </TxCornerOverlay>
        </template>
      </AvatarVariantCard>

      <AvatarVariantCard v-show="isActive('Status')" category="Status" title="Busy / DND" desc="Red circle with minus sign.">
        <template #preview>
          <TxCornerOverlay placement="bottom-right" :offset-x="-4" :offset-y="-4">
            <TxAvatar src="https://i.pravatar.cc/150?u=busy" size="large" />
            <template #overlay>
              <span class="tx-avatar-variants__dnd">
                <span class="tx-avatar-variants__dnd-line" />
              </span>
            </template>
          </TxCornerOverlay>
        </template>
      </AvatarVariantCard>

      <AvatarVariantCard v-show="isActive('Status')" category="Status" title="Away / Idle" desc="Amber moon icon indicating away status.">
        <template #preview>
          <TxCornerOverlay placement="bottom-right" :offset-x="-4" :offset-y="-4">
            <TxAvatar src="https://i.pravatar.cc/150?u=away" size="large" />
            <template #overlay>
              <span class="tx-avatar-variants__badge tx-avatar-variants__badge--amber">
                <TxIcon name="i-carbon-moon" :size="14" class="tx-avatar-variants__icon--white" />
              </span>
            </template>
          </TxCornerOverlay>
        </template>
      </AvatarVariantCard>

      <AvatarVariantCard v-show="isActive('Status')" category="Status" title="Muted" desc="Mic off in corner.">
        <template #preview>
          <TxCornerOverlay placement="bottom-right" :offset-x="-4" :offset-y="-4">
            <TxAvatar src="https://i.pravatar.cc/150?u=muted" size="large" class="tx-avatar-variants__grayscale" />
            <template #overlay>
              <span class="tx-avatar-variants__badge tx-avatar-variants__badge--dark">
                <TxIcon name="i-carbon-microphone-off" :size="14" class="tx-avatar-variants__icon--white" />
              </span>
            </template>
          </TxCornerOverlay>
        </template>
      </AvatarVariantCard>

      <AvatarVariantCard v-show="isActive('Status')" category="Status" title="Warning / Error" desc="Warning badge overlay.">
        <template #preview>
          <TxCornerOverlay placement="bottom-right" :offset-x="-2" :offset-y="-2">
            <TxAvatar src="https://i.pravatar.cc/150?u=warn" size="large" />
            <template #overlay>
              <span class="tx-avatar-variants__badge tx-avatar-variants__badge--light">
                <TxIcon name="i-carbon-warning" :size="16" style="color: var(--tx-color-warning)" />
              </span>
            </template>
          </TxCornerOverlay>
        </template>
      </AvatarVariantCard>

      <AvatarVariantCard v-show="isActive('Status')" category="Status" title="Selected" desc="Thick outline + check.">
        <template #preview>
          <TxOutlineBorder variant="ring" :ring-width="3" ring-color="var(--tx-color-primary)" :padding="2" clip-mode="none" shape="squircle">
            <TxCornerOverlay placement="top-right" :offset-x="-6" :offset-y="-6">
              <TxAvatar src="https://i.pravatar.cc/150?u=selected" size="large" shape="square" />
              <template #overlay>
                <span class="tx-avatar-variants__badge tx-avatar-variants__badge--primary">
                  <TxIcon name="i-carbon-checkmark-filled" :size="14" class="tx-avatar-variants__icon--white" />
                </span>
              </template>
            </TxCornerOverlay>
          </TxOutlineBorder>
        </template>
      </AvatarVariantCard>

      <AvatarVariantCard v-show="isActive('Status')" category="Status" title="Deleted / Trash" desc="Scheduled deletion indicator.">
        <template #preview>
          <TxCornerOverlay placement="top-right" :offset-x="-4" :offset-y="-4">
            <TxAvatar src="https://i.pravatar.cc/150?u=trash" size="large" class="tx-avatar-variants__opacity-60" />
            <template #overlay>
              <span class="tx-avatar-variants__badge tx-avatar-variants__badge--danger">
                <TxIcon name="i-carbon-trash-can" :size="14" class="tx-avatar-variants__icon--white" />
              </span>
            </template>
          </TxCornerOverlay>
        </template>
      </AvatarVariantCard>

      <!-- Activity -->
      <AvatarVariantCard v-show="isActive('Activity')" category="Activity" title="Live Pulsing" desc="Double pulse ring for live status.">
        <template #preview>
          <TxCornerOverlay placement="top-right" :offset-x="-2" :offset-y="-2">
            <TxAvatar shape="rounded" size="large" background-color="var(--tx-fill-color-light)">
              <TxIcon name="i-carbon-podcast" :size="24" style="color: #7c3aed" />
            </TxAvatar>
            <template #overlay>
              <span class="tx-avatar-variants__ping">
                <span class="tx-avatar-variants__ping-inner" />
              </span>
            </template>
          </TxCornerOverlay>
        </template>
      </AvatarVariantCard>

      <AvatarVariantCard v-show="isActive('Activity')" category="Activity" title="Loading Spinner" desc="Spinning ring in corner.">
        <template #preview>
          <TxOutlineBorder variant="ring" :ring-width="2" ring-color="var(--tx-color-primary)" :padding="2" clip-mode="none">
            <TxAvatar size="large" background-color="var(--tx-fill-color-light)">
              <TxIcon name="i-carbon-cloud-upload" :size="20" style="color: var(--tx-text-color-secondary)" />
            </TxAvatar>
            <span class="tx-avatar-variants__spinner-ring" aria-hidden="true" />
          </TxOutlineBorder>
        </template>
      </AvatarVariantCard>

      <AvatarVariantCard v-show="isActive('Activity')" category="Activity" title="Typing Dots" desc="Bouncing dots indicator.">
        <template #preview>
          <TxCornerOverlay placement="bottom-right" :offset-x="-6" :offset-y="-6">
            <TxAvatar src="https://i.pravatar.cc/150?u=typing" size="large" />
            <template #overlay>
              <span class="tx-avatar-variants__typing">
                <span class="tx-avatar-variants__typing-dot tx-avatar-variants__typing-dot--1" />
                <span class="tx-avatar-variants__typing-dot tx-avatar-variants__typing-dot--2" />
                <span class="tx-avatar-variants__typing-dot tx-avatar-variants__typing-dot--3" />
              </span>
            </template>
          </TxCornerOverlay>
        </template>
      </AvatarVariantCard>

      <AvatarVariantCard v-show="isActive('Activity')" category="Activity" title="Voice / Speaking" desc="Wave bars in corner.">
        <template #preview>
          <TxCornerOverlay placement="bottom-right" :offset-x="-6" :offset-y="-6">
            <TxAvatar src="https://i.pravatar.cc/150?u=voice" size="large" />
            <template #overlay>
              <span class="tx-avatar-variants__badge tx-avatar-variants__badge--online tx-avatar-variants__badge--bars">
                <span class="tx-avatar-variants__bar tx-avatar-variants__bar--1" />
                <span class="tx-avatar-variants__bar tx-avatar-variants__bar--2" />
                <span class="tx-avatar-variants__bar tx-avatar-variants__bar--3" />
              </span>
            </template>
          </TxCornerOverlay>
        </template>
      </AvatarVariantCard>

      <AvatarVariantCard v-show="isActive('Activity')" category="Activity" title="Hot / Trending" desc="Fire icon + pulse.">
        <template #preview>
          <TxCornerOverlay placement="top-right" :offset-x="-6" :offset-y="-6">
            <TxAvatar name="Topic" size="large" />
            <template #overlay>
              <span class="tx-avatar-variants__pulse">
                <TxIcon name="i-carbon-fire" :size="20" style="color: var(--tx-color-warning)" />
              </span>
            </template>
          </TxCornerOverlay>
        </template>
      </AvatarVariantCard>

      <AvatarVariantCard v-show="isActive('Activity')" category="Activity" title="Syncing" desc="Rotating arrows overlay.">
        <template #preview>
          <TxCornerOverlay placement="bottom-right" :offset-x="-4" :offset-y="-4">
            <TxAvatar size="large" background-color="var(--tx-fill-color-light)">
              <TxIcon name="i-carbon-cloud" :size="24" style="color: var(--tx-text-color-secondary)" />
            </TxAvatar>
            <template #overlay>
              <span class="tx-avatar-variants__badge tx-avatar-variants__badge--light">
                <TxIcon name="i-carbon-renew" :size="16" class="tx-avatar-variants__spin" style="color: var(--tx-color-primary)" />
              </span>
            </template>
          </TxCornerOverlay>
        </template>
      </AvatarVariantCard>

      <AvatarVariantCard v-show="isActive('Activity')" category="Activity" title="Progress / Upload" desc="Circular progress overlay.">
        <template #preview>
          <div class="tx-avatar-variants__progress-wrap">
            <TxIcon name="i-carbon-document" :size="34" style="color: var(--tx-text-color-disabled)" />
            <svg class="tx-avatar-variants__progress" viewBox="0 0 36 36" aria-hidden="true">
              <path class="tx-avatar-variants__progress-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
              <path class="tx-avatar-variants__progress-fg" stroke-dasharray="75, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
            </svg>
            <span class="tx-avatar-variants__progress-text">75</span>
          </div>
        </template>
      </AvatarVariantCard>

      <!-- Platform -->
      <AvatarVariantCard v-show="isActive('Platform')" category="Platform" title="Windows Only" desc="OS exclusivity corner mark.">
        <template #preview>
          <div class="tx-avatar-variants__platform-tile">
            <span class="tx-avatar-variants__platform-label">APP</span>
            <span class="tx-avatar-variants__platform-corner tx-avatar-variants__platform-corner--win">
              <TxIcon name="i-carbon-logo-windows" :size="14" class="tx-avatar-variants__icon--white" />
            </span>
          </div>
        </template>
      </AvatarVariantCard>

      <AvatarVariantCard v-show="isActive('Platform')" category="Platform" title="macOS Only" desc="OS exclusivity corner mark.">
        <template #preview>
          <div class="tx-avatar-variants__platform-tile">
            <span class="tx-avatar-variants__platform-label">DMG</span>
            <span class="tx-avatar-variants__platform-corner tx-avatar-variants__platform-corner--mac">
              <TxIcon name="i-carbon-logo-apple" :size="14" class="tx-avatar-variants__icon--white" />
            </span>
          </div>
        </template>
      </AvatarVariantCard>

      <AvatarVariantCard v-show="isActive('Platform')" category="Platform" title="Linux / Terminal" desc="Terminal icon overlay.">
        <template #preview>
          <div class="tx-avatar-variants__platform-tile">
            <span class="tx-avatar-variants__platform-label">.SH</span>
            <span class="tx-avatar-variants__platform-corner tx-avatar-variants__platform-corner--linux">
              <TxIcon name="i-carbon-terminal" :size="14" class="tx-avatar-variants__icon--white" />
            </span>
          </div>
        </template>
      </AvatarVariantCard>

      <AvatarVariantCard v-show="isActive('Platform')" category="Platform" title="Mobile Only" desc="Small phone overlay.">
        <template #preview>
          <TxCornerOverlay placement="bottom-right" :offset-x="-4" :offset-y="-4">
            <TxAvatar size="large" background-color="var(--tx-fill-color-light)">
              <TxIcon name="i-carbon-chat" :size="24" style="color: var(--tx-color-success)" />
            </TxAvatar>
            <template #overlay>
              <span class="tx-avatar-variants__badge tx-avatar-variants__badge--light">
                <TxIcon name="i-carbon-mobile" :size="14" style="color: var(--tx-text-color-secondary)" />
              </span>
            </template>
          </TxCornerOverlay>
        </template>
      </AvatarVariantCard>

      <!-- System -->
      <AvatarVariantCard v-show="isActive('System')" category="System" title="Beta Label" desc="Corner pill label for beta features.">
        <template #preview>
          <div class="tx-avatar-variants__beta-tile">
            <TxIcon name="i-carbon-chemistry" :size="24" style="color: color-mix(in srgb, var(--tx-color-primary) 60%, #fff)" />
            <span class="tx-avatar-variants__beta">BETA</span>
          </div>
        </template>
      </AvatarVariantCard>

      <AvatarVariantCard v-show="isActive('System')" category="System" title="Locked / Pro" desc="Lock overlay for gated content.">
        <template #preview>
          <TxCornerOverlay placement="top-right" :offset-x="-6" :offset-y="-6">
            <div class="tx-avatar-variants__locked-bg" />
            <template #overlay>
              <span class="tx-avatar-variants__badge tx-avatar-variants__badge--light">
                <TxIcon name="i-carbon-locked" :size="16" style="color: var(--tx-text-color-primary)" />
              </span>
            </template>
          </TxCornerOverlay>
        </template>
      </AvatarVariantCard>

      <AvatarVariantCard v-show="isActive('System')" category="System" title="New Feature" desc="Yellow ping dot for new features.">
        <template #preview>
          <TxCornerOverlay placement="top-right" :offset-x="-2" :offset-y="-2">
            <TxAvatar name="Dash" size="large" shape="square" />
            <template #overlay>
              <span class="tx-avatar-variants__ping tx-avatar-variants__ping--yellow">
                <span class="tx-avatar-variants__ping-inner tx-avatar-variants__ping-inner--yellow" />
              </span>
            </template>
          </TxCornerOverlay>
        </template>
      </AvatarVariantCard>

      <AvatarVariantCard v-show="isActive('System')" category="System" title="Admin Shield" desc="Moderator / security badge.">
        <template #preview>
          <TxCornerOverlay placement="top-right" :offset-x="-4" :offset-y="-4">
            <TxAvatar src="https://i.pravatar.cc/150?u=admin" size="large" />
            <template #overlay>
              <span class="tx-avatar-variants__badge tx-avatar-variants__badge--light">
                <TxIcon name="i-carbon-security" :size="18" style="color: var(--tx-color-primary)" />
              </span>
            </template>
          </TxCornerOverlay>
        </template>
      </AvatarVariantCard>

      <AvatarVariantCard v-show="isActive('System')" category="System" title="AI Generated" desc="AI sparkle badge.">
        <template #preview>
          <TxCornerOverlay placement="top-right" :offset-x="-4" :offset-y="-4">
            <div class="tx-avatar-variants__ai-tile">
              <span class="tx-avatar-variants__ai-label">IMG</span>
            </div>
            <template #overlay>
              <span class="tx-avatar-variants__badge tx-avatar-variants__badge--light">
                <TxIcon name="i-carbon-ai" :size="16" style="color: color-mix(in srgb, var(--tx-color-primary) 70%, #a855f7)" />
              </span>
            </template>
          </TxCornerOverlay>
        </template>
      </AvatarVariantCard>

      <AvatarVariantCard v-show="isActive('System')" category="System" title="Connection Quality" desc="Router + wifi overlay.">
        <template #preview>
          <TxCornerOverlay placement="bottom-right" :offset-x="-4" :offset-y="-4">
            <TxIcon name="i-carbon-router" :size="36" style="color: var(--tx-text-color-secondary)" />
            <template #overlay>
              <span class="tx-avatar-variants__badge tx-avatar-variants__badge--light">
                <TxIcon name="i-carbon-wifi" :size="16" style="color: var(--tx-color-success)" />
              </span>
            </template>
          </TxCornerOverlay>
        </template>
      </AvatarVariantCard>

      <!-- Social -->
      <AvatarVariantCard v-show="isActive('Social')" category="Social" title="Notification Count" desc="Classic red pill counter.">
        <template #preview>
          <TxCornerOverlay placement="top-right" :offset-x="-6" :offset-y="-6">
            <TxIcon name="i-carbon-notification" :size="36" style="color: var(--tx-text-color-secondary)" />
            <template #overlay>
              <span class="tx-avatar-variants__count">3</span>
            </template>
          </TxCornerOverlay>
        </template>
      </AvatarVariantCard>

      <AvatarVariantCard v-show="isActive('Social')" category="Social" title="Verified" desc="Blue checkmark badge.">
        <template #preview>
          <TxOutlineBorder variant="ring" :ring-width="2" ring-color="var(--tx-color-primary)" :padding="2" clip-mode="none">
            <TxCornerOverlay placement="bottom-right" :offset-x="-4" :offset-y="-4">
              <TxAvatar src="https://i.pravatar.cc/150?u=verified" size="large" />
              <template #overlay>
                <span class="tx-avatar-variants__badge tx-avatar-variants__badge--primary">
                  <TxIcon name="i-carbon-checkmark-filled" :size="14" class="tx-avatar-variants__icon--white" />
                </span>
              </template>
            </TxCornerOverlay>
          </TxOutlineBorder>
        </template>
      </AvatarVariantCard>

      <AvatarVariantCard v-show="isActive('Social')" category="Social" title="Team / Group" desc="Stacked avatars pile count.">
        <template #preview>
          <div class="tx-avatar-variants__team">
            <img class="tx-avatar-variants__team-img" src="https://i.pravatar.cc/80?u=1" alt="">
            <img class="tx-avatar-variants__team-img" src="https://i.pravatar.cc/80?u=2" alt="">
            <span class="tx-avatar-variants__team-more">+3</span>
          </div>
        </template>
      </AvatarVariantCard>

      <!-- Context -->
      <AvatarVariantCard v-show="isActive('Context')" category="Context" title="Edit Mode" desc="Pencil icon for editable content.">
        <template #preview>
          <TxCornerOverlay placement="top-right" :offset-x="-4" :offset-y="-4">
            <div class="tx-avatar-variants__tile-aa">
              AA
            </div>
            <template #overlay>
              <span class="tx-avatar-variants__badge tx-avatar-variants__badge--light">
                <TxIcon name="i-carbon-edit" :size="16" style="color: var(--tx-color-primary)" />
              </span>
            </template>
          </TxCornerOverlay>
        </template>
      </AvatarVariantCard>

      <AvatarVariantCard v-show="isActive('Context')" category="Context" title="Birthday" desc="Cake icon for special dates.">
        <template #preview>
          <TxCornerOverlay placement="top-right" :offset-x="-6" :offset-y="-6">
            <TxAvatar src="https://i.pravatar.cc/150?u=birthday" size="large" />
            <template #overlay>
              <span class="tx-avatar-variants__badge tx-avatar-variants__badge--pink tx-avatar-variants__tilt">
                <TxIcon name="i-carbon-cake" :size="16" style="color: #db2777" />
              </span>
            </template>
          </TxCornerOverlay>
        </template>
      </AvatarVariantCard>

      <AvatarVariantCard v-show="isActive('Context')" category="Context" title="Discount / Sale" desc="Percentage badge.">
        <template #preview>
          <TxCornerOverlay placement="top-right" :offset-x="-6" :offset-y="-6">
            <div class="tx-avatar-variants__locked-bg" />
            <template #overlay>
              <span class="tx-avatar-variants__discount">-20%</span>
            </template>
          </TxCornerOverlay>
        </template>
      </AvatarVariantCard>

      <AvatarVariantCard v-show="isActive('Context')" category="Context" title="Premium Member" desc="Crown icon for VIP users.">
        <template #preview>
          <TxCornerOverlay placement="top-left" :offset-x="18" :offset-y="-10">
            <TxOutlineBorder variant="ring" :ring-width="2" ring-color="#facc15" :padding="2">
              <TxAvatar src="https://i.pravatar.cc/150?u=premium" size="large" />
            </TxOutlineBorder>
            <template #overlay>
              <TxIcon name="i-carbon-crown" :size="18" style="color: #facc15" />
            </template>
          </TxCornerOverlay>
        </template>
      </AvatarVariantCard>

      <AvatarVariantCard v-show="isActive('Context')" category="Context" title="Hexagon Mask" desc="Mask clip example (hexagon).">
        <template #preview>
          <TxOutlineBorder
            variant="ring"
            :ring-width="2"
            ring-color="var(--tx-color-primary)"
            clip-mode="mask"
            clip-shape="hexagon"
          >
            <img class="tx-avatar-variants__img48" src="https://i.pravatar.cc/150?u=hex" alt="">
          </TxOutlineBorder>
        </template>
      </AvatarVariantCard>

      <AvatarVariantCard v-show="isActive('Context')" category="Context" title="Squircle Clip" desc="Squircle default shape clip.">
        <template #preview>
          <TxOutlineBorder
            variant="ring-offset"
            :ring-width="2"
            ring-color="var(--tx-color-primary)"
            :offset="2"
            offset-bg="var(--tx-bg-color)"
            shape="squircle"
          >
            <img class="tx-avatar-variants__img48" src="https://i.pravatar.cc/150?u=squircle" alt="">
          </TxOutlineBorder>
        </template>
      </AvatarVariantCard>
    </div>
  </div>
</template>

<style scoped>
.tx-avatar-variants {
  max-width: 1120px;
  margin: 0 auto;
}

.tx-avatar-variants__tabs {
  display: flex;
  justify-content: center;
  margin-bottom: 32px;
}

.tx-avatar-variants__grid {
  display: grid;
  grid-template-columns: repeat(1, minmax(0, 1fr));
  gap: 24px;
}

@media (min-width: 640px) {
  .tx-avatar-variants__grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 1024px) {
  .tx-avatar-variants__grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (min-width: 1280px) {
  .tx-avatar-variants__grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

.tx-avatar-variants__dot {
  width: 14px;
  height: 14px;
  border-radius: 999px;
  border: 2px solid var(--tx-bg-color);
  display: inline-block;
}

.tx-avatar-variants__dot--online {
  background: #22c55e;
}

.tx-avatar-variants__dot--offline {
  background: #9ca3af;
}

.tx-avatar-variants__badge {
  width: 22px;
  height: 22px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 2px solid var(--tx-bg-color);
  box-sizing: border-box;
}

.tx-avatar-variants__badge--light {
  background: var(--tx-bg-color);
}

.tx-avatar-variants__badge--dark {
  background: #374151;
}

.tx-avatar-variants__badge--primary {
  background: var(--tx-color-primary);
}

.tx-avatar-variants__badge--danger {
  background: var(--tx-color-danger);
}

.tx-avatar-variants__badge--online {
  background: #22c55e;
}

.tx-avatar-variants__badge--amber {
  background: #f59e0b;
}

.tx-avatar-variants__badge--pink {
  background: color-mix(in srgb, #db2777 16%, var(--tx-bg-color));
  border-color: color-mix(in srgb, #db2777 22%, var(--tx-bg-color));
}

.tx-avatar-variants__badge--bars {
  gap: 2px;
}

.tx-avatar-variants__icon--white {
  color: #fff;
}

.tx-avatar-variants__dnd {
  width: 22px;
  height: 22px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--tx-color-danger);
  border: 2px solid var(--tx-bg-color);
  box-sizing: border-box;
}

.tx-avatar-variants__dnd-line {
  width: 12px;
  height: 2px;
  border-radius: 999px;
  background: #fff;
}

.tx-avatar-variants__ping {
  position: relative;
  width: 12px;
  height: 12px;
  display: inline-block;
}

.tx-avatar-variants__ping::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 999px;
  background: rgba(239, 68, 68, 0.28);
  animation: tx-ping 1.25s cubic-bezier(0, 0, 0.2, 1) infinite;
}

.tx-avatar-variants__ping-inner {
  position: absolute;
  inset: 0;
  border-radius: 999px;
  background: #ef4444;
}

.tx-avatar-variants__ping--yellow::before {
  background: rgba(234, 179, 8, 0.28);
}

.tx-avatar-variants__ping-inner--yellow {
  background: #eab308;
}

@keyframes tx-ping {
  0% {
    transform: scale(1);
    opacity: 1;
  }
  75%,
  100% {
    transform: scale(2.1);
    opacity: 0;
  }
}

.tx-avatar-variants__spin {
  animation: tx-spin 1s linear infinite;
}

@keyframes tx-spin {
  to {
    transform: rotate(360deg);
  }
}

.tx-avatar-variants__typing {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 4px 6px;
  border-radius: 999px;
  background: var(--tx-bg-color);
  border: 1px solid color-mix(in srgb, var(--tx-border-color) 70%, transparent);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.tx-avatar-variants__typing-dot {
  width: 4px;
  height: 4px;
  border-radius: 999px;
  background: var(--tx-text-color-secondary);
  animation: tx-bounce 1s infinite;
}

.tx-avatar-variants__typing-dot--2 {
  animation-delay: 0.12s;
}

.tx-avatar-variants__typing-dot--3 {
  animation-delay: 0.24s;
}

@keyframes tx-bounce {
  0%,
  100% {
    transform: translateY(0);
    opacity: 0.7;
  }
  50% {
    transform: translateY(-3px);
    opacity: 1;
  }
}

.tx-avatar-variants__bar {
  width: 2px;
  height: 8px;
  border-radius: 999px;
  background: #fff;
  animation: tx-wave 0.85s ease-in-out infinite;
}

.tx-avatar-variants__bar--2 {
  animation-delay: 0.1s;
}

.tx-avatar-variants__bar--3 {
  animation-delay: 0.2s;
}

@keyframes tx-wave {
  0%,
  100% {
    transform: scaleY(0.55);
    opacity: 0.7;
  }
  50% {
    transform: scaleY(1.1);
    opacity: 1;
  }
}

.tx-avatar-variants__pulse {
  animation: tx-pulse 1.2s ease-in-out infinite;
}

@keyframes tx-pulse {
  0%,
  100% {
    transform: scale(1);
    opacity: 0.9;
  }
  50% {
    transform: scale(1.08);
    opacity: 1;
  }
}

.tx-avatar-variants__square-avatar {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  position: relative;
  background: color-mix(in srgb, var(--tx-border-color) 20%, transparent);
  border: 1px solid var(--tx-border-color);
}

.tx-avatar-variants__spinner-ring {
  position: absolute;
  inset: -4px;
  border-radius: 999px;
  border: 2px solid var(--tx-color-primary);
  border-top-color: transparent;
  animation: tx-spin 1s linear infinite;
}

.tx-avatar-variants__platform-tile {
  width: 56px;
  height: 56px;
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  position: relative;
  background: var(--tx-fill-color-light);
  border: 1px solid var(--tx-border-color);
}

.tx-avatar-variants__platform-label {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
  font-size: 12px;
  font-weight: 700;
  color: var(--tx-text-color-secondary);
}

.tx-avatar-variants__platform-corner {
  position: absolute;
  right: -8px;
  bottom: -8px;
  width: 26px;
  height: 26px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 2px solid var(--tx-bg-color);
}

.tx-avatar-variants__platform-corner--win {
  background: #2563eb;
}

.tx-avatar-variants__platform-corner--mac {
  background: #111827;
}

.tx-avatar-variants__platform-corner--linux {
  background: #111827;
}

.tx-avatar-variants__beta-tile {
  position: relative;
  width: 64px;
  height: 48px;
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--tx-color-primary) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--tx-color-primary) 20%, var(--tx-border-color));
}

.tx-avatar-variants__beta {
  position: absolute;
  top: -10px;
  right: -10px;
  padding: 2px 6px;
  font-size: 10px;
  font-weight: 800;
  border-radius: 6px;
  color: #fff;
  background: var(--tx-color-primary);
  border: 1px solid var(--tx-bg-color);
}

.tx-avatar-variants__count {
  min-width: 18px;
  height: 18px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--tx-color-danger);
  color: #fff;
  font-size: 10px;
  font-weight: 800;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 2px solid var(--tx-bg-color);
  box-sizing: border-box;
}

.tx-avatar-variants__team {
  display: inline-flex;
  align-items: center;
  padding: 4px;
}

.tx-avatar-variants__team-img {
  width: 32px;
  height: 32px;
  border-radius: 999px;
  object-fit: cover;
  border: 2px solid var(--tx-bg-color);
  margin-left: -10px;
}

.tx-avatar-variants__team-img:first-child {
  margin-left: 0;
}

.tx-avatar-variants__team-more {
  width: 32px;
  height: 32px;
  border-radius: 999px;
  background: var(--tx-fill-color-light);
  border: 2px solid var(--tx-bg-color);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  color: var(--tx-text-color-secondary);
  margin-left: -10px;
}

.tx-avatar-variants__tile-aa {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: var(--tx-fill-color-light);
  border: 1px solid var(--tx-border-color);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  color: var(--tx-text-color-secondary);
}

.tx-avatar-variants__tilt {
  transform: rotate(12deg);
}

.tx-avatar-variants__discount {
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--tx-color-danger);
  color: #fff;
  font-size: 10px;
  font-weight: 800;
  border: 2px solid var(--tx-bg-color);
  box-sizing: border-box;
}

.tx-avatar-variants__locked-bg {
  width: 56px;
  height: 42px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--tx-border-color) 22%, transparent);
}

.tx-avatar-variants__ai-tile {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: linear-gradient(135deg, #a855f7, var(--tx-color-primary));
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.tx-avatar-variants__ai-label {
  font-size: 12px;
  font-weight: 800;
  color: #fff;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
}

.tx-avatar-variants__progress-wrap {
  position: relative;
  width: 56px;
  height: 56px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.tx-avatar-variants__progress {
  position: absolute;
  width: 40px;
  height: 40px;
  transform: rotate(-90deg);
}

.tx-avatar-variants__progress-bg {
  fill: none;
  stroke: color-mix(in srgb, var(--tx-border-color) 60%, transparent);
  stroke-width: 4;
}

.tx-avatar-variants__progress-fg {
  fill: none;
  stroke: var(--tx-color-primary);
  stroke-width: 4;
}

.tx-avatar-variants__progress-text {
  position: absolute;
  font-size: 10px;
  font-weight: 800;
  color: var(--tx-color-primary);
}

.tx-avatar-variants__img48 {
  width: 48px;
  height: 48px;
  object-fit: cover;
}

.tx-avatar-variants__tile-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: color-mix(in srgb, #7c3aed 12%, var(--tx-bg-color));
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.tx-avatar-variants__grayscale {
  filter: grayscale(100%);
  opacity: 0.7;
}

.tx-avatar-variants__opacity-60 {
  opacity: 0.6;
}
</style>
