// @ts-ignore
import fse from 'fs/promises'
// @ts-ignore
import path from "path";
// @ts-ignore
import { cwd } from "process";

const mainPath = cwd()
export const pluginPath = path.join(mainPath, 'talex-touch', 'plugins')
class FileAdpoter {
    mainPath
    constructor(mainPath) {
        this.mainPath = mainPath
    }

    async list(subPaths: Array<string> = []) {
        const p = path.join(this.mainPath, ...subPaths)

        let res = []

        try {

            res = await fse.readdir(p, {
                withFileTypes: true
            })

            // console.log( res, p )

        } catch (e) {

            res = null

        }

        return res
    }
}

export function genFileAdpoter(route = mainPath, ...paths) {
    const p = path.join(route, ...paths)
    return new FileAdpoter(p)
}