<script setup lang="ts" name="AccountDo">
import type { Ref } from 'vue'
import { useAppSdk } from '@talex-touch/utils/renderer'
import { TxButton } from '@talex-touch/tuffex'
import { computed, inject, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import { useAuth } from '~/modules/auth/useAuth'
import { getAuthBaseUrl } from '~/modules/auth/auth-env'
import SetupPermissions from './SetupPermissions.vue'

type StepFunction = (call: { comp: unknown; rect?: { width: number; height: number } }) => void

const choice: Ref<number> = ref(0)
const step: StepFunction = inject('step')!
const appSdk = useAppSdk()
const { t } = useI18n()

const { signIn, isAuthenticated, authLoadingState, initializeAuth } = useAuth()
const learnMoreUrl = computed(() => `${getAuthBaseUrl().replace(/\/$/, '')}/sign-in`)
const isActionLoading = computed(
  () => choice.value === 0 && (authLoadingState.isSigningIn || authLoadingState.isLoggingIn)
)

onMounted(() => {
  void initializeAuth()
})

watch(isAuthenticated, (authenticated) => {
  if (authenticated) {
    toast.success(t('beginner.account.toastSignInSuccess'))
    step({
      comp: SetupPermissions
    })
  }
})

async function handleBrowserSignIn(): Promise<void> {
  try {
    await signIn()
  } catch (error) {
    console.error('Browser sign in failed:', error)
    toast.error(t('beginner.account.toastSignInFailed'))
  }
}

function openLearnMore(): void {
  void appSdk.openExternal(learnMoreUrl.value)
}

function handleAgree(): void {
  if (choice.value === 0) {
    handleBrowserSignIn()
  } else {
    step({
      comp: SetupPermissions
    })
  }
}
</script>

<template>
  <div class="AccountDo">
    <div class="AccountDo-Display">
      <div class="diaplyer transition-cubic" :class="{ fill: choice }" />
    </div>

    <div class="AccountDo-Choice">
      <div
        :class="{ active: !choice }"
        class="transition-cubic AccountDo-Section"
        role="button"
        tabindex="0"
        @click="choice = 0"
        @keydown.enter="choice = 0"
        @keydown.space="choice = 0"
      >
        <h1>
          {{ t('beginner.account.signIn.title') }}
          <span class="tag">{{ t('beginner.account.recommended') }}</span>
        </h1>
        <span>
          {{ t('beginner.account.signIn.description') }}
          <a :href="learnMoreUrl" target="_blank" rel="noreferrer" @click.prevent="openLearnMore">{{
            t('beginner.account.signIn.learnMore')
          }}</a>
        </span>
      </div>

      <div
        :class="{ active: choice }"
        class="transition-cubic AccountDo-Section"
        role="button"
        tabindex="0"
        @click="choice = 1"
        @keydown.enter="choice = 1"
        @keydown.space="choice = 1"
      >
        <h1>{{ t('beginner.account.offline.title') }}</h1>
        <span>
          {{ t('beginner.account.offline.description') }}
        </span>
      </div>
    </div>

    <div class="AccountDo-Next">
      <TxButton variant="flat" type="primary" :loading="isActionLoading" @click="handleAgree">
        {{
          choice === 0 ? t('beginner.account.signIn.action') : t('beginner.account.offline.action')
        }}
      </TxButton>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@keyframes frame {
  25% {
    transform: translateY(-50%) scale(0.5) translateX(-20%);
  }

  75% {
    transform: translateY(-50%) scale(0.5) translateX(20%);
  }

  0%,
  50%,
  100% {
    transform: translateY(-50%) scale(0.5) translateX(0);
  }
}

@keyframes frame_down {
  0% {
    transform: translateY(-50%) scale(0.5) translateY(0%);
  }
  25% {
    transform: translateY(-50%) scale(0.5) translateY(-15%);
  }
  50% {
    transform: translateY(-50%) scale(0.5) translateY(15%);
  }
  75% {
    transform: translateY(-50%) scale(0.5) translateY(-10%);
  }
  100% {
    transform: translateY(-50%) scale(0.5) translateY(10%);
  }
}

.diaplyer {
  position: relative;
  width: 8rem;
  height: 8rem;

  &.fill {
    --tx-color-primary: var(--tx-border-color);

    &::after {
      animation: frame_down 0.75s infinite;
    }
  }

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    height: 30%;
    transition: 0.25s;
    border-radius: 12px;
    transform: translateY(150%);
    border: 2px solid var(--tx-color-primary);
    background-color: var(--tx-color-primary);
  }

  &::after {
    content: '';
    position: absolute;
    inset: 0;
    transition: 0.25s;
    border-radius: 50%;
    transform: translateY(-50%) scale(0.5);
    background-color: var(--tx-color-primary);
    animation: frame 2s infinite;
  }
}

.AccountDo {
  position: relative;
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 1rem;

  &-Display {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    min-height: 0;
  }

  &-Choice {
    margin: 10px 0;
    display: flex;
    gap: 1rem;
    flex: 0 0 auto;
  }

  &-Next {
    display: flex;
    justify-content: center;
    align-items: center;
    flex: 0 0 auto;
    padding: 1rem 0;
  }

  &-Section {
    flex: 1;
    padding: 1.5rem;
    cursor: pointer;
    border-radius: 12px;
    box-sizing: border-box;
    border: 2px solid transparent;
    transition: all 0.3s ease;

    .tag {
      margin-left: 8px;
      font-size: 0.7rem;
      background-color: #b7aa46a0;
      padding: 2px 6px;
      border-radius: 4px;
      vertical-align: middle;
    }

    h1 {
      margin: 0 0 1rem 0;
      font-size: 1.4rem;
      font-weight: 600;
      color: var(--tx-text-color-primary);
    }

    span {
      font-size: 0.95rem;
      line-height: 1.6;
      color: var(--tx-text-color-regular);
    }

    a {
      color: var(--tx-color-primary);
      text-decoration: none;

      &:hover {
        text-decoration: underline;
      }
    }

    &:hover {
      border-color: var(--tx-border-color);
      background-color: var(--tx-fill-color-light);
    }

    &.active {
      border-color: var(--tx-color-primary);
      background-color: var(--tx-color-primary-light-9);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }
  }
}
</style>
