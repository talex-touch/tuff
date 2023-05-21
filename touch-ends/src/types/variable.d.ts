import { Sequelize } from 'sequelize-typescript'
// import { Enforcer } from 'casbin/lib/cjs/enforcer.js'

declare global {
    export var sequelize: Sequelize
    // export var eller: Enforcer
    export function sleep(time: number): Promise<any>
    export var __development: boolean
}

export {}
