<script setup lang="ts">
export type PermissionRequestActionTone = 'danger' | 'neutral' | 'primary'

export interface PermissionRequestToastItem {
  id: string
  name: string
  reason?: string
}

export interface PermissionRequestToastAction {
  label: string
  tone: PermissionRequestActionTone
  onSelect: () => void
}

defineProps<{
  title: string
  message: string
  permissions: PermissionRequestToastItem[]
  timeoutText?: string
  actions: PermissionRequestToastAction[]
}>()
</script>

<template>
  <section class="PermissionRequestToast" role="dialog" :aria-label="title">
    <h2 class="PermissionRequestToast-Title">
      {{ title }}
    </h2>

    <p class="PermissionRequestToast-Message">
      {{ message }}
    </p>

    <ul class="PermissionRequestToast-List">
      <li
        v-for="permission in permissions"
        :key="permission.id"
        class="PermissionRequestToast-Item"
      >
        <span class="PermissionRequestToast-Bullet" aria-hidden="true">•</span>
        <span class="PermissionRequestToast-ItemText">
          <span class="PermissionRequestToast-PermissionName">{{ permission.name }}</span>
          <template v-if="permission.reason">：{{ permission.reason }}</template>
        </span>
      </li>
    </ul>

    <p v-if="timeoutText" class="PermissionRequestToast-Timeout">
      {{ timeoutText }}
    </p>

    <div class="PermissionRequestToast-Actions">
      <button
        v-for="action in actions"
        :key="action.label"
        type="button"
        class="PermissionRequestToast-Action"
        :class="`PermissionRequestToast-Action--${action.tone}`"
        @click="action.onSelect"
      >
        {{ action.label }}
      </button>
    </div>
  </section>
</template>

<style scoped lang="scss">
.PermissionRequestToast {
  display: grid;
  width: min(480px, calc(100vw - 32px));
  max-width: 480px;
  gap: 12px;
  padding: 18px 20px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  background: rgba(16, 16, 18, 0.96);
  color: rgba(245, 247, 252, 0.94);
  box-shadow:
    0 24px 72px rgba(0, 0, 0, 0.48),
    inset 0 1px 0 rgba(255, 255, 255, 0.04);
  backdrop-filter: blur(18px);
}

.PermissionRequestToast-Title {
  margin: 0;
  font-size: 18px;
  font-weight: 760;
  line-height: 1.2;
  letter-spacing: 0;
  color: #f5f7fc;
}

.PermissionRequestToast-Message,
.PermissionRequestToast-Timeout {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  line-height: 1.4;
  letter-spacing: 0;
  color: rgba(232, 236, 246, 0.86);
}

.PermissionRequestToast-List {
  display: grid;
  gap: 6px;
  margin: 2px 0 0;
  padding: 0;
  list-style: none;
}

.PermissionRequestToast-Item {
  display: grid;
  grid-template-columns: 14px minmax(0, 1fr);
  align-items: start;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.4;
  letter-spacing: 0;
  color: rgba(232, 236, 246, 0.9);
}

.PermissionRequestToast-Bullet {
  color: rgba(232, 236, 246, 0.86);
}

.PermissionRequestToast-ItemText {
  min-width: 0;
  overflow-wrap: anywhere;
}

.PermissionRequestToast-PermissionName {
  color: rgba(245, 247, 252, 0.94);
}

.PermissionRequestToast-Timeout {
  margin-top: 2px;
}

.PermissionRequestToast-Actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 2px;
}

.PermissionRequestToast-Action {
  min-width: 88px;
  min-height: 36px;
  padding: 0 16px;
  border: 1px solid rgba(255, 255, 255, 0.24);
  border-radius: 999px;
  background: transparent;
  color: rgba(232, 236, 246, 0.82);
  font-size: 14px;
  font-weight: 650;
  line-height: 1;
  letter-spacing: 0;
  white-space: nowrap;
  cursor: pointer;
  transition:
    border-color 160ms ease,
    background 160ms ease,
    color 160ms ease,
    transform 160ms ease;

  &:hover {
    transform: translateY(-1px);
  }

  &:focus-visible {
    outline: 2px solid currentColor;
    outline-offset: 3px;
  }
}

.PermissionRequestToast-Action--danger {
  border-color: #ff5f67;
  color: #ff6970;

  &:hover {
    background: rgba(255, 95, 103, 0.12);
  }
}

.PermissionRequestToast-Action--neutral {
  border-color: rgba(255, 255, 255, 0.24);
  color: rgba(232, 236, 246, 0.72);

  &:hover {
    background: rgba(255, 255, 255, 0.08);
    color: rgba(245, 247, 252, 0.9);
  }
}

.PermissionRequestToast-Action--primary {
  border-color: #3490ff;
  color: #3996ff;

  &:hover {
    background: rgba(52, 144, 255, 0.13);
  }
}

@media (max-width: 520px) {
  .PermissionRequestToast {
    gap: 12px;
    padding: 16px;
  }

  .PermissionRequestToast-Title {
    font-size: 17px;
  }

  .PermissionRequestToast-Message,
  .PermissionRequestToast-Timeout,
  .PermissionRequestToast-Item {
    font-size: 14px;
  }

  .PermissionRequestToast-Actions {
    justify-content: stretch;
    gap: 10px;
  }

  .PermissionRequestToast-Action {
    flex: 1 1 100%;
    min-height: 36px;
    padding: 0 14px;
    font-size: 14px;
  }
}
</style>
