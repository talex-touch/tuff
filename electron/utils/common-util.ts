import path from 'path'
import fse from 'fs-extra'
import { ProcessorVars } from '../addon/initializer'

export async function sleep(time: number) {
    return new Promise(resolve => setTimeout(() => resolve(time), time))
}

export async function checkDirWithCreate(url) {

    const p = path.join(ProcessorVars.rootPath, url)

    if( !fse.existsSync(p) ) {

        return fse.mkdirSync(p)

    }

    return true

}

// return now time with hours and minutes and seconds
export function nowTime() {
    const now = new Date()
    return `${now.getHours()}:${now.getMinutes()}:${now.getSeconds()}`
}