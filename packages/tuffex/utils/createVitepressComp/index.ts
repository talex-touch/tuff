import { createVitepressComp } from './create.ts'

function create() {
  const commands = process.argv.splice(2)
  if (commands.length === 0) {
    console.log('缺少必要参数')
    return
  }
  for (const compName of commands) {
    createVitepressComp(compName)
  }
}

create()