import { Component, createApp } from 'vue'
import TDialogMention from '@comp/base/dialog/TDialogMention.vue'
import TBottomDialog from '@comp/base/dialog/TBottomDialog.vue'
import TBlowDialog from "@comp/base/dialog/TBlowDialog.vue";
import TPopperDialog from "@comp/base/dialog/TPopperDialog.vue";
import VWave from "v-wave";

export class DialogBtn {
    content: string
    type: string
    onClick: Function
}

export async function forDialogMention(title: String, message: String, icon: any = null, btns: DialogBtn[] = [ { content: "确定", type: 'info', onClick: async () => true } ]) {
    return new Promise<void>((resolve) => {
        const root: HTMLDivElement = document.createElement('div');

        let index: number = 0;

        while( document.getElementById('touch-dialog-tip-' + index) ) {

            index++;

        }

        root.id = 'touch-dialog-tip-' + index;

        root.style.zIndex = `${10000 + index}`

        // @ts-ignore
        const app = createApp(TDialogMention, {
            message, index, title, btns, icon, loading: false,
            close: async () => {

                app.unmount();

                document.body.removeChild(root);

                resolve()

            }
        })

        document.body.appendChild(root);

        app.use(VWave, {})

        app.mount(root);
    })
}

export class BottomDialogBtn {
    content: string
    type: string
    onClick: Function
    time?: number = 0
}

export async function forApplyMention(title: String, message: String, btns: BottomDialogBtn[] = [ { content: "确定", type: 'info', onClick: async () => true, time: 0 } ]) {

    const root: HTMLDivElement = document.createElement('div');

    let index: number = 0;

    while( document.getElementById('touch-bottom-dialog-tip-' + index) ) {

        index++;

    }

    root.id = 'touch-bottom-dialog-tip-' + index;

    // root.children[0].style.zIndex = `${10000 + index}`

    const app = createApp(TBottomDialog, {
        message, index, title, btns,
        close: async () => {

            app.unmount();

            document.body.removeChild(root);

        }
    })

    document.body.appendChild(root);

    app.use(VWave, {})

    app.mount(root);

}

export async function blowMention(title: String, message: String | Component | Function ) {
    return new Promise((resolve) => {
        const root: HTMLDivElement = document.createElement('div');

        if ( document.getElementById('touch-blow-dialog-tip') ) {
            return
        }

        root.id = 'touch-bottom-dialog-tip';

        const propName = (message instanceof String || typeof message === 'string') ? 'message' : (message instanceof Function ? 'render' : 'component')

        const app = createApp(TBlowDialog, {
            [propName]: message,
            title,
            close: async () => {

                resolve(propName)

                app.unmount();

                document.body.removeChild(root);

            }
        })

        document.body.appendChild(root);

        app.use(VWave, {})

        app.mount(root);
    })
}
export async function popperMention(title: String, message: String | Component | Function ) {

    const root: HTMLDivElement = document.createElement('div');

    if ( document.getElementById('touch-popper-dialog-tip') ) {
        return
    }

    root.id = 'touch-popper-dialog-tip';

    const propName = (message instanceof String || typeof message === 'string') ? 'message' : (message instanceof Function ? 'render' : 'component')

    const app = createApp(TPopperDialog, {
        [propName]: message,
        title,
        close: async () => {

            app.unmount();

            document.body.removeChild(root);

        }
    })

    document.body.appendChild(root);

    app.use(VWave, {})

    app.mount(root);

}