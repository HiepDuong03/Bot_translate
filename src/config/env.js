import 'dotenv/config';

function parseCommaList(value) {
  if (!value) return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseIntWithDefault(value, fallback, min = 0) {
  const parsed = Number.parseInt(value ?? '', 10);
  if (Number.isNaN(parsed) || parsed < min) return fallback;
  return parsed;
}

// Automatically remap slow/overloaded heavy models if still set in Render Environment
const SLOW_MODELS = new Set(['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-2.5-flash']);
const rawPrimaryModel = (process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite').trim();
const primaryModel = SLOW_MODELS.has(rawPrimaryModel) ? 'gemini-3.5-flash-lite' : rawPrimaryModel;

const rawKeys = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || '';
const rawFallbacks = process.env.GEMINI_FALLBACK_MODELS ?? 'gemini-flash-lite-latest,gemini-3.1-flash-lite';
const fallbackModels = parseCommaList(rawFallbacks).filter((m) => m !== primaryModel && !SLOW_MODELS.has(m));

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
  contextMaxMessages: parseIntWithDefault(process.env.CONTEXT_MAX_MESSAGES, 4, 0),
  contextTtlMs: parseIntWithDefault(process.env.CONTEXT_TTL_MS, 10 * 60 * 1000, 0),
  batchDebounceMs: parseIntWithDefault(process.env.BATCH_DEBOUNCE_MS, 0, 0),
  quotaAlertCooldownMs: parseIntWithDefault(process.env.QUOTA_ALERT_COOLDOWN_MS, 15 * 60 * 1000, 1000),
  tursoDatabaseUrl: (process.env.TURSO_DATABASE_URL || '').trim(),
  tursoAuthToken: (process.env.TURSO_AUTH_TOKEN || '').trim(),
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
