import { createPage } from './createPage.ts'
import chalk from 'chalk'

function create() {

  const commands = process.argv.splice(2)
  if (commands.length === 0) {
    console.log(chalk.red('缺少必要参数'))
    return
  }
  createPage(commands)
}

create()