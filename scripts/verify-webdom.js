/**
 * 课表 DOM 解析自测（Node 直接跑，不依赖真机）
 *
 * 覆盖：表格摊平（colspan / rowspan）、周次串解析、课程格子解析、
 * 单元格 → 接口记录、学期起点校正。
 *
 * 跑法：
 *   npx tsc src\webimport.ts src\schedule.ts src\types.ts src\seed.ts \
 *     --ignoreConfig --outDir .tmp --rootDir src --module commonjs \
 *     --target es2020 --skipLibCheck
 *   node scripts\verify-webdom.js
 */

const {
  layoutTable,
  parseWeekList,
  parseCourseCell,
  cellsToRows,
  weekdayOfLabel,
  withSemesterStart,
} = require('../.tmp/webimport.js');

let passed = 0;
let failed = 0;

function eq(label, actual, expected) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a === b) {
    passed += 1;
  } else {
    failed += 1;
    console.log(`✗ ${label}\n  实际 ${a}\n  期望 ${b}`);
  }
}

// ---------------------------------------------------------------- 表头识别
eq('星期一 → 1', weekdayOfLabel('星期一'), 1);
eq('星期日 → 7', weekdayOfLabel('星期日'), 7);
eq('星期天 → 7', weekdayOfLabel(' 星期天 '), 7);
eq('不是表头', weekdayOfLabel('节次'), undefined);

// ---------------------------------------------------------------- 表格摊平
// 真实结构：第一列是节次，第 2..8 列是周一到周日；
// 星期二那门课 rowspan=2（占 1-2 两行），所以第二行里它不再出现。
const table = {
  rows: [
    [
      { text: '节次' },
      { text: '星期一' },
      { text: '星期二' },
      { text: '星期三' },
    ],
    [
      { text: '1' },
      { text: '' },
      {
        text: '材料研究方法\n082107-002\n(1-4,6周)(1-2节) 主校区 材_406 贾全利',
        rowspan: 2,
      },
      { text: '' },
    ],
    [
      { text: '2' },
      { text: '' },
      { text: '大学英语\n(1-16周)(3-4节) 外语楼 305' },
    ],
    [
      { text: '3' },
      { text: '体育\n(1-16周)(5-6节) 体育馆 孙老师' },
      { text: '' },
      { text: '' },
    ],
  ],
};

const laid = layoutTable(table);
eq('摊平后数量', laid.length, 3);
eq('第一节在星期二', laid[0].weekday, 2);
eq('第一节是材料研究方法', laid[0].text.startsWith('材料研究方法'), true);
eq('第二行左移后仍是星期三', laid[1].weekday, 3);
eq('第三行星期一', laid[2].weekday, 1);

// colspan：表头「星期六」占两列时，星期日的列号也跟着右移
const wide = {
  rows: [
    [
      { text: '' },
      { text: '星期四' },
      { text: '星期五' },
      { text: '星期六', colspan: 2 },
    ],
    [
      { text: '1' },
      { text: 'A\n(1-2周)(1-2节) 甲楼 101' },
      { text: 'B\n(1-2周)(1-2节) 乙楼 202' },
      { text: 'C\n(1-2周)(1-2节) 丙楼 303' },
    ],
  ],
};
const wideLaid = layoutTable(wide);
eq('colspan 表头：星期四', wideLaid[0].weekday, 4);
eq('colspan 表头：星期五', wideLaid[1].weekday, 5);
eq('colspan 表头：跨列仍算星期六', wideLaid[2].weekday, 6);

// 没有表头 → 不猜
eq('没有星期表头就返回空', layoutTable({ rows: [[{ text: '1' }]] }).length, 0);

// ---------------------------------------------------------------- 周次串
eq('1-4,6', parseWeekList('1-4,6'), [1, 2, 3, 4, 6]);
eq('1-4,单周', parseWeekList('1-4,单周'), [1, 3]);
eq('1-4,双周', parseWeekList('2-9,双周'), [2, 4, 6, 8]);
eq('1-15,单周', parseWeekList('1-15,单周').length, 8);
eq('空串', parseWeekList(''), []);

// ---------------------------------------------------------------- 课程格子
const cell = parseCourseCell(
  [
    '材料研究方法',
    '082107-002',
    '(1-4,6周)(1-2节) 主校区 材_406 贾全利',
    '(9-15,单周)(1-2节) 主校区 材_406 范冰冰',
    '材料科学与工程2024级1班（无机非金属材料）',
    '人数:66/66',
  ].join('\n'),
);
eq('课名', cell.name, '材料研究方法');
eq('课程号', cell.code, '082107-002');
eq('两段安排', cell.sessions.length, 2);
eq('第一段周次', cell.sessions[0].weeks, [1, 2, 3, 4, 6]);
eq('第一段节次', [cell.sessions[0].startPeriod, cell.sessions[0].endPeriod], [1, 2]);
eq('第一段教室', cell.sessions[0].room, '主校区 材_406');
eq('第一段老师', cell.sessions[0].teacher, '贾全利');
eq('第二段是单周', cell.sessions[1].weeks, [9, 11, 13, 15]);

// 只有一节的写法
const single = parseCourseCell('大学生职业生涯规划与就业指导\n416001-099\n(1-2,5-6周)(3节) 主校区 材_40 徐聪');
eq('单节写法', [single.sessions[0].startPeriod, single.sessions[0].endPeriod], [3, 3]);

// 不是课程格子（班级/人数行）→ undefined
eq('班级行不算课', parseCourseCell('人数:66/66'), undefined);

// 格子太窄被浏览器折行：括号中间被插了换行也得能认
const wrapped = parseCourseCell(
  '材料性能学\n083259-001\n(1-2,5-9周)(1-2\n节) 主校区 南2_403 朱玲玲',
);
eq('折行也能解出课名', wrapped.name, '材料性能学');
eq('折行也能解出节次', [wrapped.sessions[0].startPeriod, wrapped.sessions[0].endPeriod], [1, 2]);
eq('折行也能解出周次', wrapped.sessions[0].weeks, [1, 2, 5, 6, 7, 8, 9]);
eq('折行也能解出老师', wrapped.sessions[0].teacher, '朱玲玲');

// 全角括号 / 全角逗号
const fullwidth = parseCourseCell(
  '材料热工基础\n084131-001\n（1-4,6-8周）（3-4节） 主校区 南2_306 马成良',
);
eq('全角括号也能解出课名', fullwidth.name, '材料热工基础');
eq('全角括号节次', [fullwidth.sessions[0].startPeriod, fullwidth.sessions[0].endPeriod], [3, 4]);
eq('全角括号周次', fullwidth.sessions[0].weeks, [1, 2, 3, 4, 6, 7, 8]);

// 「第1-4周」「第5-6节」这种带「第」的写法
const withDi = parseCourseCell(
  '高温功能材料\n084083-001\n(第1-4周)(第5-6节) 主校区 材_402 陈留刚',
);
eq('第字前缀节次', [withDi.sessions[0].startPeriod, withDi.sessions[0].endPeriod], [5, 6]);
eq('第字前缀周次', withDi.sessions[0].weeks, [1, 2, 3, 4]);

// 教室和老师挤在一起（页面不总是加空格）
const glued = parseCourseCell('数据结构\n082107-003\n(1-8周)(1-2节)主校区材_406贾全利');
eq('挤在一起也能拆出教室', glued.sessions[0].room, '主校区材_406');
eq('挤在一起也能拆出老师', glued.sessions[0].teacher, '贾全利');

// 教室后面跟着括号说明：说明归教室，老师名要干净
const paren = parseCourseCell('材料性能学\n083259-001\n(9-16周)(1-2节) 主校区 南2_404 (智慧教室) 范冰冰');
eq('括号说明归到教室', paren.sessions[0].room, '主校区 南2_404 (智慧教室)');
eq('老师名不含括号', paren.sessions[0].teacher, '范冰冰');

// 一格两段安排：第二段的尾巴不能被第一段吃掉
const two = parseCourseCell(
  '材料研究方法\n082107-002\n(1-4,6周)(1-2节) 主校区 材_406 贾全利\n(9-15,单周)(1-2节) 主校区 材_406 范冰冰',
);
eq('两段安排的老师', two.sessions.map((s) => s.teacher), ['贾全利', '范冰冰']);
eq('两段安排的周次', two.sessions.map((s) => s.weeks.length), [5, 4]);

// 格子里没写周次/节次：用行首节次标签 + 整学期兜底，别把课丢掉
const bare = cellsToRows(
  [{ weekday: 3, text: '大学物理\n082001-001', rowLabel: '3-4' }],
  { name: 'x', startDate: '2026-09-07', totalWeeks: 16, periods: [] },
);
eq('兜底条数 = 学期周数', bare.length, 16);
eq('兜底节次', [bare[0].start_unit, bare[0].end_unit], [3, 4]);
eq('兜底第一周日期', bare[0].date, '2026-09-09');

// 接口字段写成驼峰也认
const { pickRows } = require('../.tmp/webimport.js');
const tolerant = pickRows([{ date: '2026-09-08', startUnit: 1, courseName: '测试课' }]);
eq('容忍驼峰字段', tolerant.length, 1);

// 格子文字里没写「几节」时，靠表格占了几个行（rowspan）+ 行首节次标签推
const geoTable = {
  rows: [
    [{ text: '节次' }, { text: '星期一' }, { text: '星期二' }, { text: '星期三' }],
    [
      { text: '1-2', rowspan: 2 },
      { text: '材料研究方法\n082107-002\n(1-4周)' },
      { text: '' },
      { text: '' },
    ],
    [{ text: '材料热工基础\n084131-001\n(1-4周)' }],
  ],
};
const geoLaid = layoutTable(geoTable);
const geoRows = cellsToRows(geoLaid, { name: 'x', startDate: '2026-09-07', totalWeeks: 20, periods: [] });
const geoMethod = geoRows.filter((r) => r.course_name === '材料研究方法');
eq('几何推算：占两行就是 1-2 节', geoMethod.length > 0 && [geoMethod[0].start_unit, geoMethod[0].end_unit], [1, 2]);
const geoHeat = geoRows.filter((r) => r.course_name === '材料热工基础');
// 同一大节里的格子就算没合并成两行，也按大节算 1-2 节（郑大除少数课外都是连堂）
eq('同一大节里没写节次的课按大节算', geoHeat.length > 0 && [geoHeat[0].start_unit, geoHeat[0].end_unit], [1, 2]);
// 文字里明确写了单节就以文字为准
const explicitOne = parseCourseCell('体育\n（1-16周）(7节) 体育馆 孙老师');
eq('明确写单节不被大节撑开', [explicitOne.sessions[0].startPeriod, explicitOne.sessions[0].endPeriod], [7, 7]);

// 文字里没写节次时，教室和老师照样要拿到（之前整段丢）
const noPeriod = parseCourseCell('材料研究方法\n082107-002\n(1-4周) 主校区 材_406 贾全利');
eq('没写节次也拿到教室', noPeriod.sessions[0].room, '主校区 材_406');
eq('没写节次也拿到老师', noPeriod.sessions[0].teacher, '贾全利');
eq('没写节次时节次留空', noPeriod.sessions[0].startPeriod, undefined);
const noPeriodRows = cellsToRows(
  [{ weekday: 2, text: noPeriod ? '材料研究方法\n082107-002\n(1-4周) 主校区 材_406 贾全利' : '', rowLabel: '1', rowBlock: [1, 2], row: 0, span: 1 }],
  { name: 'x', startDate: '2026-09-07', totalWeeks: 20, periods: [] },
);
eq('几何补节次时教室还在', noPeriodRows.length > 0 && [noPeriodRows[0].start_unit, noPeriodRows[0].end_unit], [1, 2]);
eq('几何补节次时老师还在', noPeriodRows.length > 0 && noPeriodRows[0].teachers, [{ name: '贾全利' }]);
eq('几何补节次时教室还在', noPeriodRows.length > 0 && noPeriodRows[0].rooms, [{ name: '主校区 材_406' }]);

// ---------------------------------------------------------------- 转成记录
const semester = {
  name: '2026 秋',
  startDate: '2026-09-07',
  totalWeeks: 20,
  periods: [],
};
const rows = cellsToRows([{ weekday: 2, text: '材料研究方法\n082107-002\n(1-4,6周)(1-2节) 主校区 材_406 贾全利' }], semester);
eq('记录条数 = 周次数', rows.length, 5);
eq('第 1 周日期', rows[0].date, '2026-09-08');
eq('第 2 周日期', rows[1].date, '2026-09-15');
eq('第 6 周日期', rows[4].date, '2026-10-13');
eq('节次', [rows[0].start_unit, rows[0].end_unit], [1, 2]);
eq('教室对象', rows[0].rooms, [{ name: '主校区 材_406' }]);

// ---------------------------------------------------------------- 学期起点
const fixed = withSemesterStart(semester, '2026-2027-1 学期起始日期：2026-09-07 今天');
eq('读到学期起始日期', fixed.startDate, '2026-09-07');
const shifted = withSemesterStart(semester, '学期起始日期：2026-09-01');
eq('非周一起点会被拉回周一', shifted.startDate, '2026-08-31');

// ---------------------------------------------------------------- 嵌套括号的单双周
// 郑大真实写法：`(11-15(单)周)`，老正则遇到内层括号会整段匹配失败，
// 于是周次变成空 → 兜底成整学期 → 课就「出现在错误的日期」。
eq('11-15(单) → 单周', parseWeekList('11-15(单)'), [11, 13, 15]);
eq('1-15(双) → 双周', parseWeekList('1-15(双)'), [2, 4, 6, 8, 10, 12, 14]);
eq('9-15,单周 → 单周', parseWeekList('9-15,单周'), [9, 11, 13, 15]);
eq('11—15（单）全角也能认', parseWeekList('11—15（单）'), [11, 13, 15]);

const nestedCell = parseCourseCell(
  '材料性能学 083239-001 (11-15(单)周)(1-2节) 主校区 南2_403 朱玲玲 人数:71/66'
);
eq('嵌套单周：周次正确', nestedCell && nestedCell.sessions[0].weeks, [11, 13, 15]);
eq('嵌套单周：课名没被污染', nestedCell && nestedCell.name, '材料性能学');

const nestedRows = cellsToRows(
  [{ weekday: 5, text: '材料性能学 083239-001 (11-15(单)周)(1-2节) 主校区 南2_403 朱玲玲' }],
  semester
);
eq('嵌套单周：只排 3 次课', nestedRows.length, 3);
eq('嵌套单周：第 11 周周五是 11-20', nestedRows[0].date, '2026-11-20');

// ---------------------------------------------------------------- 一格塞好几门课
// 郑大的实验课就是这样：同一格竖着排好几段「课名 + 课程号 + 安排」。
const { parseCourseBlocks } = require('../.tmp/webimport.js');
const jammed = [
  '材料热工基础',
  '084131-001',
  '(1-4,6-8周)(3-4节) 主校区 南2_306 马成良',
  '材料科学与工程2024级4班（无机非金属材料）',
  '人数:87/86',
  '材料科学与工程基础实验',
  '082077-002',
  '(4周)(5-8节) 实验室-106 张美香',
  '人数:66/66',
  '材料科学与工程基础实验',
  '082077-002',
  '(6周)(5-8节) 丰品-110 金相试样制备',
  '人数:66/66',
].join('\n');

const jammedBlocks = parseCourseBlocks(jammed);
eq('一格三门课：都切出来了', jammedBlocks.length, 3);
eq('一格三门课：名字对', jammedBlocks.map((b) => b.name), [
  '材料热工基础',
  '材料科学与工程基础实验',
  '材料科学与工程基础实验',
]);
eq('一格三门课：周次各自独立', jammedBlocks.map((b) => b.sessions[0].weeks), [[1, 2, 3, 4, 6, 7, 8], [4], [6]]);
eq('一格三门课：教室没串', jammedBlocks.map((b) => b.sessions[0].room), [
  '主校区 南2_306',
  '实验室-106',
  '丰品-110',
]);

const jammedRows = cellsToRows(
  [{ weekday: 2, text: jammed, rowLabel: '5-6', rowBlock: [5, 6], row: 4, span: 2 }],
  semester
);
eq('一格三门课：实验课没丢', [...new Set(jammedRows.map((r) => r.course_name))].sort(), [
  '材料科学与工程基础实验',
  '材料热工基础',
].sort());
eq(
  '一格三门课：实验课只在第 4、6 周出现',
  [...new Set(jammedRows.filter((r) => r.course_name === '材料科学与工程基础实验').map((r) => r.date))].sort(),
  ['2026-09-29', '2026-10-13']
);

console.log(`\n${passed} 通过 / ${failed} 失败`);
if (failed > 0) process.exit(1);
