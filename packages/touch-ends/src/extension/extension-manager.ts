import Application from 'koa'
import fs from 'fs'
import path from 'path'
import chalk from 'chalk'
import { TimeCosts, timeCostsChalk } from '../lib/util/common.js'

function log(msg) {
    console.log("Extension", msg)
}

export async function importsAllExtensions(app: Application) {

    const timer = new TimeCosts()

    timer.start()

    const rootPath = path.resolve(__dirname, 'extension')

    log("Load extension from: " + chalk.grey(rootPath))

    const files = fs.readdirSync(rootPath)

    for ( const file of files ) {
        if( file.indexOf("extension-manager") !== -1 ) continue

        log("Loading extension: " + chalk.grey(file))
        const imp = await import("file://" + path.resolve(rootPath, file, __development ? "index.ts" : "index.js"))

        try {

            timer.start(file)

            imp.default(app)

            log("Extension load done: " + chalk.green(file) + '   ' + timer.stopWithClearAndOutput(file))

        } catch (e) {

            console.error("Extension", "Extension load error: " + chalk.bgRed.white(` ${file} `))
            console.oError(e)

        }

    }

    log("All extensions loaded!"+ '   ' + timer.stopWithClearAndOutput())
}
