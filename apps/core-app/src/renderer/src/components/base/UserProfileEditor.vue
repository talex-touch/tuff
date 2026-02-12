<script setup lang="ts" name="UserProfileEditor">
import { TuffInput, TxButton } from '@talex-touch/tuffex'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import { useAuth } from '~/modules/auth/useAuth'

const props = withDefaults(
  defineProps<{
    visible?: boolean
  }>(),
  {
    visible: false
  }
)

const { t } = useI18n()
const {
  isLoggedIn,
  user,
  getDisplayName,
  getPrimaryEmail,
  getUserBio,
  updateUserProfile,
  updateUserAvatar
} = useAuth()

const displayName = computed(() => {
  return getDisplayName()
})
const displayEmail = computed(() => {
  return getPrimaryEmail()
})
const profileBio = computed(() => getUserBio())
const avatarUrl = computed(() => user.value?.avatar || '')
const displayInitial = computed(() => {
  const seed = displayName.value || displayEmail.value
  return seed ? seed.trim().charAt(0).toUpperCase() : '?'
})

const profileForm = ref({
  displayName: '',
  bio: ''
})
const isSaving = ref(false)
const isUpdatingAvatar = ref(false)
const avatarInputRef = ref<HTMLInputElement | null>(null)

const hasChanges = computed(() => {
  const nextName = profileForm.value.displayName.trim()
  const nextBio = profileForm.value.bio.trim()
  return nextName !== displayName.value.trim() || nextBio !== profileBio.value.trim()
})

function resetProfileForm() {
  profileForm.value.displayName = displayName.value
  profileForm.value.bio = profileBio.value
}

function triggerAvatarSelect() {
  avatarInputRef.value?.click()
}

async function handleAvatarChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  isUpdatingAvatar.value = true
  try {
    await updateUserAvatar(file)
    toast.success(t('userProfile.avatarUpdated'))
  } catch {
    toast.error(t('userProfile.avatarUpdateFailed'))
  } finally {
    isUpdatingAvatar.value = false
    input.value = ''
  }
}

async function handleSaveProfile() {
  const payload: { displayName?: string; bio?: string } = {}
  if (profileForm.value.displayName.trim() !== displayName.value.trim()) {
    payload.displayName = profileForm.value.displayName.trim()
  }
  if (profileForm.value.bio.trim() !== profileBio.value.trim()) {
    payload.bio = profileForm.value.bio.trim()
  }
  if (Object.keys(payload).length === 0) {
    toast.info(t('userProfile.noChanges'))
    return
  }
  isSaving.value = true
  try {
    await updateUserProfile(payload)
    toast.success(t('userProfile.updateSuccess'))
    resetProfileForm()
  } catch {
    toast.error(t('userProfile.updateFailed'))
  } finally {
    isSaving.value = false
  }
}

watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      resetProfileForm()
    }
  }
)

watch(isLoggedIn, (loggedIn) => {
  if (!loggedIn) {
    resetProfileForm()
  }
})
</script>

<template>
  <div class="UserProfileEditor">
    <div v-if="!isLoggedIn" class="UserProfileEditor-Empty">
      {{ t('userProfile.authRequired') }}
    </div>
    <template v-else>
      <div class="UserProfileEditor-Header">
        <div class="UserProfileEditor-Avatar">
          <img v-if="avatarUrl" :src="avatarUrl" :alt="displayName" class="avatar-image" />
          <div v-else class="avatar-placeholder">
            {{ displayInitial }}
          </div>
        </div>
        <div class="UserProfileEditor-Identity">
          <div class="UserProfileEditor-Name">
            {{ displayName || t('userProfile.unknownName') }}
          </div>
          <div class="UserProfileEditor-Email">
            {{ displayEmail || t('userProfile.unknownEmail') }}
          </div>
        </div>
        <TxButton
          variant="flat"
          size="sm"
          :loading="isUpdatingAvatar"
          class="UserProfileEditor-AvatarButton"
          @click="triggerAvatarSelect"
        >
          {{ t('userProfile.changeAvatar') }}
        </TxButton>
        <input
          ref="avatarInputRef"
          class="UserProfileEditor-FileInput"
          type="file"
          accept="image/*"
          @change="handleAvatarChange"
        />
      </div>

      <div class="UserProfileEditor-Field">
        <label class="UserProfileEditor-Label">
          {{ t('userProfile.displayName') }}
        </label>
        <TuffInput
          v-model="profileForm.displayName"
          :placeholder="t('userProfile.displayNamePlaceholder')"
        />
      </div>

      <div class="UserProfileEditor-Field">
        <label class="UserProfileEditor-Label">
          {{ t('userProfile.bio') }}
        </label>
        <TuffInput
          v-model="profileForm.bio"
          type="textarea"
          :rows="3"
          :placeholder="t('userProfile.bioPlaceholder')"
        />
      </div>

      <div class="UserProfileEditor-Actions">
        <TxButton variant="ghost" size="sm" :disabled="isSaving" @click="resetProfileForm">
          {{ t('userProfile.reset') }}
        </TxButton>
        <TxButton
          variant="flat"
          type="primary"
          size="sm"
          :loading="isSaving"
          :disabled="!hasChanges"
          @click="handleSaveProfile"
        >
          {{ t('common.save') }}
        </TxButton>
      </div>
    </template>
  </div>
</template>

<style lang="scss" scoped>
.UserProfileEditor {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.UserProfileEditor-Empty {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.UserProfileEditor-Header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.UserProfileEditor-Avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  overflow: hidden;
  background: var(--el-color-primary-light-8);
  display: flex;
  align-items: center;
  justify-content: center;

  .avatar-image {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .avatar-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    font-weight: 600;
    color: var(--el-color-primary);
    background: var(--el-color-primary-light-8);
  }
}

.UserProfileEditor-Identity {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.UserProfileEditor-Name {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.UserProfileEditor-Email {
  font-size: 12px;
  color: var(--el-text-color-regular);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.UserProfileEditor-AvatarButton {
  flex-shrink: 0;
}

.UserProfileEditor-Field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.UserProfileEditor-Label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.UserProfileEditor-Actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.UserProfileEditor-FileInput {
  display: none;
}
</style>
