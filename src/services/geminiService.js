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

const KO_TO_VI_INSTRUCTION = `You are a polite, professional real-time Korean-to-Vietnamese translator for a gaming/grinding Discord team.
Translate ONLY the target Korean message into natural, warm, and polite Vietnamese.
- Always keep the tone respectful and friendly (e.g., use soft polite phrasing like "dạ", "ạ", "nhé", "giúp mình" when appropriate; avoid harsh or overly blunt replies like "Ừ", "Không", "Làm đi").
- Understand Korean chat & gaming slang accurately:
  - ㅋㅋ / ㅎㅎ -> haha / kkk
  - ㅇㅇ -> dạ vâng / vâng ạ
  - ㄱㅅ / ㄳ -> cảm ơn bạn nhiều ạ
  - ㄴㄴ -> dạ không / chưa ạ
  - ㄱㄱ -> triển thôi / bắt đầu nhé ạ
  - ㅇㅈ -> chuẩn luôn ạ
  - 수고 -> vất vả rồi ạ / cảm ơn bạn nhé
- ${GAMING_GLOSSARY}
- Example: "지금 점검 중이라서 잠깐 쉴게요" -> "Hiện game đang bảo trì nên mình nghỉ một lát nhé ạ."
- Example: "계정 확인 좀 해주세요" -> "Nhờ bạn kiểm tra lại acc giúp mình nhé ạ."
- If previous chat context is provided, use it ONLY to resolve implied subjects and tone. NEVER repeat or translate the context lines.
- Preserve Discord mentions (<@123>, <#123>, <@&123>), custom emojis (<:name:123>, <a:name:123>), URLs, numbers, and code formatting exactly.
- Output ONLY the Vietnamese translation. Do NOT include the original Korean text, quotes, or explanations.`;

const VI_TO_KO_INSTRUCTION = `You are a polite, professional real-time Vietnamese-to-Korean translator for a gaming/grinding Discord team.
Translate ONLY the target Vietnamese message (including unaccented Vietnamese or casual chat abbreviations like "ko", "dc", "ok", "nha", "ạ", "acc", "dis") into natural, polite conversational Korean (해요체).
- ALWAYS use polite, courteous Korean (해요체: ~요, ~주세요, ~드릴게요, ~할게요, 죄송합니다, 감사합니다). NEVER use rude or casual plain speech (반말), even if the Vietnamese input is very short or informal.
- ${GAMING_GLOSSARY}
- Example input: "cày acc xong rồi nha" -> Example output: "계정 육성 다 끝났어요!"
- Example input: "đang bị dis game, đợi xíu tôi log lại nhé" -> Example output: "지금 게임이 튕겨서 잠시만 기다려 주시면 다시 접속할게요."
- Example input: "ok ban oi doi xiu nha" -> Example output: "네, 잠시만 기다려 주세요!"
- Example input: "Hôm nay 8 giờ tối vào party đánh boss nhé mọi người" -> Example output: "오늘 저녁 8시에 다 같이 보스 파티 들어가요!"
- If previous chat context is provided, use it ONLY to resolve implied subjects and tone. NEVER repeat or translate the context lines.
- Preserve Discord mentions (<@123>, <#123>, <@&123>), custom emojis (<:name:123>, <a:name:123>), URLs, numbers, and code formatting exactly.
- Output ONLY the Korean translation in Hangul. Do NOT output Vietnamese, quotes, or explanations.
- If the target message is clearly pure English unrelated to Vietnamese (e.g., "hello", "good morning", "nice try", "thank you", "deploy done", "gg") with no Vietnamese words, output exactly: SKIP`;

const MIXED_INSTRUCTION = `You are a polite, professional real-time bilingual Korean-Vietnamese translator for a gaming/grinding Discord team.
The target message mixes both Korean and Vietnamese. Translate the full meaning politely and naturally into BOTH languages on two separate lines so both Korean and Vietnamese readers understand everything:
🇻🇳 <full polite natural Vietnamese meaning>
🇰🇷 <full polite natural Korean meaning (해요체)>
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
