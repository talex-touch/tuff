<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  TxButton as TuffButton,
  TxDropdownItem as TuffDropdownItem,
  TxDropdownMenu as TuffDropdownMenu,
} from '@talex-touch/tuffex'

const { locale } = useI18n()

const open = ref(false)

const labels = computed(() => (locale.value === 'zh'
  ? {
      menu: '菜单',
      profile: '个人资料',
      settings: '设置',
      logout: '退出登录',
    }
  : {
      menu: 'Menu',
      profile: 'Profile',
      settings: 'Settings',
      logout: 'Sign out',
    }))

function closeMenu() {
  open.value = false
}
</script>

<template>
  <TuffDropdownMenu v-model="open">
    <template #trigger>
      <TuffButton>{{ labels.menu }}</TuffButton>
    </template>

    <TuffDropdownItem @click="closeMenu">
      {{ labels.profile }}
    </TuffDropdownItem>
    <TuffDropdownItem @click="closeMenu">
      {{ labels.settings }}
    </TuffDropdownItem>
    <TuffDropdownItem danger @click="closeMenu">
      {{ labels.logout }}
    </TuffDropdownItem>
  </TuffDropdownMenu>
</template>
