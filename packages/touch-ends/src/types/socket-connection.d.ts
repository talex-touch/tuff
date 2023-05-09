import { WebSocketServer } from 'ws'
import Application from 'koa'
import { Server } from 'http'

declare namespace TalexSocket {
    export type INetworkLifeHandlers = Array<Function>
    export type INetworkLifeSymbol = "LifeHandler#Connection" | "LifeHandler#DisConnection"
    export interface INetworkLife {
        lifeHandlers: Map<INetworkLifeSymbol, INetworkLifeHandlers>
        registerLifeHandler(type: INetworkLifeSymbol, handler: Function)
        emitsLife(type: INetworkLifeSymbol, ...data: any)
    }

    export interface ITWebSocket {
        app: Application
        ws: WebSocketServer
        messageFunc: Function
        sessions: Set<any>

        initApp(app: Application): Server
    }

    export type IProtocolHandler = Function
    export interface ITProtocol {
        protocolHandlers: Map<string, IProtocolHandler>
        registerProtocol(protocol: string, handler: IProtocolHandler)
    }

    export interface IWebsocketChannel {
        app: Application
        websocket: ITWebSocket
    }
}

export { TalexSocket }

