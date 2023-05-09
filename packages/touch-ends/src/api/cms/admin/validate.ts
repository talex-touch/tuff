import { TValidator } from '../../../extension/validator/index.js'
import { IsPositive, Length, Matches, Min, MinLength } from 'class-validator'
import { NotEmpty } from 'sequelize-typescript'

export class GetUsersValidator extends TValidator {

    // @IsPositive({
    //     message: "页数至少应该为0"
    // })
    page: number = 0

    role: number

}
