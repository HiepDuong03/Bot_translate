import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { KeyPoolService } from '../src/services/keyPoolService.js';
import { ChannelService } from '../src/services/channelService.js';
import { ContextService } from '../src/services/contextService.js';
import { MessageBatcher } from '../src/services/messageBatcher.js';
import {
  buildTranslationPrompt,
  createTranslator,
  shouldSkipTranslation,
  splitForDiscord,
  translateText,
} from '../src/services/geminiService.js';
import { createMessageHandler } from '../src/events/messageCreate.js';
import { config } from '../src/config/env.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runTests() {
  console.log('=== 1. Testing shouldSkipTranslation & splitForDiscord ===');
  assert.equal(shouldSkipTranslation(''), true);
  assert.equal(shouldSkipTranslation('   '), true);
  assert.equal(shouldSkipTranslation('https://discord.com/test'), true);
  assert.equal(shouldSkipTranslation('<@123456789> <:pepe:99999>'), true);
  assert.equal(shouldSkipTranslation('123456 !!! ???'), true);
  assert.equal(shouldSkipTranslation('😂😂👍'), true);
  assert.equal(shouldSkipTranslation('가능한사람있을까요'), false);
  assert.equal(shouldSkipTranslation('Có ai làm được không ạ?'), false);
  assert.equal(shouldSkipTranslation('ok nha ban'), false);

  const longText = `${'a'.repeat(1950)} ${'b'.repeat(200)}`;
  const chunks = splitForDiscord(longText, 2000);
  assert.equal(chunks.length, 2);
  assert.ok(chunks.every((c) => c.length <= 2000));
  console.log('PASS: shouldSkipTranslation & splitForDiscord');

  console.log('\n=== 2. Testing ContextService ring buffer & TTL ===');
  const ctx = new ContextService({ maxMessages: 3, ttlMs: 1000 });
  const t0 = 10_000;
  ctx.addMessage('c1', { authorName: 'A', text: 'msg1', timestamp: t0 });
  ctx.addMessage('c1', { authorName: 'B', text: 'msg2', timestamp: t0 + 100 });
  ctx.addMessage('c1', { authorName: 'A', text: 'msg3', timestamp: t0 + 200 });
  ctx.addMessage('c1', { authorName: 'B', text: 'msg4', timestamp: t0 + 300 });
  const recent = ctx.getContext('c1', t0 + 400);
  assert.deepEqual(recent.map((m) => m.text), ['msg2', 'msg3', 'msg4']);
  assert.equal(ctx.getContext('c1', t0 + 2000).length, 0);

  const formatted = buildTranslationPrompt('8시에 봐요', recent);
  assert.match(formatted, /Previous chat context/);
  assert.match(formatted, /- B: msg4/);
  assert.match(formatted, /Target message to translate:\n8시에 봐요/);
  console.log('PASS: ContextService');

  console.log('\n=== 3. Testing MessageBatcher debounce & grouping ===');
  const flushedBatches = [];
  const batcher = new MessageBatcher({
    debounceMs: 60,
    onFlush: (items) => flushedBatches.push(items),
  });
  batcher.enqueue('c1:u1', { content: 'Alo' }, 3);
  batcher.enqueue('c1:u1', { content: 'tối nay họp nhé' }, 15);
  batcher.enqueue('c1:u2', { content: '네 알겠습니다' }, 7);
  await sleep(120);
  batcher.dispose();

  assert.equal(flushedBatches.length, 2);
  assert.deepEqual(flushedBatches[0].map((i) => i.content), ['Alo', 'tối nay họp nhé']);
  assert.deepEqual(flushedBatches[1].map((i) => i.content), ['네 알겠습니다']);
  console.log('PASS: MessageBatcher');

  console.log('\n=== 4. Testing ChannelService (autoAll + Turso SQLite persistence) ===');
  const tempDbPath = path.join(os.tmpdir(), `translate-test-${Date.now()}.db`);
  const tursoSvc1 = new ChannelService({
    autoTranslateAll: true,
    storageFile: null,
    tursoUrl: `file:${tempDbPath}`,
  });
  await tursoSvc1.init();
  assert.equal(tursoSvc1.isEnabled('chan-99'), true);
  await tursoSvc1.disable('chan-99');
  assert.equal(tursoSvc1.isEnabled('chan-99'), false);
  tursoSvc1.close();

  const tursoSvc2 = new ChannelService({
    autoTranslateAll: true,
    storageFile: null,
    tursoUrl: `file:${tempDbPath}`,
  });
  await tursoSvc2.init();
  assert.equal(tursoSvc2.isEnabled('chan-99'), false);
  await tursoSvc2.enable('chan-99');
  assert.equal(tursoSvc2.isEnabled('chan-99'), true);
  tursoSvc2.close();
  await sleep(50);
  try { fs.rmSync(tempDbPath, { force: true }); } catch {}
  console.log('PASS: ChannelService');

  console.log('\n=== 5. Testing KeyPoolService failover & Model fallback ===');
  const mockPool = new KeyPoolService(
    ['key-1-aaaa', 'key-2-bbbb', 'key-3-cccc'],
    (key) => ({ key })
  );

  let callCount = 0;
  const keyResult = await mockPool.executeWithFailover(async (client) => {
    callCount += 1;
    if (client.key === 'key-1-aaaa') {
      const err = new Error('429 RESOURCE_EXHAUSTED');
      err.status = 429;
      throw err;
    }
    return `Success from ${client.key}`;
  });
  assert.equal(callCount, 2);
  assert.equal(keyResult, 'Success from key-2-bbbb');
  assert.match(mockPool.getStatus()[0].status, /^Cooldown/);

  const triedModels = [];
  const fallbackTranslator = createTranslator({
    candidateModels: ['primary-bad-model', 'backup-good-model'],
    executeWithPool: async (taskFn) => {
      const fakeAi = {
        models: {
          generateContent: async ({ model }) => {
            triedModels.push(model);
            if (model === 'primary-bad-model') {
              const err = new Error('503 UNAVAILABLE');
              err.status = 503;
              throw err;
            }
            return { text: 'Translated cleanly' };
          },
        },
      };
      return taskFn(fakeAi);
    },
  });
  const fbRes = await fallbackTranslator('Xin chào');
  assert.deepEqual(triedModels, ['primary-bad-model', 'backup-good-model']);
  assert.equal(fbRes?.model, 'backup-good-model');
  console.log('PASS: KeyPoolService & Model fallback');

  console.log('\n=== 6. Testing handleMessageCreate (batch, chunking, quota alert cooldown) ===');
  const sentMessages = [];
  const mockChannelSvc = { isEnabled: () => true };
  const mockContextSvc = new ContextService({ maxMessages: 4, ttlMs: 60_000 });
  let failWithQuota = false;

  const { handler, dispose } = createMessageHandler({
    channelSvc: mockChannelSvc,
    contextSvc: mockContextSvc,
    batchDebounceMs: 30,
    replyToMessage: false,
    quotaAlertCooldownMs: 60_000,
    translateFn: async (text) => {
      if (failWithQuota) {
        const err = new Error('429 RESOURCE_EXHAUSTED');
        err.status = 429;
        throw err;
      }
      if (text.includes('long')) {
        return { text: `${'x'.repeat(1900)} ${'y'.repeat(300)}`, model: 'mock' };
      }
      return { text: `KO:${text}`, model: 'mock' };
    },
  });

  const mockChannel = {
    id: 'ch-1',
    name: 'general',
    send: async (payload) => sentMessages.push(payload),
  };

  // Bot & webhook messages must be ignored
  await handler({ author: { id: 'b1', bot: true }, guild: {}, channelId: 'ch-1', content: 'hi', channel: mockChannel });
  await handler({ author: { id: 'u1', bot: false }, webhookId: 'wh1', guild: {}, channelId: 'ch-1', content: 'hi', channel: mockChannel });
  assert.equal(sentMessages.length, 0);

  // Consecutive messages from same user merge into 1 call
  await handler({ author: { id: 'u1', bot: false, username: 'Hiep' }, guild: {}, channelId: 'ch-1', content: 'Alo', channel: mockChannel });
  await handler({ author: { id: 'u1', bot: false, username: 'Hiep' }, guild: {}, channelId: 'ch-1', content: 'nhanh nhé', channel: mockChannel });
  await sleep(80);
  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].content, 'KO:Alo\nnhanh nhé');
  assert.deepEqual(sentMessages[0].allowedMentions, { parse: [] });

  // Long output splits into 2 Discord messages
  await handler({ author: { id: 'u2', bot: false, username: 'Kim' }, guild: {}, channelId: 'ch-1', content: 'long text', channel: mockChannel });
  await sleep(80);
  assert.equal(sentMessages.length, 3);

  // Quota exhaustion sends alert once within cooldown
  failWithQuota = true;
  await handler({ author: { id: 'u3', bot: false, username: 'Lee' }, guild: {}, channelId: 'ch-1', content: '테스트', channel: mockChannel });
  await sleep(80);
  await handler({ author: { id: 'u3', bot: false, username: 'Lee' }, guild: {}, channelId: 'ch-1', content: '테스트2', channel: mockChannel });
  await sleep(80);
  assert.equal(sentMessages.length, 4);
  assert.match(sentMessages[3].content, /API Key/);

  // Partial message fetch (VoiceChannel / uncached channel)
  failWithQuota = false;
  let fetchedPartial = false;
  await handler({
    partial: true,
    fetch: async () => { fetchedPartial = true; },
    author: { id: 'u4', bot: false, username: 'Park' },
    guild: {},
    channelId: 'ch-1',
    content: '잠시만요',
    channel: mockChannel,
  });
  await sleep(80);
  assert.equal(fetchedPartial, true);
  assert.equal(sentMessages.length, 5);
  dispose();
  console.log('PASS: handleMessageCreate');

  console.log('\n=== 7. Live Gemini Translation Test (optional if .env has keys) ===');
  if (config.geminiApiKeys.length === 0) {
    console.log('SKIPPED: No GEMINI_API_KEYS in .env (live API test skipped).');
    return;
  }

  const liveSamples = [
    { input: '가능한사람있을까요', context: [], expectHangul: false },
    {
      input: '지금 점검 중이라서 잠깐 쉴게요 ㅋㅋ',
      context: [{ authorName: 'Hiep', text: '이 계정 오늘 8시간 채워야 해요' }],
      expectHangul: false,
    },
    {
      input: 'đang bị dis game, đợi xíu mình log acc lại nhé',
      context: [{ authorName: '밥밥', text: '지금 사냥 시작했어요?' }],
      expectHangul: true,
    },
    {
      input: 'cày acc xong rồi nha',
      context: [],
      expectHangul: true,
    },
    {
      input: '오늘 8시 vào party đánh boss nhé mọi người',
      context: [],
      expectMixed: true,
    },
  ];

  const hangulRegex = /[\uAC00-\uD7AF]/;
  for (const sample of liveSamples) {
    const translated = await translateText(sample.input, sample.context);
    console.log(`Input : ${sample.input}`);
    console.log(`Output (${translated?.model}):\n${translated?.text}\n`);
    assert.ok(translated && translated.text.length > 0, 'Translation should not be empty');
    if (sample.expectMixed) {
      assert.ok(hangulRegex.test(translated.text), 'Mixed translation should include Korean');
    } else {
      assert.equal(
        hangulRegex.test(translated.text),
        sample.expectHangul,
        `Expected ${sample.expectHangul ? 'Korean Hangul' : 'Vietnamese'} output, got: ${translated.text}`
      );
    }
  }
  console.log('PASS: Live Gemini translation');
}

runTests().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
