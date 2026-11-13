import { config } from '../config/env.js';
import { channelService } from '../services/channelService.js';
import { translateText } from '../services/geminiService.js';

const DISCORD_MAX_LENGTH = 2000;

function truncateForDiscord(text) {
  if (text.length <= DISCORD_MAX_LENGTH) return text;
  return `${text.slice(0, DISCORD_MAX_LENGTH - 3)}...`;
}

export async function handleMessageCreate(message) {
  if (message.author.bot || message.webhookId || !message.guild) return;
  if (!channelService.isEnabled(message.channelId)) return;

  const content = message.content?.trim();
  if (!content) return;

  try {
    const translated = await translateText(content);
    if (!translated) return;

    const safeOutput = truncateForDiscord(translated);

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
  } catch (error) {
    console.error(`[MessageCreate] Translation failed in #${message.channel?.name || message.channelId}:`, error.message);
  }
}
