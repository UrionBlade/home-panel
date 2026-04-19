type SSEHandler = (data: unknown) => void;

class SSEClient {
  private source: EventSource | null = null;
  private handlers = new Map<string, Set<SSEHandler>>();

  connect(url: string) {
    this.disconnect();
    this.source = new EventSource(url);
    this.source.onopen = () => console.log("[sse] connected");
    this.source.onerror = () => {
      console.warn("[sse] error, reconnecting...");
      setTimeout(() => this.connect(url), 5000);
    };
    // Re-register handlers
    for (const [event, fns] of this.handlers) {
      for (const fn of fns) {
        this.source.addEventListener(event, (e) => fn(JSON.parse((e as MessageEvent).data)));
      }
    }
  }

  disconnect() {
    this.source?.close();
    this.source = null;
  }

  subscribe(event: string, handler: SSEHandler) {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler);
    if (this.source) {
      this.source.addEventListener(event, (e) => handler(JSON.parse((e as MessageEvent).data)));
    }
    return () => this.handlers.get(event)?.delete(handler);
  }
}

export const sseClient = new SSEClient();
