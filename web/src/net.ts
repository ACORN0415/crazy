type Handler = (data: any) => void

class Net {
  private ws: WebSocket | null = null
  private handlers = new Map<string, Set<Handler>>()

  connect(): Promise<void> {
    this.ws?.close()
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${proto}://${location.host}/ws`)
    this.ws = ws
    return new Promise((resolve, reject) => {
      ws.onopen = () => resolve()
      ws.onerror = () => reject(new Error('서버에 연결할 수 없습니다.'))
      ws.onclose = () => {
        if (this.ws === ws) {
          this.ws = null
          this.emit('close', null)
        }
      }
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data)
          this.emit(msg.type, msg.data)
        } catch {
          // ignore malformed frames
        }
      }
    })
  }

  send(type: string, data?: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, data }))
    }
  }

  on(type: string, h: Handler): () => void {
    let set = this.handlers.get(type)
    if (!set) {
      set = new Set()
      this.handlers.set(type, set)
    }
    set.add(h)
    return () => set!.delete(h)
  }

  private emit(type: string, data: unknown) {
    this.handlers.get(type)?.forEach((h) => h(data))
  }
}

export const net = new Net()
