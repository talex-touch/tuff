import process from 'process'
import path from 'path'
import { checkDirWithCreate } from '../../utils/common-util'

import BackgroundBlur from './background-blur'
import { saveAllConfig } from '../storage'

// import DeviceBlueTooth from '../addon/device/blue-tooth'
// import ClipBoardWatcher from './device/clipboard'
// import AddonOpener from "./device/addon-opener";
import _path from "path";
import { genTouchApp } from '../touch-core'

export const ProcessorVars = {
    startTime: new Date().getTime(),
    options: {
        first: false
    },
    rootPath: process.cwd(),
    touchPath: path.join(process.cwd(), 'talex-touch'),
    configPath: path.join(process.cwd(), 'talex-touch', 'config'),
    pluginPath: path.join(process.cwd(), 'talex-touch', 'plugins'),
    buildPath: path.join(process.cwd(), 'talex-touch', 'build')
}

checkDirWithCreate(ProcessorVars.buildPath, true).then(() => { })


