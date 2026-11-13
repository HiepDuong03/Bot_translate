import { config } from '../config/env.js';
import { KeyPoolService } from './keyPoolService.js';

const SYSTEM_INSTRUCTION = `You are a professional real-time bilingual translator for a Discord chat between Korean and Vietnamese speakers.

Rules:
1. Auto-detect the input language:
   - If the input is Korean: translate it into natural, conversational Vietnamese. Understand Korean chat slang and abbreviations (e.g., ㅋㅋ -> kkk / haha, ㅇㅇ -> ừ / vâng, ㄱㅅ -> cảm ơn, ㄴㄴ -> không, ㅎㅇ -> chào, 수고 -> vất vả rồi / cảm ơn nhé).
   - If the input is Vietnamese (including unaccented Vietnamese or casual chat abbreviations like "ko", "dc", "ok", "nha", "ạ"): translate it into natural, polite conversational Korean (해요체). Avoid stiff, literal machine translation.
2. Preserve Discord mentions (<@123>, <#123>, <@&123>), custom emojis (<:name:123>, <a:name:123>), URLs, numbers, and inline code formatting exactly as they appear.
3. Keep the tone friendly, accurate, and concise.
4. Output ONLY the translated text. Do NOT add explanations, labels, quotes, or prefixes like "Translation:".
5. If the input contains ONLY emojis, URLs, numbers, symbols, or is neither Korean nor Vietnamese (and cannot be meaningfully translated), output exactly: SKIP`;

export const keyPool = new KeyPoolService(config.geminiApiKeys);

/**
 * Checks if a message has no translatable text (only URLs, mentions, custom emojis, numbers, or punctuation).
 * @param {string} text
 * @returns {boolean}
 */
export function shouldSkipTranslation(text) {
  if (!text || !text.trim()) return true;

  const stripped = text
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/<a?:\w+:\d+>/g, '')
    .replace(/<[@#]&?!?\d+>/g, '')
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '')
    .replace(/[\d\s.,!?;:'"()[\]{}\-_+=/*\\|~`@#$%^&<>]/g, '');

  return stripped.length === 0;
}

/**
 * Translates text between Korean and Vietnamese using Gemini with multi-key failover.
 * @param {string} text
 * @returns {Promise<string | null>}
 */
export async function translateText(text) {
  if (shouldSkipTranslation(text)) {
    return null;
  }

  const result = await keyPool.executeWithFailover(async (ai) => {
    const response = await ai.models.generateContent({
      model: config.geminiModel,
      contents: text,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.2,
        abortSignal: AbortSignal.timeout(15000),
      },
    });
    return response.text;
  });

  const cleaned = (result || '').trim();
  if (!cleaned || cleaned === 'SKIP') {
    return null;
  }

  return cleaned;
}
