import { config } from '../config/env.js';
import { KeyPoolService } from './keyPoolService.js';

const HANGUL_REGEX = /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/;
const VI_DIACRITIC_REGEX = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;

const GAMING_GLOSSARY = `Domain & Gaming Glossary (team cày game / MMORPG):
- acc / nick <-> 계정 / 캐릭 (tài khoản / nhân vật game)
- cày / farm / train <-> 사냥 / 파밍 / 육성
- ca / đổi ca / slot <-> 타임 / 교대 (ca cày / bàn giao ca)
- treo máy / AFK <-> 잠수 / 자리비움
- dis / văng / lag / lỗi <-> 튕김 / 렉 / 오류 / 버그
- bảo trì <-> 점검
- vào game / log vào / out ra <-> 접속 / 로그인 / 로그아웃
- chạy giờ / đủ giờ <-> 시간 채우기 / 시간 완료
- boss / party / guild / quest / drop / trade / meso / gold / item <-> 보스 / 파티(팟) / 길드 / 퀘스트 / 드랍 / 거래 / 메소 / 골드 / 템`;

const KO_TO_VI_INSTRUCTION = `You are a professional real-time Korean-to-Vietnamese translator for a gaming team chat.
The Korean speaker is a senior/older partner or manager. Translate ONLY the target Korean message into natural, straightforward, everyday Vietnamese.
- Match the speaker's natural casual-to-polite tone directly in Vietnamese. Do NOT add overly deferential words like "dạ", "ạ", or "nhỉ ạ" unless the Korean text itself is explicitly humble/apologetic.
- Understand Korean chat & gaming slang accurately:
  - ㅋㅋ / ㅎㅎ -> haha / kkk
  - ㅇㅇ -> ừ / đúng rồi
  - ㄱㅅ / ㄳ -> cảm ơn nhé
  - ㄴㄴ -> không / chưa đâu
  - ㄱㄱ -> triển thôi / bắt đầu nhé
  - ㅇㅈ -> chuẩn luôn
  - 수고 -> vất vả rồi / làm tốt lắm
- ${GAMING_GLOSSARY}
- Example: "아 이전아이디 다 받아서 없는거구나" -> "À ra thế, vì nhận hết acc cũ rồi nên không còn nữa nhỉ."
- Example: "지금 점검 중이라서 잠깐 쉴게요" -> "Hiện game đang bảo trì nên mình nghỉ một lát nhé."
- Example: "계정 확인 좀 해주세요" -> "Kiểm tra lại acc giúp mình chút nhé."
- If previous chat context is provided, use it ONLY to resolve implied subjects and tone. NEVER repeat or translate the context lines.
- Preserve Discord mentions (<@123>, <#123>, <@&123>), custom emojis (<:name:123>, <a:name:123>), URLs, numbers, and code formatting exactly.
- Output ONLY the Vietnamese translation. Do NOT include the original Korean text, quotes, or explanations.`;

const VI_TO_KO_INSTRUCTION = `You are a professional real-time Vietnamese-to-Korean translator for a gaming team communicating with an older Korean manager/client.
Translate ONLY the target Vietnamese message (including unaccented Vietnamese or casual chat abbreviations like "ko", "dc", "ok", "nha", "nhé", "acc", "dis") into respectful, formal workplace Korean (비즈니스/공손한 존댓말: 하십시오체 ~습니다/~ㅂ니다 and polite ~주세요/~드리겠습니다).
- ALWAYS maintain strict workplace politeness toward an older senior/manager (e.g., use ~습니다, ~드리겠습니다, ~주시면 감사하겠습니다, 죄송합니다, 확인했습니다). NEVER use casual speech (반말) or overly breezy endings, even if the Vietnamese input is short or casual.
- ${GAMING_GLOSSARY}
- Example input: "cày acc xong rồi nha" -> Example output: "계정 육성 작업 완료했습니다."
- Example input: "đang bị dis game, đợi xíu tôi log lại nhé" -> Example output: "현재 게임이 튕겨서 잠시만 기다려 주시면 바로 다시 접속하겠습니다."
- Example input: "ok ban oi doi xiu nha" -> Example output: "네, 잠시만 기다려 주시기 바랍니다."
- Example input: "vâng ạ, để em kiểm tra lại ngay" -> Example output: "네, 알겠습니다. 바로 다시 확인해 보겠습니다."
- If previous chat context is provided, use it ONLY to resolve implied subjects and tone. NEVER repeat or translate the context lines.
- Preserve Discord mentions (<@123>, <#123>, <@&123>), custom emojis (<:name:123>, <a:name:123>), URLs, numbers, and code formatting exactly.
- Output ONLY the Korean translation in Hangul. Do NOT output Vietnamese, quotes, or explanations.
- If the target message is clearly pure English unrelated to Vietnamese (e.g., "hello", "good morning", "nice try", "thank you", "deploy done", "gg") with no Vietnamese words, output exactly: SKIP`;

const MIXED_INSTRUCTION = `You are a professional real-time bilingual Korean-Vietnamese translator for a gaming team.
The target message mixes both Korean and Vietnamese. Translate the full meaning into BOTH languages on two separate lines:
🇻🇳 <natural straightforward Vietnamese meaning (no artificial "dạ/ạ")>
🇰🇷 <respectful, formal workplace Korean meaning (하십시오체 ~습니다/존댓말)>
- ${GAMING_GLOSSARY}
- If previous chat context is provided, use it ONLY for reference. NEVER translate the context lines.
- Preserve Discord mentions, custom emojis, URLs, and code formatting. Output ONLY the 2 lines above.`;

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
 * Formats prompt contents with optional conversation context.
 * @param {string} text
 * @param {{ authorName: string, text: string }[]} [contextMessages]
 * @returns {string}
 */
export function buildTranslationPrompt(text, contextMessages = []) {
  if (!contextMessages || contextMessages.length === 0) {
    return text;
  }

  const contextLines = contextMessages
    .map((m) => `- ${m.authorName}: ${m.text}`)
    .join('\n');

  return [
    'Previous chat context (reference only, DO NOT translate):',
    contextLines,
    '',
    'Target message to translate:',
    text,
  ].join('\n');
}

/**
 * Splits a long message into chunks within Discord's 2000-character limit.
 * @param {string} text
 * @param {number} [maxLen]
 * @returns {string[]}
 */
export function splitForDiscord(text, maxLen = 2000) {
  if (!text) return [];
  if (text.length <= maxLen) return [text];

  const chunks = [];
  let remaining = text;

  while (remaining.length > maxLen) {
    let splitAt = remaining.lastIndexOf('\n', maxLen);
    if (splitAt <= 0) {
      splitAt = remaining.lastIndexOf(' ', maxLen);
    }
    if (splitAt <= 0) {
      splitAt = maxLen;
    }

    chunks.push(remaining.slice(0, splitAt).trimEnd());
    remaining = remaining.slice(splitAt).trimStart();
  }

  if (remaining.length > 0) {
    chunks.push(remaining);
  }

  return chunks;
}

function selectSystemInstruction(text) {
  const hasHangul = HANGUL_REGEX.test(text);
  const hasVietnamese = VI_DIACRITIC_REGEX.test(text);

  if (hasHangul && hasVietnamese) {
    return MIXED_INSTRUCTION;
  }
  return hasHangul ? KO_TO_VI_INSTRUCTION : VI_TO_KO_INSTRUCTION;
}

/**
 * Free Google Translate GTX fallback when all Gemini models fail or exceed timeout.
 * @param {string} text
 * @returns {Promise<{ text: string, model: string } | null>}
 */
export async function translateWithGoogleGtx(text) {
  const hasHangul = HANGUL_REGEX.test(text);
  const hasVietnamese = VI_DIACRITIC_REGEX.test(text);

  async function fetchGtx(sl, tl) {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
    if (!res.ok) throw new Error(`GoogleGTX HTTP ${res.status}`);
    const data = await res.json();
    return Array.isArray(data?.[0])
      ? data[0].map((part) => part?.[0] || '').join('').trim()
      : '';
  }

  if (hasHangul && hasVietnamese) {
    const [viText, koText] = await Promise.all([fetchGtx('auto', 'vi'), fetchGtx('auto', 'ko')]);
    return {
      text: `🇻🇳 ${viText}\n🇰🇷 ${koText}`,
      model: 'google-gtx-instant',
    };
  }

  const sl = hasHangul ? 'ko' : 'vi';
  const tl = hasHangul ? 'vi' : 'ko';
  const translated = await fetchGtx(sl, tl);

  if (!translated || translated.toLowerCase() === text.trim().toLowerCase()) {
    return null;
  }
  return { text: translated, model: 'google-gtx-instant' };
}

/**
 * Creates a translator function with multi-model fallback + instant Google GTX safety net.
 */
export function createTranslator({
  candidateModels = [config.geminiModel, ...config.geminiFallbackModels],
  executeWithPool = (fn) => keyPool.executeWithFailover(fn),
  fastFallbackFn = translateWithGoogleGtx,
} = {}) {
  return async function translate(text, contextMessages = []) {
    if (shouldSkipTranslation(text)) {
      return null;
    }

    const systemInstruction = selectSystemInstruction(text);
    const contents = buildTranslationPrompt(text, contextMessages);
    let lastError = null;

    for (const model of candidateModels) {
      try {
        const result = await executeWithPool(async (ai) => {
          const response = await ai.models.generateContent({
            model,
            contents,
            config: {
              systemInstruction,
              temperature: 0.2,
              thinkingConfig: { thinkingLevel: 'MINIMAL' },
              abortSignal: AbortSignal.timeout(4500),
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
        console.warn(`[Gemini] Model "${model}" slow/failed (${error.message}). Switching to next fallback...`);
      }
    }

    if (typeof fastFallbackFn === 'function') {
      try {
        return await fastFallbackFn(text);
      } catch (fallbackErr) {
        console.warn(`[Fallback] GoogleGTX also failed: ${fallbackErr.message}`);
      }
    }

    throw lastError || new Error('All Gemini models and fallbacks failed.');
  };
}

export const translateText = createTranslator();
