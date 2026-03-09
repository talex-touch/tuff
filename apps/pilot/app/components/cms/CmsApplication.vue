<script setup lang="ts">
import MimicIcon from '../icon/MimicIcon.vue'
import { getAccountMenuList } from '~/composables/api/account'

const menus = ref<any>({
  origin: [],
  list: [],
  visible: false,
  loading: false,
})

async function fetchData() {
  menus.value.loading = true

  const res = await getAccountMenuList()

  menus.value.loading = false

  if (res.code !== 200)
    return responseMessage(res)

  menus.value.origin = [...(res.data.map((item: any) => item.children || []).flat())]

  function _sort(arr: any[]) {
    return arr.sort((a, b) => b.orderNo - a.orderNo)
  }

  menus.value.list = _sort(res.data).map((item: any) => {
    if (item.children)
      _sort(item.children)

    return item
  })
}
fetchData()

const router = useRouter()
// const personalApps = reactive<any[]>(userConfig.value.pri_info.cms.apps)
const tempPersonalApps = reactive<any[]>([])
const curMenu = ref()

watch(() => menus.value.visible, (visible) => {
  if (!visible)
    return

  fetchData()

  Object.assign(tempPersonalApps, [...userConfig.value.pri_info.cms.apps])
})

async function saveApps() {
  // Object.assign(personalApps, tempPersonalApps)

  userConfig.value.pri_info.cms.apps = [...tempPersonalApps]

  if (await saveUserConfig())
    menus.value.visible = false
}

function selectMenu(item: any) {
  curMenu.value = item
}

function handleAddMenu(item: any) {
  if (!tempPersonalApps.includes(item.id))
    tempPersonalApps.push(item.id)
  else
    Object.assign(tempPersonalApps, tempPersonalApps.filter(id => id !== item.id))
}

const filteredIcons = computed(() => [...menus.value.origin].filter((item: any) => userConfig.value.pri_info.cms.apps.includes(item.id)))

function goRouter(item: any) {
  if (item.path?.startsWith('http'))
    return window.open(item.external, '_blank')

  if (item.path)
    router.push(`/cms${item.path}`)
}
</script>

<template>
  <div class="CmsApplication-Main">
    <div class="CmsApplication-Header cms-header">
      <div class="CmsApplication-Start cms-start">
        <IconMimicIcon color="var(--el-color-primary);color: #fff" icon="i-carbon:application-web" />
        我的应用
      </div>

      <div class="CmsApplication-End cms-end">
        <el-link type="primary" @click="menus.visible = true">
          编辑
        </el-link>
      </div>
    </div>
    <div class="CmsApplication-Main">
      <el-empty v-if="!filteredIcons?.length" description="内容空空如也" />
      <el-scrollbar v-else>
        <div my-2 class="CmsApplication-MainInner">
          <div v-for="item in filteredIcons" :key="item.id" class="AppMenu-Item display" @click="goRouter(item)">
            <div class="AppMenu-Item-Wrapper">
              <MimicIcon color="var(--el-text-color-primary)" :class="item.meta?.icon" />
            </div>
            <span>{{ item.name }}</span>
          </div>
        </div>
      </el-scrollbar>
    </div>

    <el-dialog
      v-model="menus.visible" width="40%" :close-on-press-escape="false" :close-on-click-modal="false"
      title="应用菜单"
    >
      <el-container v-loader="menus.loading || userConfig.loading">
        <el-aside width="200px">
          <div v-for="item in menus.list" :key="item.id" class="CmsApplication-MenuItem">
            <CmsMenuItem :active="item === curMenu" @click="selectMenu(item)">
              <div flex items-center gap-2>
                <div :class="item.meta.icon" />{{ item.name }}
              </div>
            </CmsMenuItem>
          </div>
        </el-aside>
        <el-main class="AppMenu-Main">
          <el-empty v-if="!curMenu" description="选择一项分类以继续" />
          <el-empty v-else-if="!curMenu.children?.length" description="内容空空如也" />
          <div
            v-for="item in curMenu.children" v-else :key="item.id"
            :class="{ addable: !tempPersonalApps.includes(item.id) }" class="AppMenu-Item" @click="handleAddMenu(item)"
          >
            <MimicIcon color="var(--theme-color)" :class="item.meta?.icon" />
            <span>{{ item.name }}</span>

            <div v-wave class="menu-icon-addable">
              <div v-if="!tempPersonalApps.includes(item.id)" i-carbon:add />
              <div v-else i-carbon:close />
            </div>

            <div class="menu-icon-checkable">
              <div i-carbon:checkmark />
            </div>
          </div>
        </el-main>
      </el-container>

      <template #footer>
        <el-button v-wave :disabled="userConfig.loading" plain @click="menus.visible = false">
          取消
        </el-button>
        <el-button
          v-wave :disabled="userConfig.loading" :loading="userConfig.loading" plain type="primary"
          @click="saveApps"
        >
          保存
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style lang="scss">
.AppMenu-Item-Wrapper {
  &::before {
    content: '';
    position: absolute;

    top: 0;
    left: 0;

    width: 100%;
    height: 100%;

    opacity: 0;
    transition: 0.25s;
    border-radius: 50%;
    transform: scale(1.1);
    border: 1px solid var(--theme-color);
  }

  .AppMenu-Item:hover & {
    &::before {
      opacity: 1;
      transform: scale(1);
    }

    transform: scale(0.95);
    background-color: #0000;
  }
  position: relative;
  display: flex;

  width: 48px;
  height: 48px;
  min-height: 48px;

  align-items: center;
  justify-content: center;

  transition: 0.25s;
  border-radius: 50%;
  transform: scale(1);
  background-color: var(--el-bg-color);
}

.CmsApplication-MainInner {
  display: grid;

  // width: max-content;

  gap: 0.5rem;
  grid-template-columns: repeat(auto-fill, minmax(calc(64px + 0rem), 1fr));
}

.CmsApplication-Main {
  width: 100%;
  height: 100%;
}

.AppMenu-Main {
  .el-empty {
    margin: 0 auto;
  }
  position: relative;
  display: flex;

  width: 100%;
  height: max-content;

  flex-wrap: wrap;
  // justify-content: center;

  gap: 0.5rem;
  user-select: none;
  // grid-template-columns: repeat(auto-fill, minmax(72px, 1fr));
}

.AppMenu-Item {
  &.display {
    &:hover {
      .MimicButton {
        --c: var(--theme-color) !important;
      }
      color: var(--theme-color);
    }

    background-color: #0000 !important;
  }

  &:hover {
    .menu-icon-addable {
      opacity: 1;
    }

    background-color: var(--el-bg-color);
  }

  &.addable {
    .menu-icon-addable {
      color: currentColor;
    }

    .MimicButton {
      opacity: 1;
    }

    .menu-icon-checkable {
      transform: translate(-50%, -50%) scale(0);
    }

    border-radius: 0 12px 12px 12px;
    background-color: var(--el-bg-color);
  }

  .MimicButton {
    width: 32px;
    height: 32px;
    min-height: 32px;

    opacity: 0.5;
  }

  .menu-icon-addable,
  .menu-icon-checkable {
    position: absolute;
    display: flex;

    top: 0;
    right: 0;

    width: 100%;
    height: 100%;

    align-items: center;
    justify-content: center;
    color: var(--el-color-danger);

    font-size: 30px;
    font-weight: 600;

    opacity: 0;
    transition: 0.25s;
    border-radius: 12px;
    background-color: var(--el-bg-color-page);
  }
  span {
    text-wrap: nowrap;

    transform: scale(0.85);
  }
  .menu-icon-checkable {
    width: 24px;
    height: 24px;

    left: 6px;
    right: unset;
    opacity: 1;

    font-size: 12px;
    box-shadow: 0 0 4px 4px var(--el-bg-color);
    transform: translate(-50%, -50%) scale(0.75);
    color: var(--el-color-success);
  }
  position: relative;
  padding: 0.5rem;
  display: flex;

  align-items: center;
  flex-direction: column;
  justify-content: center;

  width: 72px;
  height: 72px;

  font-size: 12px;
  cursor: pointer;

  border-radius: 12px;
  background-color: var(--el-bg-color-page);
}
</style>
