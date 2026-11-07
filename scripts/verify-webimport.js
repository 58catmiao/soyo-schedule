/**
 * 网页导入解析的自测（纯逻辑，不碰 WebView）。
 *
 * 跑法：
 *   npx tsc src/webimport.ts src/schedule.ts src/types.ts src/seed.ts src/theme.ts \
 *     --ignoreConfig --outDir .tmp --rootDir src --module commonjs \
 *     --target es2020 --skipLibCheck --esModuleInterop
 *   node scripts/verify-webimport.js
 */
const {
  applyCaptured,
  consumeMessage,
  decodeBase64ToText,
  emptyCapture,
  layoutTable,
  pickRows,
  pickSemesters,
  semesterFromCaptured,
  semesterFromRows,
  unwrapPayload,
} = require('../.tmp/webimport.js');

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

// 郑大教务真实形状的几条记录：同一门课在第 1、2 周各出现一次
const rows = [
  {
    course_code: 'B1234560',
    course_name: '高等数学 A',
    lesson_no: '01',
    date: '2026-09-07',
    start_unit: 1,
    end_unit: 2,
    rooms: [{ name: '教一-201' }],
    teachers: [{ name: '张老师' }],
  },
  {
    course_code: 'B1234560',
    course_name: '高等数学 A',
    lesson_no: '01',
    date: '2026-09-14',
    start_unit: 1,
    end_unit: 2,
    rooms: [{ name: '教一-201' }],
    teachers: [{ name: '张老师' }],
  },
  {
    course_code: 'B9999999',
    course_name: '数据结构',
    lesson_no: '02',
    date: '2026-09-09',
    start_unit: 5,
    end_unit: 6,
    rooms: [{ name: '计算机楼 402' }],
    teachers: [{ name: '李老师' }],
  },
];

const result = applyCaptured(rows);
check('两门课归并成 2 门', result.courses.length === 2);
check('记录的条数保留下来', result.rowCount === 3);

const math = result.courses.find((c) => c.name === '高等数学 A');
check('高数出现两次 → 周次 [1,2]', math && math.weeks.join(',') === '1,2');
check('高数在周一', math && math.weekday === 1);
check('高数在 1-2 节', math && math.periodStart === 1 && math.periodEnd === 2);
check('教室拍成字符串', math && math.location === '教一-201');
check('老师拍成字符串', math && math.teacher === '张老师');
check('每门课都有颜色', result.courses.every((c) => /^#[0-9A-Fa-f]{6}$/.test(c.color)));

const data = result.courses.find((c) => c.name === '数据结构');
check('数据结构在周三 5-6 节', data && data.weekday === 3 && data.periodStart === 5);
check('排序按 星期→节次', result.courses[0].weekday <= result.courses[1].weekday);

// 学期兜底：最早一天是 2026-09-07 周一
check('学期起始日 = 2026-09-07', result.semester.startDate === '2026-09-07');
check('总周数至少覆盖到第 2 周', result.semester.totalWeeks >= 2);
check('学期带 10 节作息', result.semester.periods.length === 10);

// base64 解包（教务 business_data 是裸 base64）
const payload = JSON.stringify([{ a: 1, b: '中文' }]);
const b64 = Buffer.from(payload, 'utf8').toString('base64');
check('base64 解码回原文', decodeBase64ToText(b64) === payload);
const wrapped = JSON.stringify({ err_code: 0, business_data: b64 });
const unwrapped = unwrapPayload(wrapped);
check('business_data 被解包成数组', Array.isArray(unwrapped) && unwrapped[0].b === '中文');

// 裸 JSON
check('裸 JSON 直接可用', Array.isArray(unwrapPayload(JSON.stringify(rows))));
check('垃圾数据返回 undefined', unwrapPayload('<html>not json</html>') === undefined);

// pickRows / pickSemesters
check('数组直接挑出记录', pickRows(rows).length === 3);
check('{list:[...]} 也能挑出', pickRows({ list: rows }).length === 3);
check('不是课表的数组被丢掉', pickRows([{ foo: 1 }]).length === 0);
check(
  '学期列表能挑出',
  pickSemesters({ semesters: [{ id: '1', year: '2026', season: '秋', start_date: '2026-09-07' }] })
    .length === 1,
);

// consumeMessage：同一条重复抓到要把重复去掉
let state = emptyCapture();
state = consumeMessage(state, { kind: 'body', url: '/student/course/schedule/get-course-tables', body: JSON.stringify(rows) });
check('第一次抓到 3 条', state.rows.length === 3);
state = consumeMessage(state, { kind: 'body', url: '/student/course/schedule/get-course-tables', body: JSON.stringify(rows) });
check('同样的响应再抓一次不会翻倍', state.rows.length === 3);
check('抓取命中次数累计到 2', state.hits === 2);

state = consumeMessage(state, {
  kind: 'body',
  url: '/common/get-semester',
  body: JSON.stringify({
    cur_semester_id: '77',
    semesters: [{ id: '77', year: '2026', season: '秋', code: '2026-2027-1', start_date: '2026-09-07', end_date: '2027-01-17' }],
  }),
});
check('学期信息也收进来了', state.semesters.length === 1);

const semester = semesterFromCaptured(state.semesters, state.rows);
check('学期名拼成「2026 学年 秋学期」', semester.name === '2026 学年 秋学期');
check('学期起始日来自接口', semester.startDate === '2026-09-07');

// 没有学期接口时用记录推
const fallback = semesterFromRows(rows);
check('无学期接口时也能推出起始日', fallback.startDate === '2026-09-07');

// 空数据
const empty = applyCaptured([]);
check('空记录得到 0 门课', empty.courses.length === 0);

// 教务页真实形状：每行都发满 8 个 td（被 rowspan 盖住的列也发一个空 td 占位）。
// 2026-11-07 实测：这类表如果还按 occupy 跳列，整行会右移一格（无机材料从周二跑到周三）。
const header = ['', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'];
const cell = (text, rowspan = 1) => ({ text, rowspan, colspan: 1 });
const blank = cell('');
const period = (n) => cell(String(n));
const sig = (laid) => laid.map((x) => `${x.weekday}@${x.row}`).join(' ');

const fullRow = {
  rows: [
    header.map((t) => cell(t)),
    [period(1), blank, cell('材料研究方法', 2), cell('材料研究方法', 2), blank, cell('材料性能学', 2), cell('机械设计', 2), blank],
    [period(2), blank, blank, blank, blank, blank, blank, blank],
    [period(3), cell('材料热工基础', 2), cell('材料热工基础', 2), cell('材料性能学', 2), blank, cell('大学生职业', 2), cell('机械设计', 2), blank],
    [period(4), blank, blank, blank, blank, blank, blank, blank],
    [period(5), cell('材料实验', 4), blank, cell('高温功能材料', 2), cell('无机材料科学', 2), blank, cell('机械设计', 2), blank],
    [period(6), blank, blank, blank, blank, blank, blank, blank],
    [period(7), blank, cell('无机材料科学', 2), blank, cell('AutoCAD设计', 2), cell('高温功能材料', 2), cell('机械设计', 2), blank],
    [period(8), blank, blank, blank, blank, blank, blank, blank],
    [period(9), blank, cell('非平衡材料', 2), blank, cell('形势与政策', 2), blank, blank, blank],
    [period(10), blank, blank, blank, blank, blank, blank, blank],
  ],
};
check(
  '每行都发满时按列号直读，不被 rowspan 带偏',
  sig(layoutTable(fullRow)) === '2@0 3@0 5@0 6@0 1@2 2@2 3@2 5@2 6@2 1@4 3@4 4@4 6@4 2@6 4@6 5@6 6@6 2@8 4@8'
);

// 另一派写法：被盖住的格子在下一行不发，得靠 occupy 把列补回来
const sparseRow = {
  rows: [
    header.map((t) => cell(t)),
    [period(1), cell('材料实验', 2)],
    [period(2), blank, cell('高温功能材料', 2)],
  ],
};
check('被盖住的格子不发时仍能补列', sig(layoutTable(sparseRow)) === '1@0 3@1');

// 归并：同一门课同一时段、不同周换教室/老师，应该合成一门课，而不是叠成几块
{
  const merged = applyCaptured(
    [
      { course_name: '材料科学与工程基础实验', course_code: '082077-002', date: '2026-09-28', start_unit: 5, end_unit: 8, rooms: '烧成实验室-106', teachers: '张美香' },
      { course_name: '材料科学与工程基础实验', course_code: '082077-002', date: '2026-10-12', start_unit: 5, end_unit: 8, rooms: '材料粉体室-110', teachers: '李四' },
    ],
    { name: '2026 秋', startDate: '2026-09-07', totalWeeks: 20 },
  );
  check('同时段换教室的实验课合成一门（不是叠成两块）', merged.courses.length === 1);
  check('合成后的周次是两段的并集', JSON.stringify(merged.courses[0].weeks) === '[4,6]');
  check('换过的老师都留着', merged.courses[0].teacher === '张美香、李四');
}

console.log(`\n${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
