import { regChannel } from '../../utils/channel-util'
import { ProcessorVars } from '../initializer'

export default () => {

    const actions = {

    }

    regChannel('bluetooth', ({ data , reply }) => {

        reply(actions[data.type]?.(data))

    })

    ProcessorVars.mainWin.webContents.on('select-bluetooth-device', (event, deviceList, callback) => {
        event.preventDefault()
        console.log( event, deviceList )

        deviceList.forEach( device => callback(device.deviceId) )
        // if (deviceList && deviceList.length > 0) {
        //     callback(deviceList[0].deviceId)
        // }
        // callback(deviceList)
    })

    // let grantedDeviceThroughPermHandler
    //
    // win.webContents.session.on('select-usb-device', (event, details, callback) => {
    //     console.log("USB DEVICES", details)
    //     //Add events to handle devices being added or removed before the callback on
    //     //`select-usb-device` is called.
    //     win.webContents.session.on('usb-device-added', (event, device) => {
    //         console.log('usb-device-added FIRED WITH', device)
    //         //Optionally update details.deviceList
    //     })
    //
    //     win.webContents.session.on('usb-device-removed', (event, device) => {
    //         console.log('usb-device-removed FIRED WITH', device)
    //         //Optionally update details.deviceList
    //     })
    //
    //     event.preventDefault()
    //     if (details.deviceList && details.deviceList.length > 0) {
    //         const deviceToReturn  = details.deviceList.find((device) => {
    //             if (!grantedDeviceThroughPermHandler || (device.deviceId != grantedDeviceThroughPermHandler.deviceId)) {
    //                 return true
    //             }
    //         })
    //         if (deviceToReturn) {
    //             callback(deviceToReturn.deviceId)
    //         } else {
    //             callback()
    //         }
    //     }
    // })
    //
    // win.webContents.session.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
    //     if (permission === 'usb' && details.securityOrigin === 'file:///') {
    //         return true
    //     }
    // })
    //
    //
    // win.webContents.session.setDevicePermissionHandler((details) => {
    //     if (details.deviceType === 'usb' && details.origin === 'file://') {
    //         if (!grantedDeviceThroughPermHandler) {
    //             grantedDeviceThroughPermHandler = details.device
    //             return true
    //         } else {
    //             return false
    //         }
    //     }
    // })

    // Listen for a message from the renderer to get the response for the Bluetooth pairing.
    // ipcMain.on('bluetooth-pairing-response', (event, response) => {
    //     bluetoothPinCallback(response)
    // })
    //
    // mainWindow.webContents.session.setBluetoothPairingHandler((details, callback) => {
    //
    //     bluetoothPinCallback = callback
    //     // Send a message to the renderer to prompt the user to confirm the pairing.
    //     mainWindow.webContents.send('bluetooth-pairing-request', details)
    // })

}