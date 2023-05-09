import chalk from 'chalk'
import setting from './config/setting.js'

import createApp  from './app.js'
import { LARGER_INTERVAL_COST_CHALK, timeCostsChalk } from './lib/util/common.js'

export const startTime = new Date().getTime()

const app = await createApp(setting);

await app.listen(setting.port);

const processTime = new Date().getTime() - startTime
console.log(chalk.bgGreen(' ListenAt ') + chalk.bgBlue.underline(` http://${setting.domain}:${setting.port} `) + chalk.grey("  |  ") + timeCostsChalk(processTime, LARGER_INTERVAL_COST_CHALK));

