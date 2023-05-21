import { IError } from '../types/error.js'
import getMessageByCode from '../config/code-message.js'
import { Error } from 'sequelize'

export class BaseError extends Error implements IError {
    code: number
    message: string
    data?: any

    constructor(code: number, data?: any) {
        super(data)

        this.code = code;
        this.data = data
        this.message = getMessageByCode(this.code);

    }

}

export class InfoError extends BaseError {
    constructor(data?: any) {
        super(401, data)
    }
}

export class ResourceRepeatError extends BaseError {
    constructor(data?: any) {
        super(405, data)
    }
}

export class ResourceNotFoundError extends BaseError {
    constructor(data?: any) {
        super(404, data)
    }
}

export class ResourceProtectedError extends BaseError {
    constructor(data?: any) {
        super(407, data)
    }
}

export class ParametersException extends BaseError {
    constructor(data?: any) {
        super(400, data)
    }
}
