import { BaseError } from './base-error.js'

export class AuthFailedError extends BaseError {
    constructor(data?: any) {
        super(403, data)
    }
}

export class AuthExpiredError extends BaseError {
    constructor(data?: any) {
        super(406, data)
    }
}

