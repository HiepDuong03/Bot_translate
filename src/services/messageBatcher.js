export class MessageBatcher {
  /**
   * Groups rapid consecutive messages from the same key within debounceMs.
   * @param {{ debounceMs?: number, maxItems?: number, maxChars?: number, onFlush: (items: any[]) => Promise<void> | void }} options
   */
  constructor({
    debounceMs = 1200,
    maxItems = 8,
    maxChars = 1500,
    onFlush,
  }) {
    if (typeof onFlush !== 'function') {
      throw new Error('MessageBatcher requires an onFlush callback.');
    }
    this.debounceMs = debounceMs;
    this.maxItems = maxItems;
    this.maxChars = maxChars;
    this.onFlush = onFlush;
    this.pending = new Map();
  }

  enqueue(key, item, textLength = 0) {
    const batchKey = String(key);

    if (this.debounceMs <= 0) {
      void this._safeFlush([item]);
      return;
    }

    let entry = this.pending.get(batchKey);
    if (!entry) {
      entry = { items: [], totalChars: 0, timer: null };
      this.pending.set(batchKey, entry);
    }

    if (entry.timer) {
      clearTimeout(entry.timer);
      entry.timer = null;
    }

    entry.items.push(item);
    entry.totalChars += textLength;

    if (entry.items.length >= this.maxItems || entry.totalChars >= this.maxChars) {
      this._flushKey(batchKey);
      return;
    }

    entry.timer = setTimeout(() => {
      this._flushKey(batchKey);
    }, this.debounceMs);
  }

  _flushKey(batchKey) {
    const entry = this.pending.get(batchKey);
    if (!entry) return;

    if (entry.timer) {
      clearTimeout(entry.timer);
    }
    this.pending.delete(batchKey);

    if (entry.items.length > 0) {
      void this._safeFlush(entry.items);
    }
  }

  async _safeFlush(items) {
    try {
      await this.onFlush(items);
    } catch (error) {
      console.error('[MessageBatcher] Flush error:', error);
    }
  }

  flushAll() {
    for (const batchKey of [...this.pending.keys()]) {
      this._flushKey(batchKey);
    }
  }

  dispose() {
    for (const entry of this.pending.values()) {
      if (entry.timer) {
        clearTimeout(entry.timer);
      }
    }
    this.pending.clear();
  }
}
