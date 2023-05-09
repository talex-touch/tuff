import { App } from 'vue'

const modulesFiles = import.meta.glob('@modules/**/*.ts')

export default {
    install(app: App) {

        Object.defineProperty(window, 'app', {
            value: app,
            writable: false,
            enumerable: true
        })

        // console.log(window)

        for( const moduleFile of Object.values(modulesFiles) ) {

            app.use(moduleFile)
            // moduleFile.call(this)

        }

        console.log('done modules', modulesFiles)

    }
}
