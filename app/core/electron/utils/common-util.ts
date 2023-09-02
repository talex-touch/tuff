import path from 'path'
import fse from 'fs-extra'

export enum Platform {
    MAC_OS,
    WINDOWS,
    LINUX
}
// export enum PlatformVersion {
//     WINDOWS_7,
//     WINDOWS_8,
//     WINDOWS_10,
//     WINDOWS_11,
//     MAC_OS_10_15,
//     MAC_OS_11,
//     LINUX_UBUNTU,
//     LINUX_DEBIAN,
//     LINUX_FEDORA,
//     LINUX_MINT,
//     LINUX_OPENSUSE,
//     LINUX_ZORIN,
//     LINUX_ARCH,
//     LINUX_MANJARO,
//     LINUX_GENTOO,
//     LINUX_ELEMENTARY,
//     LINUX_KALI,
//     LINUX_PARROT,
//     LINUX_KDE,
//     LINUX_CENTOS,
//     LINUX_RHEL,
//     LINUX_SLACKWARE,
//     LINUX_SOLUS,
//     LINUX_ALPINE,
//     LINUX_OL,
//     LINUX_RASPBERRY_PI,
//     LINUX_RASPBERRY_PI_OS,
//     LINUX_RASPBERRY_PI_OS_64,
//     LINUX_RASPBERRY_PI_OS_LITE,
// LINUX_RASPBERRY_PI_OS_LITE_64,
//     LINUX_RASPBERRY_PI_OS_FULL,
//     LINUX_RASPBERRY_PI_OS_FULL_64,
//     LINUX_RASPBERRY_PI_OS_EDUCATIONAL,
//     LINUX_RASPBERRY_PI_OS_EDUCATIONAL_64,
//     LINUX_RASPBERRY_PI_OS_DESKTOP,
//     LINUX_RASPBERRY_PI_OS_DESKTOP_64,
//     LINUX_RASPBERRY_PI_OS_DESKTOP_FULL,
//     LINUX_RASPBERRY_PI_OS_DESKTOP_FULL_64,
//     LINUX_RASPBERRY_PI_OS_DESKTOP_EDUCATIONAL,
//     LINUX_RASPBERRY_PI_OS_DESKTOP_EDUCATIONAL_64,
//     LINUX_RASPBERRY_PI_OS_LITE_DESKTOP,
//     LINUX_RASPBERRY_PI_OS_LITE_DESKTOP_64,
//     LINUX_RASPBERRY_PI_OS_LITE_DESKTOP_FULL,
//
// }
export function getPlatform() {
    switch (process.platform) {
        case 'darwin':
            return Platform.MAC_OS
        case 'win32':
            return Platform.WINDOWS
        case 'linux':
            return Platform.LINUX
    }
}
export async function sleep(time: number) {
    return new Promise(resolve => setTimeout(() => resolve(time), time))
}

export async function checkDirWithCreate(url, abs = true) {

    const p = abs ? url : path.join(process.cwd(), url)

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