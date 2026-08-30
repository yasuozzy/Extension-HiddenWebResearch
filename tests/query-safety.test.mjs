import assert from 'node:assert/strict';

import {
    buildSafePurposeFallbackQuery,
    buildSafeFallbackQuery,
    compactSearchRequest,
    containsSensitiveQueryMaterial,
    extractCleanUserRequest,
    validatePreparedSearchQuery,
    validateSearchQueryCandidate,
} from '../query-safety.js';

const longRequest = `${'A'.repeat(5000)} Please search the web for the latest stable SDK version.`;
const compacted = compactSearchRequest(longRequest, 4000);
assert.equal(compacted.length, 4000);
assert.ok(compacted.startsWith('A'.repeat(100)));
assert.match(compacted, /\[middle omitted\]/u);
assert.match(compacted, /Please search the web for the latest stable SDK version\.$/u);

assert.equal(compactSearchRequest('  short\nrequest  ', 4000), 'short request');
assert.equal(buildSafeFallbackQuery(longRequest, 220), 'the latest stable SDK version');

assert.equal(
    validateSearchQueryCandidate('以下是用户的本轮输入：东京明天天气', {
        userRequest: '东京明天天气',
    }).reason,
    'wrapped_user_request',
);
assert.deepEqual(
    validateSearchQueryCandidate('搜索查询：东京明天天气', { userRequest: '东京明天天气' }),
    { valid: true, query: '东京明天天气', reason: 'wrapper_removed' },
);

const wrappedRoleplay = '以下是用户的本轮输入：在房间里陪已经睡着的艾莉丝，先观察她是否醒来，然后继续描述房间里的灯光、衣服、动作、表情以及接下来发生的全部对话和剧情。';
assert.equal(
    validateSearchQueryCandidate(wrappedRoleplay, { userRequest: wrappedRoleplay }).reason,
    'wrapped_user_request',
);
assert.equal(buildSafeFallbackQuery(wrappedRoleplay, 220), '');

const wrappedCompactNarrative = '以下是用户的本轮输入：抱着艾莉丝去床上睡觉去，然后第二天醒来继续描写房间里的对话和动作，并保持角色设定与剧情连续性';
assert.equal(
    validateSearchQueryCandidate(wrappedCompactNarrative, { userRequest: wrappedCompactNarrative }).reason,
    'wrapped_user_request',
);
assert.equal(buildSafeFallbackQuery(wrappedCompactNarrative, 220), '');

const copiedNarrative = '在房间里陪已经睡着的艾莉丝，先观察她是否醒来，然后继续描述房间里的灯光、衣服、动作、表情以及接下来发生的全部对话和剧情，并保持此前约定的叙述方式。';
assert.ok(
    ['narrative_text', 'copied_user_request'].includes(
        validateSearchQueryCandidate(copiedNarrative, { userRequest: copiedNarrative }).reason,
    ),
);
assert.equal(buildSafeFallbackQuery(copiedNarrative, 220), '');
const copiedLongSentence = 'Alice official character profile appearance outfit personality sleeping habit relationship story';
assert.equal(
    validateSearchQueryCandidate(copiedLongSentence, { userRequest: copiedLongSentence }).reason,
    'copied_user_request',
);
assert.deepEqual(
    validateSearchQueryCandidate('艾莉丝 官方角色设定 睡眠习惯', { userRequest: copiedNarrative }),
    { valid: true, query: '艾莉丝 官方角色设定 睡眠习惯', reason: 'ok' },
);
assert.equal(
    buildSafePurposeFallbackQuery('查证：艾莉丝 官方角色设定 睡眠习惯', {
        userRequest: copiedNarrative,
    }),
    '艾莉丝 官方角色设定 睡眠习惯',
);
assert.equal(buildSafePurposeFallbackQuery('核实用户请求', { userRequest: copiedNarrative }), '');
assert.equal(buildSafePurposeFallbackQuery('primary', { userRequest: copiedNarrative }), '');
assert.equal(buildSafePurposeFallbackQuery(copiedNarrative, { userRequest: copiedNarrative }), '');

assert.equal(
    buildSafeFallbackQuery(`${'剧情描述 '.repeat(80)}请搜索：艾莉丝 官方角色设定`, 220),
    '艾莉丝 官方角色设定',
);
assert.equal(buildSafeFallbackQuery('以下是用户的本轮输入：东京明天天气', 220), '');

assert.deepEqual(
    validatePreparedSearchQuery('东京新闻, 要闻, reference date 2026-08-08 browser timezone Asia/Shanghai'),
    {
        valid: true,
        query: '东京新闻, 要闻, reference date 2026-08-08 browser timezone Asia/Shanghai',
        reason: 'ok',
    },
);
assert.equal(
    validatePreparedSearchQuery(`api_key=${'a'.repeat(32)} target date 2026-08-08`).reason,
    'sensitive_material',
);
assert.equal(validatePreparedSearchQuery('x'.repeat(121)).reason, 'too_long');
assert.equal(validatePreparedSearchQuery('   ').reason, 'empty');

const sensitiveQueries = [
    'search sk-ant-api03-abcdefghijklmnopqrstuvwxyz123456',
    'Authorization: Bearer abcdefghijklmnopqrstuvwxyz.123456',
    'Authorization: Bearer abcdefghijklmnopqrstuvwxyz',
    'Authorization: Basic dXNlcjpwYXNzd29yZA==',
    'Authorization: Basic dXNlcjpwYXNz',
    'Authorization: Basic dTpw',
    'api_key=abcdefghijklmnopqrstuvwxyz123456',
    'https://example.test/?token=abcdefghijklmnopqrstuvwxyz',
    'AIzaSyDUMMYKEY1234567890123456789012',
    'ghp_abcdefghijklmnopqrstuvwxyz123456',
    ['xoxb', '123456789012', 'abcdefghijklmnopqrstuvwxyz'].join('-'),
    'eyJabcdefghijk.eyJabcdefghijkl.abcdefghijklmnop',
    '-----BEGIN PRIVATE KEY-----',
];
for (const query of sensitiveQueries) {
    assert.equal(containsSensitiveQueryMaterial(query), true, query);
    assert.equal(buildSafeFallbackQuery(query, 220), '', query);
}

for (const query of [
    'Claude API key security best practices',
    'site:ai.google.dev Gemini API documentation',
    'Tokyo weather 2026-07-31',
    'Authorization: Bearer header syntax',
    'How to set Authorization: Bearer in fetch',
    'Authorization: Bearer authentication header syntax',
    'Authorization: Bearer YOUR_TOKEN_HERE',
    'Authorization: Bearer YOUR_ACCESS_TOKEN_HERE',
    'Authorization: Basic BASE64_CREDENTIALS',
    'Authorization: Basic syntax',
    'Authorization: Basic help',
    'Authorization: Basic dGVzdA==',
    'api_key=YOUR_KEY example',
    'api_key=<YOUR_API_KEY_HERE> example',
    'password: example configuration',
    'https://example.test/?token=placeholder',
]) {
    assert.equal(containsSensitiveQueryMaterial(query), false, query);
}

// Tests for extractCleanUserRequest (stripping 剧情推进, <act>, thinking, etc.)
const userPrompt = '(画面跳转到二十分钟后，蒋帅、爱音与灯三人已经推开RiNG的大门，恰好看到长崎素世正从另一侧街道款款走来。) (朝素世那边招手)hi 这里这里 (走向前打字翻译给她看)素世同学多久到的我们才从江户川乐器店过来，我们去饮品区坐着聊吧，小笨嘴跟上，素世同学也刚放学吗';
const injectedActMessage = `${userPrompt}

剧情推进
以上是用户的本轮输入，以下act是角色行动和台词：
<act>
### 千早爱音
now: 单手扶着肩膀上的吉他背带，站在RiNG门边的台阶上。
beat: 朝走过来的素世用力挥了挥手。「そよちゃん！ここだよー！」转过身把背后黑色琴包往前往侧了侧。「看，我把吉他买下来了哦，超好看的薄荷绿！」
initiative: 抬手推开RiNG的玻璃门，侧身示意大家先进去。「外面风变凉了，我们快点进去找位置坐下吧。」
then: 走进店里走向靠窗的空桌子。

### 高松灯
now: 双手抱着喝空的麦茶瓶，站在门旁看手机屏幕。
beat: 听到声音后抬头，手指下意识收紧了瓶身。「……そよちゃん。」听到那个称呼后耳根微热，默默挪动步子跟在旁边。
initiative: 无
then: 跟在爱音身后走进RiNG大门。

### 长崎素世
now: 提着制服包从街角走上缓坡，在RiNG门前的路灯下停住脚步。
beat: 走上前停在几步外，目光扫过亮起的手机屏幕，神色温和。「我也是刚到没几分钟呢。月之森那边放学稍微早一点，坐电车过来很顺路。」「大家看起来很有精神呢，买到心仪的乐器了吗？」
initiative: 无
then: 迈步跟上爱音和灯，一起走进RiNG的室内。
</act>`;

assert.equal(extractCleanUserRequest(injectedActMessage), userPrompt);

const thoughtAndPlotMessage = `查一下明天上海天气
<thought>
思考过程：需要查询上海的天气预报
</thought>
【剧情推进】
<plot>
明天剧情继续发展
</plot>`;
assert.equal(extractCleanUserRequest(thoughtAndPlotMessage), '查一下明天上海天气');

const fencedCodeActMessage = `请问江户川乐器店营业时间
\`\`\`act
### 角色行动
now: 走向乐器店
\`\`\``;
assert.equal(extractCleanUserRequest(fencedCodeActMessage), '请问江户川乐器店营业时间');

console.log('Search-query safety and head-tail compaction: all assertions passed');
