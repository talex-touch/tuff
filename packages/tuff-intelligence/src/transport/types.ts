export interface TuffEvent<TRequest = void, TResponse = void> {
  toEventName: () => string
  _request?: TRequest
  _response?: TResponse
}

export interface ITuffTransport {
  send: <TReq, TRes>(event: TuffEvent<TReq, TRes>, payload?: TReq) => Promise<TRes>
  stream?: unknown
}
