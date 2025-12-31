---
sider_text="侧边栏名称"
---

# ContextMenu

此页面为历史占位文件。

请访问：`/components/context-menu`

<script setup lang="ts">
import { onMounted } from 'vue'

onMounted(() => {
  if (typeof window !== 'undefined')
    window.location.replace('/components/context-menu')
})
</script>