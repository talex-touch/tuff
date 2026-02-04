<script lang="ts" name="LayoutPreviewContent" setup>
const props = defineProps<{
  section: 'nav' | 'title' | 'navbar' | 'plugins' | 'icon' | 'view'
}>()

const navItems = [1, 2]
const sidebarItems = [
  { label: 'Styles', active: true },
  { label: 'Overview', active: false },
  { label: 'Plugins', active: false },
  { label: 'Downloads', active: false }
]
const pluginItems = [1, 2, 3]
const iconItems = [1, 2]
const statCards = [1, 2, 3]
const listItems = [1, 2, 3, 4]
</script>

<template>
  <div v-if="props.section === 'title'" class="LayoutPreview-Title">
    <span class="LayoutPreview-TitleText">Tuff</span>
  </div>
  <div v-else-if="props.section === 'nav'" class="LayoutPreview-Nav">
    <span v-for="item in navItems" :key="item" class="LayoutPreview-NavDot" />
  </div>
  <ul v-else-if="props.section === 'navbar'" class="LayoutPreview-Sidebar">
    <li
      v-for="item in sidebarItems"
      :key="item.label"
      class="LayoutPreview-SidebarItem"
      :class="{ active: item.active }"
    >
      <span class="LayoutPreview-SidebarDot" />
      <span class="LayoutPreview-SidebarText">{{ item.label }}</span>
    </li>
  </ul>
  <ul v-else-if="props.section === 'plugins'" class="LayoutPreview-Plugins">
    <li v-for="item in pluginItems" :key="item" class="LayoutPreview-PluginIcon" />
  </ul>
  <div v-else-if="props.section === 'icon'" class="LayoutPreview-IconFooter">
    <span v-for="item in iconItems" :key="item" class="LayoutPreview-Icon" />
  </div>
  <div v-else class="LayoutPreview-View">
    <div class="LayoutPreview-ViewHeader">
      <div>
        <div class="LayoutPreview-ViewTitle" />
        <div class="LayoutPreview-ViewSubtitle" />
      </div>
      <div class="LayoutPreview-ViewAction" />
    </div>
    <div class="LayoutPreview-Stats">
      <div v-for="item in statCards" :key="item" class="LayoutPreview-StatCard" />
    </div>
    <div class="LayoutPreview-List">
      <div v-for="item in listItems" :key="item" class="LayoutPreview-ListItem">
        <div class="LayoutPreview-ListLine short" />
        <div class="LayoutPreview-ListLine" />
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.LayoutPreview-Title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.LayoutPreview-Nav {
  display: flex;
  align-items: center;
  gap: 4px;
}

.LayoutPreview-NavDot {
  width: 12px;
  height: 12px;
  border-radius: 6px;
  background: var(--el-fill-color);
}

.LayoutPreview-Sidebar {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.LayoutPreview-SidebarItem {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 8px;
  background: var(--el-fill-color-lighter);
}

.LayoutPreview-SidebarDot {
  width: 10px;
  height: 10px;
  border-radius: 4px;
  background: var(--el-fill-color);
}

.LayoutPreview-SidebarText {
  font-size: 9px;
  color: var(--el-text-color-secondary);
}

.LayoutPreview-SidebarItem.active {
  background: color-mix(in srgb, var(--el-color-primary-light-9) 65%, transparent);
}

.LayoutPreview-SidebarItem.active .LayoutPreview-SidebarDot {
  background: var(--el-color-primary);
}

.LayoutPreview-Plugins {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.LayoutPreview-PluginIcon {
  width: 18px;
  height: 18px;
  border-radius: 6px;
  background: var(--el-fill-color);
}

.LayoutPreview-IconFooter {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
}

.LayoutPreview-Icon {
  width: 16px;
  height: 16px;
  border-radius: 6px;
  background: var(--el-fill-color);
}

.LayoutPreview-View {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
}

.LayoutPreview-ViewHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.LayoutPreview-ViewTitle {
  width: 120px;
  height: 12px;
  border-radius: 6px;
  background: var(--el-fill-color);
}

.LayoutPreview-ViewSubtitle {
  width: 80px;
  height: 8px;
  margin-top: 6px;
  border-radius: 6px;
  background: var(--el-fill-color-light);
}

.LayoutPreview-ViewAction {
  width: 48px;
  height: 16px;
  border-radius: 8px;
  background: var(--el-color-primary-light-7);
}

.LayoutPreview-Stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}

.LayoutPreview-StatCard {
  height: 32px;
  border-radius: 8px;
  background: var(--el-fill-color-lighter);
}

.LayoutPreview-List {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.LayoutPreview-ListItem {
  padding: 8px;
  border-radius: 8px;
  background: var(--el-bg-color);
  box-shadow: inset 0 0 0 1px var(--el-border-color-lighter);
}

.LayoutPreview-ListLine {
  height: 8px;
  border-radius: 4px;
  background: var(--el-fill-color);
}

.LayoutPreview-ListLine.short {
  width: 60%;
  margin-bottom: 6px;
}
</style>
