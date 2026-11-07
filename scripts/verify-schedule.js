const s = require('../.tmp/schedule.js');

const semester = {
  name: 'test',
  startDate: '2026-09-07', // 周一
  totalWeeks: 20,
  periods: [
    { period: 1, start: '08:00', end: '08:45' },
    { period: 2, start: '08:55', end: '09:40' },
    { period: 3, start: '10:00', end: '10:45' },
  ],
};

let pass = 0;
let fail = 0;
function eq(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    pass += 1;
    console.log(`  ok   ${label}`);
  } else {
    fail += 1;
    console.log(`  FAIL ${label}\n       got ${a}\n       exp ${e}`);
  }
}

const d = (y, m, day, h = 0, mi = 0) => new Date(y, m - 1, day, h, mi, 0, 0);

console.log('— 周次计算 —');
eq(s.weekOfDate(d(2026, 9, 7), semester), 1, '开学当天是第 1 周');
eq(s.weekOfDate(d(2026, 9, 13), semester), 1, '第 1 周周日仍是第 1 周');
eq(s.weekOfDate(d(2026, 9, 14), semester), 2, '下一个周一是第 2 周');
eq(s.weekOfDate(d(2026, 9, 6), semester), 0, '开学前一天是第 0 周');
eq(s.weekOfDate(d(2026, 12, 3), semester), 13, '12/3 是第 13 周');

console.log('— 日期反查 —');
eq(s.toISODate(s.datesOfWeek(1, semester)[0]), '2026-09-07', '第 1 周第一天');
eq(s.toISODate(s.datesOfWeek(1, semester)[6]), '2026-09-13', '第 1 周第七天');
eq(s.toISODate(s.dateOf(2, 3, semester)), '2026-09-16', '第 2 周周三 = 9/16');
eq(s.toISODate(s.dateOf(1, 7, semester)), '2026-09-13', '第 1 周周日 = 9/13');

console.log('— 单双周展开 —');
eq(s.expandWeeks(1, 16, 'all').length, 16, '1-16 全周 16 次');
eq(s.expandWeeks(1, 16, 'odd'), [1,3,5,7,9,11,13,15], '1-16 单周');
eq(s.expandWeeks(2, 16, 'even'), [2,4,6,8,10,12,14,16], '2-16 双周');
eq(s.expandWeeks(3, 9, 'odd'), [3,5,7,9], '3-9 单周');
eq(s.expandWeeks(9, 3, 'all'), [3,4,5,6,7,8,9], '起止写反也能纠正');

console.log('— 周次描述回环 —');
// 关键性质：表单值 → 周次 → 再展开，行为必须完全一致。
// （1-16 单周 与 1-15 单周 其实等价，所以不追究数字完全相同。）
for (const [a, b, p] of [[1,16,'all'],[1,16,'odd'],[2,16,'even'],[3,9,'odd'],[1,2,'odd']]) {
  const weeks = s.expandWeeks(a, b, p);
  const desc = s.describeWeeks(weeks);
  const again = s.expandWeeks(desc.startWeek, desc.endWeek, desc.parity);
  eq(again, weeks, `回环行为一致 ${a}-${b} ${p}`);
}
eq(
  s.describeWeeks(s.expandWeeks(1, 16, 'odd')),
  { startWeek: 1, endWeek: 15, parity: 'odd' },
  '1-16 单周 归一化为 1-15 单周（末周取真实上课周）'
);

console.log('— 某天课程 —');
const courses = [
  { id:'1', name:'A', weekday:1, periodStart:1, periodEnd:2, weeks:[1,3], color:'#fff' },
  { id:'2', name:'B', weekday:1, periodStart:3, periodEnd:4, weeks:[2,4], color:'#fff' },
  { id:'3', name:'C', weekday:3, periodStart:1, periodEnd:1, weeks:[1], color:'#fff' },
];
eq(s.coursesInWeek(courses, 1).map(c=>c.id), ['1','3'], '第 1 周的课');
eq(s.coursesOnDay(courses, 1, 1).map(c=>c.id), ['1'], '第 1 周周一');
eq(s.coursesOnDay(courses, 2, 1).map(c=>c.id), ['2'], '第 2 周周一');
eq(s.coursesOnDay(courses, 5, 1).map(c=>c.id), [], '第 5 周周一没课');

console.log('— 提醒排期 —');
const one = [{ id:'x', name:'高数', weekday:1, periodStart:1, periodEnd:2, weeks:[1], color:'#fff' }];
const upcoming = s.upcomingSessions(one, semester, d(2026, 9, 7, 7, 0), 7);
eq(upcoming.length, 1, '开学当天 7:00 往前看 7 天，一次课');
eq(s.toISODate(upcoming[0].startsAt), '2026-09-07', '课次日期');
eq(s.formatTime(upcoming[0].startsAt), '08:00', '开始时间取作息表');
eq(s.formatTime(upcoming[0].endsAt), '09:40', '结束时间取结束节');
eq(
  s.upcomingSessions(one, semester, d(2026, 9, 7, 9, 0), 7).length,
  1,
  '正在上课的课次仍算没上完'
);
eq(
  s.upcomingSessions(one, semester, d(2026, 9, 7, 10, 0), 7).length,
  0,
  '已经下课的课次不再排'
);
eq(
  s.upcomingSessions(one, semester, d(2026, 9, 8, 9, 0), 7).length,
  0,
  '本周课已过、下周没课，则不排'
);

console.log('— 跨周扫描 —');
const weekly = [{ id:'y', name:'英语', weekday:3, periodStart:1, periodEnd:2, weeks:[1,2], color:'#fff' }];
eq(s.upcomingSessions(weekly, semester, d(2026, 9, 7, 0, 0), 10).length, 2, '10 天内跨两周，两次课');

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
