import { createApp } from 'vue'
import TDialogMention from '@comp/dialog/TDialogMention.vue'

export class DialogBtn {
    content: string
    type: string
    onClick: Function
}

export async function forDialogMention(title: String, message: String, icon: any, btns: DialogBtn[] = [ { content: "确定", type: 'info', onClick: async () => true } ]) {

    const root: HTMLDivElement = document.createElement('div');

    let index: number = 0;

    while( document.getElementById('touch-dialog-tip-' + index) ) {

        index++;

    }

    root.id = 'touch-dialog-tip-' + index;

    root.style.zIndex = `${10000 + index}`

    const app = createApp(TDialogMention, {
        message, index, title, btns, icon,
        close: async () => {

            app.unmount();

            document.body.removeChild(root);

        }
    })

    document.body.appendChild(root);

    app.mount(root);

}