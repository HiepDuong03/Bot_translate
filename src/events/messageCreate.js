import { config } from '../config/env.js';
import { channelService } from '../services/channelService.js';
import { contextService } from '../services/contextService.js';
import { MessageBatcher } from '../services/messageBatcher.js';
import { shouldSkipTranslation, splitForDiscord, translateText } from '../services/geminiService.js';

function isQuotaExhaustedError(error) {
  const msg = String(error?.message || '').toLowerCase();
  const status = error?.status || error?.statusCode;
  return (
    status === 429 ||
    msg.includes('429') ||
    msg.includes('resource_exhausted') ||
    msg.includes('quota') ||
    msg.includes('cooldown')
  );
}

export function createMessageHandler({
  channelSvc = channelService,
  contextSvc = contextService,
  translateFn = translateText,
  batchDebounceMs = config.batchDebounceMs,
  replyToMessage = config.replyToMessage,
  quotaAlertCooldownMs = config.quotaAlertCooldownMs,
} = {}) {
  let warnedEmptyContent = false;
  const lastQuotaAlertByChannel = new Map();

  const batcher = new MessageBatcher({
    debounceMs: batchDebounceMs,
    onFlush: async (items) => {
      const first = items[0];
      const last = items[items.length - 1];
      const channel = last.channel;
      const channelId = last.channelId;
      const channelName = channel?.name || channelId;
      const authorName = last.member?.displayName || last.author?.globalName || last.author?.username || 'User';

      const mergedText = items
        .map((m) => m.content.trim())
        .filter(Boolean)
        .join('\n');

      if (!mergedText) return;

      const history = contextSvc.getContext(channelId);
      contextSvc.addMessage(channelId, { authorName, text: mergedText });

      const startedAt = Date.now();
      try {
        const result = await translateFn(mergedText, history);
        if (!result) return;

        const chunks = splitForDiscord(result.text);
        for (let i = 0; i < chunks.length; i++) {
          if (i === 0 && replyToMessage && typeof last.reply === 'function') {
            await last.reply({
              content: chunks[i],
              allowedMentions: { repliedUser: false, parse: [] },
            });
          } else {
            await channel.send({
              content: chunks[i],
              allowedMentions: { parse: [] },
            });
          }
        }

        console.log(
          `[Translate] #${channelName} | batch=${items.length} | ctx=${history.length} | ${result.model} | ${Date.now() - startedAt}ms`
        );
      } catch (error) {
        console.error(`[MessageCreate] Translation/Send failed in #${channelName}:`, error.message);

        if (isQuotaExhaustedError(error)) {
          const now = Date.now();
          const lastAlert = lastQuotaAlertByChannel.get(channelId) || 0;
          if (now - lastAlert >= quotaAlertCooldownMs && typeof channel?.send === 'function') {
            lastQuotaAlertByChannel.set(channelId, now);
            await channel.send({
              content: '⚠️ Toàn bộ Gemini API Key hiện đang chạm giới hạn lượt dùng, tạm thời chưa dịch được. Vui lòng thử lại sau ít phút hoặc kiểm tra `/key-status`.',
              allowedMentions: { parse: [] },
            }).catch(() => {});
          }
        }
      }
    },
  });

  async function handler(message) {
    if (message.author?.bot || message.webhookId || !message.guild) return;

    const channelName = message.channel?.name || message.channelId;
    if (!channelSvc.isEnabled(message.channelId)) return;

    const content = message.content?.trim();
    if (!content) {
      const hasAttachments = (message.attachments?.size || 0) > 0;
      const hasStickers = (message.stickers?.size || 0) > 0;
      if (!warnedEmptyContent && !hasAttachments && !hasStickers) {
        warnedEmptyContent = true;
        console.warn(
          `[Diagnostic] Received a message with EMPTY content in #${channelName}. ` +
          'Please verify "Message Content Intent" is enabled & saved in Discord Developer Portal -> Bot!'
        );
      }
      return;
    }

    if (shouldSkipTranslation(content)) return;

    const batchKey = `${message.channelId}:${message.author.id}`;
    batcher.enqueue(batchKey, message, content.length);
  }

  return {
    handler,
    flushAll: () => batcher.flushAll(),
    dispose: () => batcher.dispose(),
  };
}

const defaultHandler = createMessageHandler();

export const handleMessageCreate = defaultHandler.handler;
export const disposeMessageHandler = defaultHandler.dispose;
