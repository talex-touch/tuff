import chalk from 'chalk';

const banner = "\n\n████████╗ █████╗ ██╗     ███████╗██╗  ██╗██╗    ██╗██╗██╗  ██╗██╗\n" +
    "╚══██╔══╝██╔══██╗██║     ██╔════╝╚██╗██╔╝██║    ██║██║██║ ██╔╝██║\n" +
    "   ██║   ███████║██║     █████╗   ╚███╔╝ ██║ █╗ ██║██║█████╔╝ ██║\n" +
    "   ██║   ██╔══██║██║     ██╔══╝   ██╔██╗ ██║███╗██║██║██╔═██╗ ██║\n" +
    "   ██║   ██║  ██║███████╗███████╗██╔╝ ██╗╚███╔███╔╝██║██║  ██╗██║\n" +
    "   ╚═╝   ╚═╝  ╚═╝╚══════╝╚══════╝╚═╝  ╚═╝ ╚══╝╚══╝ ╚═╝╚═╝  ╚═╝╚═╝\n" +
    "                                                                 "

const VERSION = "1.1.0"

console.oLog(chalk.bgGray("=====================================================================\n\n"))

console.oLog(chalk.blueBright(banner))
console.oLog()
console.oLog('          ' +
    chalk.bgGreen.white(` ${VERSION} `) + chalk.bgCyan.white(` Alpha `)
    + '     '
    + chalk.bgGreen.white(` Author `) + chalk.bgCyan.white(` TalexDreamSoul `)
)
console.oLog()
console.oLog('                  ' +
    chalk.bgGreen.white(` Environment `) + chalk.bgMagenta.white(` ${__development ? '开发环境' : '正式环境'} `)
)

console.oLog(chalk.bgGray("\n\n====================================================================="))
console.oLog("\n")

const error = chalk.bold.red;
const warning = chalk.hex('#FFA500'); // Orange color

