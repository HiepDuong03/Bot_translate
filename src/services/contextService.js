import { config } from '../config/env.js';

export class ContextService {
  /**
   * Maintains a short-lived sliding window of recent user messages per channel.
   * @param {{ maxMessages?: number, ttlMs?: number }} [options]
   */
  constructor({
    maxMessages = config.contextMaxMessages,
    ttlMs = config.contextTtlMs,
  } = {}) {
    this.maxMessages = maxMessages;
    this.ttlMs = ttlMs;
    this.channels = new Map();
  }

  _prune(channelId, now = Date.now()) {
    const list = this.channels.get(String(channelId));
    if (!list) return [];

    const valid = this.ttlMs > 0
      ? list.filter((entry) => now - entry.timestamp <= this.ttlMs)
      : list;

    if (valid.length === 0) {
      this.channels.delete(String(channelId));
    } else if (valid.length !== list.length) {
      this.channels.set(String(channelId), valid);
    }

    return valid;
  }

  addMessage(channelId, { authorName, text, timestamp = Date.now() }) {
    if (this.maxMessages <= 0 || !text?.trim()) return;

    const id = String(channelId);
    const list = this._prune(id, timestamp);
    list.push({
      authorName: String(authorName || 'User'),
      text: text.trim().slice(0, 300),
      timestamp,
    });

    const trimmed = list.length > this.maxMessages
      ? list.slice(list.length - this.maxMessages)
      : list;

    this.channels.set(id, trimmed);
  }

  getContext(channelId, now = Date.now()) {
    if (this.maxMessages <= 0) return [];
    return this._prune(String(channelId), now).map(({ authorName, text }) => ({
      authorName,
      text,
    }));
  }

  clearChannel(channelId) {
    this.channels.delete(String(channelId));
  }

  clearAll() {
    this.channels.clear();
  }
}

export const contextService = new ContextService();
