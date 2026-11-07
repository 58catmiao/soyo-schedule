/**
 * 桌面小组件「今天显示什么」的自测（纯逻辑，不碰原生模块）。
 *
 * 跑法：
 *   npx tsc src/widget/select.ts src/schedule.ts src/types.ts src/seed.ts \
 *     --ignoreConfig --outDir .tmp --rootDir src --module commonjs \
 *     --target es2020 --skipLibCheck --esModuleInterop
 *   node scripts/verify-widget.js
 */
const { selectToday } = require('../.tmp/widget/select.js');
const { DEFAULT_PERIODS } = require('../.tmp/seed.js');

let pass = 0;
let fail = 0;

function check(name, cond) {
  if (cond) {
    pass += 1;
    console.log(`  ok   ${name}`);
  } else {
    fail += 1;
    console.log(`  FAIL ${name}`);
  }
}

// 2026-09-07 是周一
const semester = {
  name: '2026 秋',
  startDate: '2026-09-07',
  totalWeeks: 20,
  periods: DEFAULT_PERIODS,
};

const courseA = {
  id: 'a',
  name: '高等数学 A',
  location: '教一-201',
  weekday: 1, // 周一
  periodStart: 1,
  periodEnd: 2, // 08:00–09:40
  weeks: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18],
  color: '#DCE9FF',
};

const courseB = {
  id: 'b',
  name: '数据结构',
  location: '计算机楼 402',
  weekday: 3, // 周三
  periodStart: 5,
  periodEnd: 6, // 14:00–15:40
  weeks: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18],
  color: '#D8F3DC',
};

const data = { semester, courses: [courseA, courseB] };

// 2026-11-04 是第 9 周的周三
const wedMorning = new Date('2026-11-04T10:00:00');
const s1 = selectToday(data, wedMorning);
check('周三上午：只显示今天的课', s1.remaining.length === 1 && s1.remaining[0].id === 'b');
check('周三上午：周次算对（第 9 周）', s1.week === 9);
check('周三上午：在学期内', s1.inRange === true);
check('周三上午：weekday = 3', s1.weekday === 3);

const wedDuring = new Date('2026-11-04T14:30:00');
const s2 = selectToday(data, wedDuring);
check('课正在上时仍显示（还没结束）', s2.remaining.length === 1);

const wedEvening = new Date('2026-11-04T16:00:00');
const s3 = selectToday(data, wedEvening);
check('课已结束时今天不显示', s3.remaining.length === 0);
check('课已结束时给下一节（周一那门）', s3.next && s3.next.course.id === 'a');
check('下一节的时间确实是 08:00', s3.next.startsAt.getHours() === 8);

const monday = new Date('2026-11-02T07:00:00');
const s4 = selectToday(data, monday);
check('周一早上：显示周一那门', s4.remaining.length === 1 && s4.remaining[0].id === 'a');

const sunday = new Date('2026-11-08T12:00:00');
const s5 = selectToday(data, sunday);
check('周日：今天没课、给出下一节', s5.remaining.length === 0 && Boolean(s5.next));

const summer = new Date('2026-07-20T10:00:00');
const s6 = selectToday(data, summer);
check('开学前：不在上课周', s6.inRange === false);
check('开学前：今天不显示课', s6.remaining.length === 0);

const empty = selectToday({ semester, courses: [] }, wedMorning);
check('没有课程时 hasCourses=false', empty.hasCourses === false);

const oddWeekCourse = {
  ...courseA,
  id: 'odd',
  weeks: [1, 3, 5, 7, 9, 11, 13, 15],
};
const oddData = { semester, courses: [oddWeekCourse] };
const oddMonday = selectToday(oddData, monday);
check('单周课在第 9 周（单周）会出现', oddMonday.remaining.length === 1);
const evenMonday = selectToday(oddData, new Date('2026-11-09T07:00:00'));
check('单周课在第 10 周（双周）不出现', evenMonday.remaining.length === 0);

// ── 桌面卡片右侧那一栏（今天 / 明天 / 后天） ──
const { selectPreview, sessionsOnDate } = require('../.tmp/widget/select.js');

check('卡片：周三上午给「今天」', s1.groups.length === 1 && s1.groups[0].label === '今天');
check('卡片：今天那组里有数据结构', s1.groups[0].items[0].course.id === 'b');
check('卡片：时间标签用作息表（14:00-15:40）', s1.groups[0].items[0].startLabel === '14:00' && s1.groups[0].items[0].endLabel === '15:40');

const wedLate = selectToday(data, wedEvening);
check('卡片：今天课上完后跳到下一个有课的日子（周一）', wedLate.groups[0].label === '周一');
check('卡片：跳过去那一组是高等数学', wedLate.groups[0].items[0].course.id === 'a');

const sundayGroups = selectPreview(data.courses, semester, sunday);
check('卡片：周日显示「明天」', sundayGroups[0].label === '明天');

check('卡片：开学前不给任何一组', s6.groups.length === 0);

// 同一天塞 4 门课，只放 2 个 → 其余进「其他 N 节」
const busyMonday = [1, 2, 3, 4].map((i) => ({
  ...courseA,
  id: `busy-${i}`,
  name: `课 ${i}`,
  periodStart: i * 2 - 1,
  periodEnd: i * 2,
}));
const busy = selectPreview(busyMonday, semester, new Date('2026-11-02T07:00:00'), 7, 2);
check('卡片：多出来的课记成 hiddenCount', busy[0].items.length === 2 && busy[0].hiddenCount === 2);

check('卡片：maxDays=1 时今天没课就是空', selectPreview(data.courses, semester, wedEvening, 1).length === 0);

const todayItems = sessionsOnDate(data.courses, semester, new Date('2026-11-04T16:00:00'), new Date('2026-11-04T16:00:00'));
check('sessionsOnDate：上完的课不返回', todayItems.length === 0);

console.log(`\n${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
