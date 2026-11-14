import assert from 'node:assert/strict';
import { KeyPoolService } from '../src/services/keyPoolService.js';
import { ChannelService } from '../src/services/channelService.js';
import { shouldSkipTranslation, translateText } from '../src/services/geminiService.js';
import { config } from '../src/config/env.js';

async function runTests() {
  console.log('=== 1. Testing shouldSkipTranslation ===');
  assert.equal(shouldSkipTranslation(''), true);
  assert.equal(shouldSkipTranslation('   '), true);
  assert.equal(shouldSkipTranslation('https://discord.com/test'), true);
  assert.equal(shouldSkipTranslation('<@123456789> <:pepe:99999>'), true);
  assert.equal(shouldSkipTranslation('123456 !!! ???'), true);
  assert.equal(shouldSkipTranslation('😂😂👍'), true);
  assert.equal(shouldSkipTranslation('가능한사람있을까요'), false);
  assert.equal(shouldSkipTranslation('Có ai làm được không ạ?'), false);
  assert.equal(shouldSkipTranslation('ok nha ban'), false);
  console.log('PASS: shouldSkipTranslation');

  console.log('\n=== 2. Testing ChannelService modes ===');
  const autoAllSvc = new ChannelService({ autoTranslateAll: true, storageFile: null });
  assert.equal(autoAllSvc.isEnabled('chan-1'), true);
  assert.equal(autoAllSvc.disable('chan-1'), true);
  assert.equal(autoAllSvc.isEnabled('chan-1'), false);
  assert.equal(autoAllSvc.enable('chan-1'), true);
  assert.equal(autoAllSvc.isEnabled('chan-1'), true);

  const whitelistSvc = new ChannelService({ autoTranslateAll: false, initialEnabled: ['chan-2'], storageFile: null });
  assert.equal(whitelistSvc.isEnabled('chan-1'), false);
  assert.equal(whitelistSvc.isEnabled('chan-2'), true);
  console.log('PASS: ChannelService');

  console.log('\n=== 3. Testing KeyPoolService failover on 429 ===');
  const mockPool = new KeyPoolService(
    ['key-1-aaaa', 'key-2-bbbb', 'key-3-cccc'],
    (key) => ({ key })
  );

  let callCount = 0;
  const result = await mockPool.executeWithFailover(async (client) => {
    callCount += 1;
    if (client.key === 'key-1-aaaa') {
      const err = new Error('429 RESOURCE_EXHAUSTED');
      err.status = 429;
      throw err;
    }
    return `Success from ${client.key}`;
  });

  assert.equal(callCount, 2);
  assert.equal(result, 'Success from key-2-bbbb');

  const statuses = mockPool.getStatus();
  assert.match(statuses[0].status, /^Cooldown/);
  assert.equal(statuses[1].status, 'Ready');
  assert.equal(statuses[1].successCount, 1);
  console.log('PASS: KeyPoolService automatic failover');

  console.log('\n=== 4. Live Gemini Translation Test (optional if .env has keys) ===');
  if (config.geminiApiKeys.length === 0) {
    console.log('SKIPPED: No GEMINI_API_KEYS in .env (live API test skipped).');
    return;
  }

  const samples = [
    { input: '가능한사람있을까요', expectHangul: false },
    { input: '아 진짜요? 넘 웃기네 ㅋㅋㅋ 낼 봐요', expectHangul: false },
    { input: 'Hôm nay 8 giờ tối họp nhé mọi người, nhớ vào đúng giờ ạ', expectHangul: true },
    { input: 'ok ban oi doi xiu nha', expectHangul: true },
  ];

  const hangulRegex = /[\uAC00-\uD7AF]/;
  for (const { input, expectHangul } of samples) {
    const translated = await translateText(input);
    console.log(`Input : ${input}`);
    console.log(`Output (${translated?.model}): ${translated?.text}\n`);
    assert.ok(translated && translated.text.length > 0, 'Translation should not be empty');
    assert.equal(
      hangulRegex.test(translated.text),
      expectHangul,
      `Expected ${expectHangul ? 'Korean Hangul' : 'Vietnamese'} output, got: ${translated.text}`
    );
  }
  console.log('PASS: Live Gemini translation');
}

runTests().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
