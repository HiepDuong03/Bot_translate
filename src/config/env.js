import 'dotenv/config';

function parseCommaList(value) {
  if (!value) return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

const rawKeys = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || '';

export const config = {
  discordToken: (process.env.DISCORD_TOKEN || '').trim(),
  clientId: (process.env.CLIENT_ID || '').trim(),
  guildId: (process.env.GUILD_ID || '').trim(),
  geminiApiKeys: parseCommaList(rawKeys),
  geminiModel: (process.env.GEMINI_MODEL || 'gemini-flash-latest').trim(),
  autoTranslateChannelIds: parseCommaList(process.env.AUTO_TRANSLATE_CHANNEL_IDS),
  replyToMessage: String(process.env.REPLY_TO_MESSAGE).toLowerCase() === 'true',
};

export function validateConfig() {
  const missing = [];
  if (!config.discordToken) missing.push('DISCORD_TOKEN');
  if (!config.clientId) missing.push('CLIENT_ID');
  if (config.geminiApiKeys.length === 0) missing.push('GEMINI_API_KEYS');

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables in .env: ${missing.join(', ')}`);
  }
}
