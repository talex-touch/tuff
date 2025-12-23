export function createIndexTemplate(compName: string) {
  const originName = compName
  compName = compName[0].toUpperCase() + compName.slice(1)
  const COMPONENT_NAME = process.env.COMPONENT_NAME ?? ''
  const name = `${COMPONENT_NAME}${compName}`
  return `import component from './src/${originName}.vue'
import { withInstall } from '../../../utils/withInstall'
  
const ${name} = withInstall(component)
  
export {
  ${name}
}
  
export default ${name}`
}

export function createVueTemplate(compName: string) {
  compName = compName[0].toUpperCase() + compName.slice(1)
  const COMPONENT_NAME = process.env.COMPONENT_NAME ?? ''
  const name = `${COMPONENT_NAME}${compName}`
  return `<script setup lang="ts">
defineOptions({
  name: '${name}'
})
</script>
  
<template>
  <div>
     ${name}
  </div>
</template>
  `
}