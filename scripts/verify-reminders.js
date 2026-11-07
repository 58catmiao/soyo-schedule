/* 提醒排期的纯逻辑自测（不需要 Expo / 不需要真机） */

const assert = require('assert');
const { buildReminders, reminderSignature, describeLead, clampLead, LEAD_CHOICES, MAX_LEAD_MINUTES, DEFAULT_REMINDER_OPTIONS } = require('../.tmp/reminders');
const { expandWeeks } = require('../.tmp/schedule');

let passed = 0;
let failed = 0;
function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok   ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`  FAIL ${name}`);
    console.log(`       ${error.message}`);
  }
}

const semester = {
  name: '测试学期',
  startDate: '2026-09-07',
  totalWeeks: 20,
  periods: [
    { period: 1, start: '08:00', end: '08:45' },
    { period: 2, start: '08:55', end: '09:40' },
    { period: 3, start: '10:00', end: '10:45' },
  ],
};

const mondayCourse = {
  id: 'c1',
  name: '高等数学 A',
  location: '教一 201',
  weekday: 1,
  periodStart: 1,
  periodEnd: 2,
  weeks: expandWeeks(1, 20, 'all'),
  color: '#DCE9FF',
};

const options = { ...DEFAULT_REMINDER_OPTIONS, leadMinutes: 15, days: 7, maxCount: 60 };
// 2026-11-06 是周五，下一节课是 11-09（周一）第 1 节
const friday = new Date(2026, 10, 6, 10, 0, 0);

console.log('describeLead');
check('0 分钟 = 上课时', () => assert.strictEqual(describeLead(0), '上课时'));
check('15 分钟', () => assert.strictEqual(describeLead(15), '提前 15 分钟'));
check('60 分钟 = 1 小时', () => assert.strictEqual(describeLead(60), '提前 1 小时'));
check('120 分钟 = 2 小时', () => assert.strictEqual(describeLead(120), '提前 2 小时'));
check('90 分钟保留分钟写法', () => assert.strictEqual(describeLead(90), '提前 90 分钟'));

console.log('buildReminders');
const plan = buildReminders([mondayCourse], semester, friday, options);

check('至少排出一条', () => assert.ok(plan.length > 0));
check('第一条就是下一个周一 08:00 那节', () => {
  const first = plan[0];
  assert.strictEqual(first.courseId, 'c1');
  assert.strictEqual(first.startsAt.getDay(), 1);
  assert.strictEqual(first.startsAt.getHours(), 8);
  assert.strictEqual(first.startsAt.getMinutes(), 0);
  assert.strictEqual(first.startsAt.getDate(), 9);
});
check('提前 15 分钟 → 07:45 响', () => {
  const first = plan[0];
  assert.strictEqual(first.fireAt.getTime(), first.startsAt.getTime() - 15 * 60_000);
  assert.strictEqual(first.fireAt.getHours(), 7);
  assert.strictEqual(first.fireAt.getMinutes(), 45);
});
check('标题带提前量和课名', () => {
  assert.strictEqual(plan[0].title, '提前 15 分钟 · 高等数学 A');
});
check('正文带时间和地点', () => {
  assert.strictEqual(plan[0].body, '08:00 · 教一 201');
});
check('全部排在 now 之后', () => {
  for (const r of plan) assert.ok(r.fireAt.getTime() > friday.getTime());
});
check('按时间升序', () => {
  for (let i = 1; i < plan.length; i += 1) {
    assert.ok(plan[i].fireAt.getTime() >= plan[i - 1].fireAt.getTime());
  }
});
check('只排 7 天内的课（周五往后只有一个周一）', () => {
  assert.strictEqual(plan.length, 1);
});
check('窗口放大到 10 天就该有 2 条', () => {
  const wider = buildReminders([mondayCourse], semester, friday, { ...options, days: 10 });
  assert.strictEqual(wider.length, 2);
});

console.log('提前量改变');
const plan30 = buildReminders([mondayCourse], semester, friday, { ...options, leadMinutes: 30 });
check('提前 30 分钟的触发时刻比 15 分钟早 15 分钟', () => {
  assert.strictEqual(plan[0].fireAt.getTime() - plan30[0].fireAt.getTime(), 15 * 60_000);
});

console.log('自定义提前量');
check('0 分钟就是上课那一刻', () => {
  const zero = buildReminders([mondayCourse], semester, friday, { ...options, leadMinutes: 0 });
  assert.strictEqual(zero[0].fireAt.getTime(), zero[0].startsAt.getTime());
});
check('自定义 7 分钟也认', () => {
  const odd = buildReminders([mondayCourse], semester, friday, { ...options, leadMinutes: 7 });
  assert.strictEqual(odd[0].fireAt.getTime() - plan[0].fireAt.getTime(), 8 * 60_000);
});
check('负数被当成 0（不提前，也不报错）', () => {
  const neg = buildReminders([mondayCourse], semester, friday, { ...options, leadMinutes: -30 });
  assert.strictEqual(neg[0].fireAt.getTime(), neg[0].startsAt.getTime());
});
check('clampLead 夹紧范围', () => {
  assert.strictEqual(clampLead(-5), 0);
  assert.strictEqual(clampLead(999), MAX_LEAD_MINUTES);
  assert.strictEqual(clampLead(Number.NaN), DEFAULT_REMINDER_OPTIONS.leadMinutes);
  assert.strictEqual(clampLead(12.6), 13);
});

console.log('过期不补发');
check('提醒点已过的不补', () => {
  // 周一 08:05 打开 App，第 1 节课 08:00 已经开始，提醒点 07:45 早过了
  const monday = new Date(2026, 10, 9, 8, 5, 0);
  const sameDay = buildReminders([mondayCourse], semester, monday, options);
  for (const r of sameDay) {
    assert.ok(r.fireAt.getTime() > monday.getTime());
    assert.ok(r.startsAt.getDate() !== 9, '当天那节课不该再排');
  }
});

console.log('上限');
check('maxCount 截断', () => {
  const capped = buildReminders([mondayCourse], semester, friday, { ...options, maxCount: 1 });
  assert.strictEqual(capped.length, 1);
});

console.log('指纹');
check('同内容指纹相同', () => {
  const again = buildReminders([mondayCourse], semester, friday, options);
  assert.strictEqual(reminderSignature(plan), reminderSignature(again));
});
check('内容变了指纹就变', () => {
  const other = buildReminders([mondayCourse], semester, friday, { ...options, leadMinutes: 30 });
  assert.notStrictEqual(reminderSignature(plan), reminderSignature(other));
});

console.log('');
console.log(`${passed} 通过 / ${failed} 失败`);
process.exit(failed === 0 ? 0 : 1);
