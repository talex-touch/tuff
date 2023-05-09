import Application from 'koa'
import fs from 'fs'
import path from 'path'
import chalk from 'chalk'
import { timeCostsChalk } from '../lib/util/common.js'

function log(msg) {
    console.log("MiddleWare", msg)
}

export async function importsAllMiddleWares(app: Application) {

    const startTime = new Date().getTime()

    const rootPath = path.resolve(__dirname, 'middleware')

    log("Load middle-wares from: " + chalk.grey(rootPath))

    const files = fs.readdirSync(rootPath)

    for ( const file of files ) {
        if( file.indexOf("middleware-manager") !== -1 ) continue

        const filePath = path.resolve(rootPath, file, __development ? "index.ts" : "index.js")

        if( !fs.existsSync(filePath) ) continue;

        log("Try to load middleware: " + chalk.grey(file))
        const imp = await import("file://" + filePath)

        try {

            const time = new Date().getTime()

            imp.default(app)

            const diff = new Date().getTime() - time

            log("Middleware load done: " + chalk.green(file) + '   ' + timeCostsChalk(diff))

        } catch (e) {

            console.error("MiddleWare", "Extension load error: " + chalk.green(file))
            console.oError(e)

        }

    }

    const diffTotalTime = new Date().getTime() - startTime

    log("All middlewares loaded!" + '   ' + timeCostsChalk(diffTotalTime))
}
