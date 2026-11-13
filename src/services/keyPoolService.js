import { GoogleGenAI } from '@google/genai';

const DEFAULT_COOLDOWN_MS = 60 * 1000;
const AUTH_ERROR_COOLDOWN_MS = 60 * 60 * 1000;

function isRateLimitOrTransient(error) {
  const status = error?.status || error?.statusCode || error?.response?.status;
  const msg = String(error?.message || '').toLowerCase();
  return (
    status === 429 ||
    status === 500 ||
    status === 503 ||
    error?.name === 'TimeoutError' ||
    error?.name === 'AbortError' ||
    msg.includes('429') ||
    msg.includes('503') ||
    msg.includes('resource_exhausted') ||
    msg.includes('unavailable') ||
    msg.includes('quota') ||
    msg.includes('rate limit') ||
    msg.includes('overloaded') ||
    msg.includes('timeout') ||
    msg.includes('aborted')
  );
}

function isAuthOrKeyError(error) {
  const status = error?.status || error?.statusCode || error?.response?.status;
  const msg = String(error?.message || '').toLowerCase();
  return (
    status === 400 ||
    status === 401 ||
    status === 403 ||
    msg.includes('api_key_invalid') ||
    msg.includes('api key not valid') ||
    msg.includes('permission_denied')
  );
}

export class KeyPoolService {
  /**
   * @param {string[]} apiKeys
   * @param {(apiKey: string) => any} [clientFactory]
   */
  constructor(apiKeys, clientFactory = (apiKey) => new GoogleGenAI({ apiKey })) {
    this.slots = apiKeys.map((apiKey, idx) => ({
      id: idx + 1,
      maskedKey: apiKey.length > 6 ? `...${apiKey.slice(-4)}` : '****',
      client: clientFactory(apiKey),
      cooldownUntil: 0,
      successCount: 0,
      errorCount: 0,
      lastError: null,
    }));
    this.currentIndex = 0;
  }

  hasKeys() {
    return this.slots.length > 0;
  }

  /**
   * Executes an async operation with automatic round-robin & failover across API keys.
   * @template T
   * @param {(client: any, slot: object) => Promise<T>} taskFn
   * @returns {Promise<T>}
   */
  async executeWithFailover(taskFn) {
    if (!this.hasKeys()) {
      throw new Error('No Gemini API keys configured.');
    }

    const total = this.slots.length;
    const triedIndices = new Set();
    let lastError = null;

    for (let attempt = 0; attempt < total; attempt++) {
      const now = Date.now();
      let selectedIdx = -1;

      for (let offset = 0; offset < total; offset++) {
        const idx = (this.currentIndex + offset) % total;
        if (!triedIndices.has(idx) && now >= this.slots[idx].cooldownUntil) {
          selectedIdx = idx;
          break;
        }
      }

      if (selectedIdx === -1) {
        break;
      }

      triedIndices.add(selectedIdx);
      const slot = this.slots[selectedIdx];
      this.currentIndex = (selectedIdx + 1) % total;

      try {
        const result = await taskFn(slot.client, slot);
        slot.successCount += 1;
        slot.lastError = null;
        return result;
      } catch (error) {
        slot.errorCount += 1;
        slot.lastError = error?.message || String(error);
        lastError = error;

        if (isAuthOrKeyError(error)) {
          slot.cooldownUntil = Date.now() + AUTH_ERROR_COOLDOWN_MS;
          console.warn(`[KeyPool] Key #${slot.id} (${slot.maskedKey}) auth/invalid error, cooling down 1h: ${slot.lastError}`);
        } else if (isRateLimitOrTransient(error)) {
          slot.cooldownUntil = Date.now() + DEFAULT_COOLDOWN_MS;
          console.warn(`[KeyPool] Key #${slot.id} (${slot.maskedKey}) hit rate limit/transient error, switching to next key: ${slot.lastError}`);
        } else {
          // Non-key-related error (e.g. content safety or network abort): rethrow immediately
          throw error;
        }
      }
    }

    throw lastError || new Error('All Gemini API keys are currently in cooldown.');
  }

  getStatus() {
    const now = Date.now();
    return this.slots.map((slot) => {
      const remainingSec = Math.max(0, Math.ceil((slot.cooldownUntil - now) / 1000));
      return {
        id: slot.id,
        maskedKey: slot.maskedKey,
        status: remainingSec > 0 ? `Cooldown (${remainingSec}s)` : 'Ready',
        successCount: slot.successCount,
        errorCount: slot.errorCount,
        lastError: slot.lastError,
      };
    });
  }
}
