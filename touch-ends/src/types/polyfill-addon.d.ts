// @ts-ignore

import { IUser, UserModel } from '../api/cms/user/model.js'

declare global {
    interface Console {
        oLog(message?: any, ...optionalParams: any[]): void
        oWarn(message?: any, ...optionalParams: any[]): void;
        oError(message?: any, ...optionalParams: any[]): void;
    }

    interface Date {
        _format(formatString: string): string
    }
}

declare module koa {
    export interface ICurrentSource {
        ip: string;
        locale: string
    }

    export interface Context {
        currentSource: ICurrentSource;
        currentUser: object
    }
}

declare module common {
    export interface ICostChalk {
        [propName: number]: string | Function
    }
}

export { common, koa }
