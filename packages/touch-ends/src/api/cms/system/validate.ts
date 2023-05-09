import { TValidator } from '../../../extension/validator/index.js'
import { Length, Matches, MinLength } from 'class-validator'

export class LogListValidator extends TValidator {

    start: Date
    end: Date

    executor: number
    page: number = 0

}
