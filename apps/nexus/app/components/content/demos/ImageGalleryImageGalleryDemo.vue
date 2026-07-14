<script setup lang="ts">
const { locale } = useI18n()

const items = [
  { id: 'one', url: 'https://picsum.photos/seed/talex-gallery-one/640/420', name: 'Workspace overview' },
  { id: 'two', url: 'https://picsum.photos/seed/talex-gallery-two/640/420', name: 'Release graph' },
  { id: 'three', url: 'https://picsum.photos/seed/talex-gallery-three/640/420', name: 'Plugin detail' },
]
</script>

<template>
  <div class="image-gallery-demo">
    <TxImageGallery
      :items="items.map(item => ({
        ...item,
        name: locale === 'zh'
          ? ({ one: '工作区概览', two: '发布图表', three: '插件详情' } as Record<string, string>)[item.id]
          : item.name,
      }))"
      :start-index="1"
    />
  </div>
</template>

<style scoped>
.image-gallery-demo {
  width: min(460px, 100%);
}
</style>
