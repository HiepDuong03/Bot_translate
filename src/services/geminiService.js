import { config } from '../config/env.js';
import { KeyPoolService } from './keyPoolService.js';

const HANGUL_REGEX = /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/;

const KO_TO_VI_INSTRUCTION = `You are a professional real-time Korean-to-Vietnamese translator for Discord chat.
Translate the user's Korean message into natural, conversational Vietnamese.
- Understand Korean chat slang and abbreviations (e.g., ㅋㅋ -> kkk / haha, ㅇㅇ -> ừ / vâng, ㄱㅅ -> cảm ơn, ㄴㄴ -> không, ㅎㅇ -> chào, 수고 -> vất vả rồi / cảm ơn nhé).
- Preserve Discord mentions (<@123>, <#123>, <@&123>), custom emojis (<:name:123>, <a:name:123>), URLs, numbers, and code formatting exactly.
- Output ONLY the Vietnamese translation. Do NOT include the original Korean text, quotes, or explanations.`;

const VI_TO_KO_INSTRUCTION = `You are a professional real-time Vietnamese-to-Korean translator for Discord chat.
Translate the user's Vietnamese message (including unaccented Vietnamese or casual abbreviations like "ko", "dc", "ok", "nha", "ạ") into natural, polite conversational Korean (해요체).
- Example input: "Hôm nay 8 giờ tối họp nhé mọi người" -> Example output: "오늘 저녁 8시에 다 같이 회의해요."
- Example input: "ok ban oi, doi xiu nhe" -> Example output: "네, 잠시만 기다려 주세요."
- Preserve Discord mentions (<@123>, <#123>, <@&123>), custom emojis (<:name:123>, <a:name:123>), URLs, numbers, and code formatting exactly.
- Output ONLY the Korean translation in Hangul. Do NOT output Vietnamese, quotes, or explanations.
- If the input is purely English/other language that is NOT Vietnamese and NOT a common chat message to translate, or is untranslatable symbols, output: SKIP`;

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
 * Translates text between Korean and Vietnamese using Gemini with multi-key and multi-model failover.
 * @param {string} text
 * @returns {Promise<{ text: string, model: string } | null>}
 */
export async function translateText(text) {
  if (shouldSkipTranslation(text)) {
    return null;
  }

  const isKorean = HANGUL_REGEX.test(text);
  const systemInstruction = isKorean ? KO_TO_VI_INSTRUCTION : VI_TO_KO_INSTRUCTION;
  const candidateModels = [config.geminiModel, ...config.geminiFallbackModels];
  let lastError = null;

  for (const model of candidateModels) {
    try {
      const result = await keyPool.executeWithFailover(async (ai) => {
        const response = await ai.models.generateContent({
          model,
          contents: text,
          config: {
            systemInstruction,
            temperature: 0.2,
            abortSignal: AbortSignal.timeout(12000),
          },
        });
        return response.text;
      });

      const cleaned = (result || '').trim();
      if (!cleaned || cleaned === 'SKIP') {
        return null;
      }

      return { text: cleaned, model };
    } catch (error) {
      lastError = error;
      console.warn(`[Gemini] Model "${model}" failed across available keys (${error.message}). Trying next fallback model...`);
    }
  }

  throw lastError || new Error('All Gemini models and API keys failed.');
}
