import 'dotenv/config';

function parseCommaList(value) {
  if (!value) return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

const rawKeys = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || '';
const primaryModel = (process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite').trim();
const rawFallbacks = process.env.GEMINI_FALLBACK_MODELS ?? 'gemini-flash-lite-latest,gemini-3.1-flash-lite';
const fallbackModels = parseCommaList(rawFallbacks).filter((m) => m !== primaryModel);

export const config = {
  discordToken: (process.env.DISCORD_TOKEN || '').trim(),
  clientId: (process.env.CLIENT_ID || '').trim(),
  guildId: (process.env.GUILD_ID || '').trim(),
  geminiApiKeys: parseCommaList(rawKeys),
  geminiModel: primaryModel,
  geminiFallbackModels: fallbackModels,
  autoTranslateAll: String(process.env.AUTO_TRANSLATE_ALL ?? 'true').toLowerCase() !== 'false',
  autoTranslateChannelIds: parseCommaList(process.env.AUTO_TRANSLATE_CHANNEL_IDS),
  ignoredChannelIds: parseCommaList(process.env.IGNORED_CHANNEL_IDS),
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
