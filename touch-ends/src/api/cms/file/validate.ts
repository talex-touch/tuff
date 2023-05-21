import { TValidator } from '../../../extension/validator/index.js'
import { IsNotEmpty, IsPositive, Length, Matches, Min, MinLength } from 'class-validator'

export class FileDownloader extends TValidator {

    // @IsPositive({ message: "invalid query" })
    @IsNotEmpty({ message: "require query" })
    i: number

    @IsNotEmpty({ message: "lack path" })
    path: string

    @IsNotEmpty({ message: "lack path" })
    uuid: string

}

export class ImageDownloader extends TValidator {

    @IsNotEmpty({ message: "lack uuid" })
    uuid: string

}

