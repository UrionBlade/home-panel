type SSEHandler = (data: unknown) => void;
type Listener = (e: MessageEvent) => void;

/**
 * SSE client with stable listener wrappers: avoids duplication on reconnect
 * and guarantees correct cleanup in subscribe().
 */
class SSEClient {
  private source: EventSource | null = null;
  private handlers = new Map<string, Set<SSEHandler>>();
  /** Wrappers currently registered on the current source, keyed by event name */
  private activeWrappers = new Map<string, Map<SSEHandler, Listener>>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  connect(url: string) {
    this.disconnect();
    this.source = new EventSource(url);
    this.source.onopen = () => console.log("[sse] connected");
    this.source.onerror = () => {
      console.warn("[sse] error, reconnecting in 5s…");
      if (!this.reconnectTimer) {
        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = null;
          this.connect(url);
        }, 5000);
      }
    };
    // Re-register all already-subscribed handlers on the new source
    for (const [event, fns] of this.handlers) {
      for (const fn of fns) {
        this.attachWrapper(event, fn);
      }
    }
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.source?.close();
    this.source = null;
    this.activeWrappers.clear();
  }

  private attachWrapper(event: string, handler: SSEHandler) {
    if (!this.source) return;
    let perEvent = this.activeWrappers.get(event);
    if (!perEvent) {
      perEvent = new Map();
      this.activeWrappers.set(event, perEvent);
    }
    // If already registered on the current source, don't duplicate
    if (perEvent.has(handler)) return;
    const wrapper: Listener = (e) => {
      try {
        handler(JSON.parse(e.data));
      } catch (err) {
        console.error("[sse] handler error:", err);
      }
    };
    perEvent.set(handler, wrapper);
    this.source.addEventListener(event, wrapper);
  }

  private detachWrapper(event: string, handler: SSEHandler) {
    const perEvent = this.activeWrappers.get(event);
    const wrapper = perEvent?.get(handler);
    if (this.source && wrapper) {
      this.source.removeEventListener(event, wrapper);
    }
    perEvent?.delete(handler);
    if (perEvent && perEvent.size === 0) this.activeWrappers.delete(event);
  }

  subscribe(event: string, handler: SSEHandler) {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler);
    this.attachWrapper(event, handler);
    return () => {
      this.handlers.get(event)?.delete(handler);
      this.detachWrapper(event, handler);
    };
  }
}

export const sseClient = new SSEClient();
