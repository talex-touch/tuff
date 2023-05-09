import { validateOrReject } from 'class-validator'
import { Context } from 'koa'
import { cloneDeep } from 'lodash-es'
import { ParametersException } from '../../error/base-error.js'

export class TValidator {
    async validate(ctx: Context) {

        const params = {
            ...ctx.request.body,
            ...ctx.request.query,
            ...ctx.params
        };

        const data = cloneDeep(params);
        for (let key in params) {
            this[key] = params[key];
        }

        try {

            await validateOrReject(this);
            return data;

        } catch (errors) {

            let errorResult: string[] = [];
            errors.forEach(error => {
                let messages: string[] = [];
                for (let msg in error.constraints) {
                    messages.push(error.constraints[msg]);
                }
                errorResult = errorResult.concat(messages)
            });

            throw new ParametersException({ msg: errorResult });

        }

    }

}

export default () => {}
