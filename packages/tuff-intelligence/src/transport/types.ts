export interface TuffEvent<TRequest = void, TResponse = void> {
  readonly __brand: 'TuffEvent'
  readonly namespace: string
  readonly module: string
  readonly action: string
  readonly _request: TRequest
  readonly _response: TResponse
  toString: () => string
  toEventName: () => string
}

export interface StreamOptions<TChunk> {
  onData: (chunk: TChunk) => void
  onError?: (error: Error) => void
  onEnd?: () => void
}

export interface StreamController {
  cancel: () => void
  readonly cancelled: boolean
  readonly streamId: string
}

export interface ITuffTransport {
  send: <TReq, TRes>(event: TuffEvent<TReq, TRes>, payload?: TReq) => Promise<TRes>
  stream?: <TReq, TChunk>(
    event: TuffEvent<TReq, AsyncIterable<TChunk>>,
    payload: TReq,
    options: StreamOptions<TChunk>
  ) => Promise<StreamController>
}
