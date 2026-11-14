import { config } from '../config/env.js';
import { channelService } from '../services/channelService.js';
import { translateText } from '../services/geminiService.js';

const DISCORD_MAX_LENGTH = 2000;
let warnedEmptyContent = false;

function truncateForDiscord(text) {
  if (text.length <= DISCORD_MAX_LENGTH) return text;
  return `${text.slice(0, DISCORD_MAX_LENGTH - 3)}...`;
}

export async function handleMessageCreate(message) {
  if (message.author.bot || message.webhookId || !message.guild) return;

  const channelName = message.channel?.name || message.channelId;
  if (!channelService.isEnabled(message.channelId)) return;

  const content = message.content?.trim();
  if (!content) {
    if (!warnedEmptyContent && message.attachments.size === 0 && message.stickers.size === 0) {
      warnedEmptyContent = true;
      console.warn(
        `[Diagnostic] Received a message with EMPTY content in #${channelName}. ` +
        'Please verify "Message Content Intent" is enabled & saved in Discord Developer Portal -> Bot!'
      );
    }
    return;
  }

  const startedAt = Date.now();
  try {
    const result = await translateText(content);
    if (!result) return;

    const safeOutput = truncateForDiscord(result.text);

    if (config.replyToMessage) {
      await message.reply({
        content: safeOutput,
        allowedMentions: { repliedUser: false, parse: [] },
      });
    } else {
      await message.channel.send({
        content: safeOutput,
        allowedMentions: { parse: [] },
      });
    }

    console.log(`[Translate] #${channelName} | ${result.model} | ${Date.now() - startedAt}ms`);
  } catch (error) {
    console.error(`[MessageCreate] Translation/Send failed in #${channelName}:`, error.message);
  }
}
