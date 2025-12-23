import { createComponent } from './create.ts'

const componentsPath = './packages/components/src'

function create() {
  const commands = process.argv.splice(2)
  if (commands.length === 0) {
    console.log('缺少必要参数')
    return
  }
  for (const item of commands) {
    createComponent(componentsPath, item)
  }
}

create()