/**
 * 网页导入：在 App 里内嵌学校门户，让用户自己登录，
 * 我们从页面自己发出的请求里「捡」课表数据。
 *
 * 这个文件只放纯逻辑（不 import 任何原生模块），
 * 好在 Node 里直接用单测跑。
 */

import { type AppData, type Course, type Semester, type Weekday } from './types';
import { dateOf, mondayOf, parseISODate, toISODate, weekdayOf } from './schedule';
import { DEFAULT_PERIODS } from './seed';

const DAY_MS = 24 * 60 * 60 * 1000;

/** 从「第 1 周周一」算到某天是第几周（1 起）。 */
function weekOf(start: Date, date: Date): number {
  const s = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const t = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.floor((t.getTime() - s.getTime()) / DAY_MS / 7) + 1;
}

/** 网页里页面自己调接口时，我们关心哪两类地址。 */
export const SEMESTER_URL_HINT = /semester|term/i;
export const TABLE_URL_HINT = /course|schedule|kebiao|timetable/i;

/** WebView 回传的一条消息。 */
export interface CapturedMessage {
  kind: 'body';
  url: string;
  body: string;
}

/**
 * 页面上发生过的每一次请求（只记地址，不记内容）。
 * 课表抓不到的时候，靠它看学校到底调了哪些接口。
 */
export interface RequestMeta {
  kind: 'meta';
  url: string;
  status?: number;
  len?: number;
}

/** 用户手动点「诊断页面」时，页面回传的环境摘要。 */
export interface DiagReport {
  kind: 'diag';
  text: string;
}

/** 页面加载完后把课表表格抄回来的那份数据（可能有多张表）。 */
export interface DomReport {
  kind: 'dom';
  tables: { rows: { text: string; colspan?: number; rowspan?: number; title?: string }[][] }[];
  text?: string;
  /** 「含实验」开关的处置结果：只用于诊断，不改解析 */
  lab?: string;
}

export type HookMessage = CapturedMessage | RequestMeta | DiagReport | DomReport;

/** 把一条请求日志压成一行短文本，方便塞进底部面板。 */
export function describeMeta(meta: RequestMeta): string {
  const url = meta.url.replace(/^https?:\/\/[^/]+/, '');
  const bits: string[] = [];
  if (typeof meta.status === 'number') bits.push(String(meta.status));
  if (typeof meta.len === 'number') bits.push(`${meta.len}B`);
  const tail = bits.length > 0 ? ` ${bits.join(' ')}` : '';
  const cut = url.length > 96 ? `${url.slice(0, 96)}…` : url;
  return `${cut}${tail}`;
}

/** 从页面响应里认出来的一条课表记录（郑大教务那套字段）。 */
export interface CapturedRow {
  course_code?: string;
  course_name?: string;
  lesson_id?: string;
  lesson_no?: string;
  date: string;
  start_unit: number | string;
  end_unit: number | string;
  start_time?: string;
  end_time?: string;
  weeks?: string;
  weekstate?: string;
  rooms?: { name?: string }[] | string;
  teachers?: { name?: string }[] | string;
  [key: string]: unknown;
}

export interface CapturedSemester {
  id?: string;
  code?: string;
  year?: string | number;
  season?: string;
  start_date?: string;
  end_date?: string;
}

// ---------------------------------------------------------------------------
// 解包：页面的响应可能是裸 JSON，也可能被包成 { business_data: "<base64>" }。
// ---------------------------------------------------------------------------

function tryParseJson(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
}

const B64_CHARS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * 手写 base64 解码（不经 atob / Buffer，两个平台都能跑）。
 * 网页抓到的 business_data 是标准 base64，没有换行。
 */
export function decodeBase64ToText(input: string): string {
  let clean = '';
  for (const ch of input) {
    if (ch === '=' || ch === '\n' || ch === '\r') continue;
    if (B64_CHARS.indexOf(ch) >= 0) clean += ch;
  }
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < clean.length; i += 1) {
    buffer = (buffer << 6) | B64_CHARS.indexOf(clean[i]);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  if (bytes.length === 0) return '';

  // UTF-8 解码
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const b0 = bytes[i];
    if (b0 < 0x80) {
      out += String.fromCharCode(b0);
      i += 1;
    } else if (b0 >= 0xc0 && b0 < 0xe0 && i + 1 < bytes.length) {
      out += String.fromCharCode(((b0 & 0x1f) << 6) | (bytes[i + 1] & 0x3f));
      i += 2;
    } else if (b0 >= 0xe0 && b0 < 0xf0 && i + 2 < bytes.length) {
      out += String.fromCharCode(
        ((b0 & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f),
      );
      i += 3;
    } else if (b0 >= 0xf0 && i + 3 < bytes.length) {
      const cp =
        ((b0 & 0x07) << 18) |
        ((bytes[i + 1] & 0x3f) << 12) |
        ((bytes[i + 2] & 0x3f) << 6) |
        (bytes[i + 3] & 0x3f);
      out += String.fromCodePoint(cp);
      i += 4;
    } else {
      i += 1;
    }
  }
  return out;
}

/** 把页面响应解成可能是对象/数组的东西。 */
export function unwrapPayload(raw: string): unknown {
  const first = tryParseJson(raw);
  if (first === undefined) return undefined;
  if (first && typeof first === 'object') {
    const obj = first as Record<string, unknown>;
    const wrapped = obj.business_data ?? obj.data ?? obj.result;
    if (typeof wrapped === 'string' && wrapped.length > 0) {
      const decoded = tryParseJson(decodeBase64ToText(wrapped));
      if (decoded !== undefined) return decoded;
    }
  }
  return first;
}

function looksLikeRow(value: unknown): value is CapturedRow {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  const hasDate = typeof row.date === 'string';
  const hasUnit =
    row.start_unit !== undefined ||
    row.startUnit !== undefined ||
    row.start_period !== undefined ||
    row.start_time !== undefined;
  const hasName =
    row.course_name !== undefined ||
    row.courseName !== undefined ||
    row.course_code !== undefined ||
    row.courseCode !== undefined ||
    row.name !== undefined;
  return hasDate && hasUnit && hasName;
}

/** 从一次响应里挑出课表记录（数组、或 { rows/list/data: [...] }）。 */
export function pickRows(value: unknown): CapturedRow[] {
  if (Array.isArray(value)) return value.filter(looksLikeRow);
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    for (const key of ['list', 'rows', 'items', 'data', 'courseList']) {
      const nested = obj[key];
      if (Array.isArray(nested)) {
        const rows = nested.filter(looksLikeRow);
        if (rows.length > 0) return rows;
      }
    }
  }
  return [];
}

/** 从一次响应里挑出学期信息。 */
export function pickSemesters(value: unknown): CapturedSemester[] {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    const list = obj.semesters ?? obj.list;
    if (Array.isArray(list)) {
      return list.filter((s): s is CapturedSemester => Boolean(s) && typeof s === 'object');
    }
  }
  if (Array.isArray(value)) {
    return value.filter((s): s is CapturedSemester => Boolean(s) && typeof s === 'object');
  }
  return [];
}

// ---------------------------------------------------------------------------
// 归并：一条课在不同周会出现很多次，要并成一门课 + 周次列表。
// ---------------------------------------------------------------------------

function stringOf(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (item && typeof item === 'object') {
          const obj = item as Record<string, unknown>;
          for (const key of ['name', 'roomName', 'teacherName', 'instructor', 'label', 'code']) {
            const hit = obj[key];
            if (typeof hit === 'string' && hit.trim()) return hit.trim();
          }
          return '';
        }
        return String(item ?? '').trim();
      })
      .filter(Boolean)
      .join('、');
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    for (const key of ['name', 'roomName', 'teacherName', 'instructor', 'label']) {
      const hit = obj[key];
      if (typeof hit === 'string' && hit.trim()) return hit.trim();
    }
  }
  return '';
}

/** 用抓到的记录推一个学期（没有学期接口时兜底）。 */
export function semesterFromRows(rows: CapturedRow[]): Semester {
  const dates = rows
    .map((row) => parseISODate(String(row.date)))
    .filter((d): d is Date => Boolean(d));
  if (dates.length === 0) {
    // 完全没日期就退回一个空学期，交给调用方判断
    return {
      name: '导入的学期',
      startDate: toISODate(mondayOf(new Date())),
      totalWeeks: 20,
      periods: DEFAULT_PERIODS,
    };
  }
  const first = dates.reduce((min, d) => (d < min ? d : min), dates[0]);
  const startDate = mondayOf(first);
  let lastWeek = 1;
  for (const d of dates) {
    const week = weekOf(startDate, d);
    if (week > lastWeek) lastWeek = week;
  }
  return {
    name: '导入的学期',
    startDate: toISODate(startDate),
    totalWeeks: Math.min(Math.max(lastWeek, 1), 30),
    periods: DEFAULT_PERIODS,
  };
}

export interface ApplyResult {
  semester: Semester;
  courses: Course[];
  /** 抓到的原始记录条数，用来给用户看「N 条记录 → M 门课」。 */
  rowCount: number;
}

/**
 * 把抓到的记录变成课表。
 * 归并键 = 课程码 + 星期 + 起节 + 止节 + 教室，
 * 出现过的日期换算成周次列表。
 */
export function applyCaptured(
  rows: CapturedRow[],
  semesterInput?: Semester,
): ApplyResult {
  const semester = semesterInput ?? semesterFromRows(rows);
  const start = parseISODate(semester.startDate) ?? mondayOf(new Date());

  interface Draft {
    course: Course;
    weeks: Set<number>;
    /** 同一门课不同周可能换老师，全都留着，最后合并成一个名字列表 */
    teachers: Set<string>;
  }
  const drafts = new Map<string, Draft>();

  rows.forEach((row) => {
    const date = parseISODate(String(row.date));
    if (!date) return;
    const weekday = weekdayOf(date);
    const periodStart = Number(row.start_unit);
    const periodEnd = Number(row.end_unit);
    if (!Number.isFinite(periodStart) || !Number.isFinite(periodEnd)) return;

    const room = stringOf(row.rooms);
    const teacher = stringOf(row.teachers);
    const name = stringOf(row.course_name) || stringOf(row.course_code) || '未命名课程';
    const code = stringOf(row.course_code) || name;
    // 归并键里不放教室：实验课同一个时段会分几周跑不同项目、换不同实验室，
    // 按教室拆的话课表上会叠出四五个「只盖一周」的色块，看着像没导进来。
    // 教室取第一次出现的那个，老师把出现过的都留着。
    const key = `${code}|${weekday}|${periodStart}|${periodEnd}`;

    const existing = drafts.get(key);
    let draft: Draft;
    if (existing) {
      draft = existing;
      if (!draft.course.location && room) draft.course.location = room;
      if (!draft.course.note) draft.course.note = stringOf(row.lesson_no) || undefined;
    } else {
      draft = {
        weeks: new Set<number>(),
        teachers: new Set<string>(),
        course: {
          id: `web-${code}-${weekday}-${periodStart}-${periodEnd}`.replace(/\s+/g, ''),
          name,
          teacher: undefined,
          location: room || undefined,
          weekday,
          periodStart,
          periodEnd,
          weeks: [],
          color: '',
          note: stringOf(row.lesson_no) || undefined,
        },
      };
      drafts.set(key, draft);
    }
    if (teacher) draft.teachers.add(teacher);
    const week = weekOf(start, date);
    if (week >= 1) draft.weeks.add(week);
  });

  const sorted = [...drafts.values()].sort((a, b) => {
    if (a.course.weekday !== b.course.weekday) return a.course.weekday - b.course.weekday;
    if (a.course.periodStart !== b.course.periodStart) {
      return a.course.periodStart - b.course.periodStart;
    }
    return a.course.name.localeCompare(b.course.name, 'zh-Hans-CN');
  });

  const palette = [
    '#DCE9FF',
    '#FDE2E4',
    '#D8F3DC',
    '#FFF1C1',
    '#E9D8FD',
    '#FFE4CC',
    '#CFF4F4',
    '#EDE7DC',
  ];

  const courses = sorted.map((draft, index) => ({
    ...draft.course,
    teacher: [...draft.teachers].join('、') || draft.course.teacher,
    weeks: [...draft.weeks].sort((a, b) => a - b),
    color: palette[index % palette.length],
  }));

  return { semester, courses, rowCount: rows.length };
}

/** 把 WebView 回传的消息合并成一次导入结果。 */
export interface CaptureState {
  rows: CapturedRow[];
  semesters: CapturedSemester[];
  /** 已经收到过多少次相关响应，方便界面给反馈。 */
  hits: number;
}

export function emptyCapture(): CaptureState {
  return { rows: [], semesters: [], hits: 0 };
}

export function consumeMessage(
  state: CaptureState,
  message: CapturedMessage,
): CaptureState {
  const value = unwrapPayload(message.body);
  if (value === undefined) return state;

  const next: CaptureState = {
    rows: state.rows,
    semesters: state.semesters,
    hits: state.hits,
  };

  const semesters = pickSemesters(value);
  const rows = pickRows(value);
  if (semesters.length === 0 && rows.length === 0) return state;
  next.hits = state.hits + 1;

  if (semesters.length > 0) {
    next.semesters = semesters;
  }

  if (rows.length > 0) {
    // 同一条记录可能被重复抓到，用 课程+日期+节次 去重
    const seen = new Set(
      next.rows.map((r) => `${r.course_code ?? r.course_name}|${r.date}|${r.start_unit}`),
    );
    const added = rows.filter((r) => {
      const key = `${r.course_code ?? r.course_name}|${r.date}|${r.start_unit}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    next.rows = [...next.rows, ...added];
  }

  return next;
}

/** 抓到的学期信息 → 我们的 Semester。 */
export function semesterFromCaptured(
  captured: CapturedSemester[],
  rows: CapturedRow[],
): Semester {
  const base = semesterFromRows(rows);
  if (captured.length === 0) return base;

  // 优先找「现在这个学期」：有 start_date 且能覆盖抓到的课
  const dated = captured
    .map((s) => ({ info: s, start: parseISODate(String(s.start_date ?? '')) }))
    .filter((item): item is { info: CapturedSemester; start: Date } => Boolean(item.start));
  if (dated.length === 0) return base;

  const firstDate = rows
    .map((r) => parseISODate(String(r.date)))
    .filter((d): d is Date => Boolean(d))
    .sort((a, b) => a.getTime() - b.getTime())[0];

  const chosen =
    (firstDate && dated.find((item) => item.start <= firstDate)) ?? dated[0];

  const start = mondayOf(chosen.start);
  let lastWeek = base.totalWeeks;
  for (const row of rows) {
    const date = parseISODate(String(row.date));
    if (!date) continue;
    const week = weekOf(start, date);
    if (week > lastWeek) lastWeek = week;
  }
  const season = chosen.info.season ?? '季';
  const year = chosen.info.year ?? '';
  const name = year ? `${year} 学年 ${season}学期` : base.name;

  return {
    name,
    startDate: toISODate(start),
    totalWeeks: Math.min(Math.max(lastWeek, 1), 30),
    periods: base.periods,
  };
}

export type { AppData };

// ---------------------------------------------------------------------------
// DOM 路线：教务的课表页直接把课表画成 HTML 表格，一个请求都不发。
// 页面脚本只负责把表格「抄下来」，怎么理解放在这边做（于是可以单测）。
// ---------------------------------------------------------------------------

export interface DomCell {
  text: string;
  colspan?: number;
  rowspan?: number;
  /**
   * 单元格的 title 提示。教务页常把「周一第7-8节{1-16周}」写在这里，
   * 有它就是比列位置更可靠的定位依据；没有也不影响现在的解析。
   */
  title?: string;
}

export interface DomTable {
  rows: DomCell[][];
}

/** 摊平之后的单元格：星期几 + 单元格原文 + 这一行左边写的节次。 */
export interface LaidCell {
  weekday: number;
  text: string;
  /** 行首那一格（通常是「1-2」「3」这样的节次标签），解析不出节次时拿它兜底 */
  rowLabel?: string;
  /** 这一行所处的「大节」范围（如 [1,2]）；格子没合并成两行时靠它推连堂课 */
  rowBlock?: [number, number];
  /** 这一格在表格主体里的行号（0 起），用来按几何位置推节次 */
  row?: number;
  /** 这一格竖着占了几行（rowspan），两节课一大格就是 2 */
  span?: number;
}

const WEEKDAY_LABEL: Record<string, number> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  日: 7,
  天: 7,
};

/**
 * 「星期一」「周一」→ 1；不是星期表头返回 undefined。
 *
 * 表头必须钉在开头：教务页的格子里也会出现「本周」「下周」这种字样，
 * 用不锚定的正则会把它们当成星期几。
 */
export function weekdayOfLabel(text: string): number | undefined {
  const m = /^(?:星期|周)\s*([一二三四五六日天])/.exec(String(text ?? '').trim());
  return m ? WEEKDAY_LABEL[m[1]] : undefined;
}

/**
 * 把表格摊平成「星期几 + 单元格文字」。
 *
 * 教务表格有两个麻烦：
 *   1. 表头可能是合并单元格（colspan），列号得自己累加；
 *   2. 一门课可能竖向占两行（rowspan），那一列在下一行就不出现了，
 *      后面的格子会整体左移——必须记住哪些列被占着。
 */
export function layoutTable(table: DomTable): LaidCell[] {
  const rows = table?.rows ?? [];

  let headerIndex = -1;
  for (let r = 0; r < rows.length; r += 1) {
    const hits = rows[r].filter((cell) => weekdayOfLabel(cell.text) !== undefined).length;
    if (hits >= 3) {
      headerIndex = r;
      break;
    }
  }
  if (headerIndex < 0) return [];

  const colWeekday: Record<number, number> = {};
  let headCol = 0;
  for (const cell of rows[headerIndex]) {
    const weekday = weekdayOfLabel(cell.text);
    const span = Math.max(1, cell.colspan ?? 1);
    if (weekday !== undefined) {
      for (let k = 0; k < span; k += 1) colWeekday[headCol + k] = weekday;
    }
    headCol += span;
  }
  if (Object.keys(colWeekday).length === 0) return [];

  /** 表头一共声明了多少列（colspan 累加） */
  const headerCols = rows[headerIndex].reduce(
    (n, cell) => n + Math.max(1, cell.colspan ?? 1),
    0,
  );

  const laid: LaidCell[] = [];
  /** 列号 → 被占用的最后一行 */
  const occupy: Record<number, number> = {};
  const firstWeekdayCol = Math.min(...Object.keys(colWeekday).map(Number));
  /** 行号（主体行，0 起）→ 这一行的节次标签 */
  const rowLabels: Record<number, string> = {};
  /** 行号 → 这一行所属的大节范围 */
  const rowBlocks: Record<number, [number, number]> = {};

  for (let r = headerIndex + 1; r < rows.length; r += 1) {
    const rr = r - headerIndex - 1;
    /**
     * 这一行是不是「整行都发出来了」。
     *
     * 教务页有两派写法：
     *   A. 被上面 rowspan 盖住的格子干脆不发 <td> —— 后面的格子会整体左移，得靠 occupy 补回来；
     *   B. 盖住的格子也发一个空 <td> 占位 —— 行列天然对齐，再按 occupy 跳列反而会整体右移一格。
     * 用「这一行 colspan 合计是否够表头的列数」区分：够就是 B，别跳。
     */
    const rowCols = rows[r].reduce((n, cell) => n + Math.max(1, cell.colspan ?? 1), 0);
    const completeRow = rowCols >= headerCols;
    let c = 0;
    let rowLabel = '';
    for (const cell of rows[r]) {
      if (!completeRow) {
        while (occupy[c] !== undefined && occupy[c] >= r) c += 1;
      }
      const span = Math.max(1, cell.colspan ?? 1);
      const rowspan = Math.max(1, cell.rowspan ?? 1);
      const weekday = colWeekday[c];
      const text = String(cell.text ?? '').trim();
      if (weekday === undefined && c < firstWeekdayCol && text && !rowLabel) {
        rowLabel = text;
        // 「1-2」这种大节标签竖跨两行时，把每一行的具体节次记住
        const parsed = parsePeriodLabel(text);
        if (parsed) {
          for (let k = 0; k < rowspan; k += 1) {
            rowLabels[rr + k] = String(parsed[0] + k);
            rowBlocks[rr + k] = [parsed[0], parsed[1]];
          }
        }
      }
      if (weekday !== undefined && text) {
        laid.push({
          weekday,
          text,
          rowLabel: rowLabels[rr] ?? (rowLabel || undefined),
          rowBlock: rowBlocks[rr],
          row: rr,
          span: rowspan,
        });
      }
      if (rowspan > 1) {
        for (let k = 0; k < span; k += 1) occupy[c + k] = r + rowspan - 1;
      }
      c += span;
    }
  }

  return laid;
}

/**
 * 行号 → 节次。教务表格左边那一列通常写「1-2」「3-4」这样的大节，
 * 一格竖着占两行；读出来就能知道「第几行是第几节课」。
 */
export function periodsByRow(laid: LaidCell[]): Record<number, number> {
  const map: Record<number, number> = {};
  for (const cell of laid) {
    if (cell.row === undefined) continue;
    const span = Math.max(1, cell.span ?? 1);
    const parsed = parsePeriodLabel(cell.rowLabel);
    if (!parsed) continue;
    for (let k = 0; k < span; k += 1) {
      const period = parsed[0] + k;
      if (map[cell.row + k] === undefined) map[cell.row + k] = period;
    }
  }
  return map;
}

/**
 * 「1-4,6」→ 周次列表。
 *
 * 郑大的真实写法会带嵌套括号和单双周标记，例如 `11-15(单)`、`1-15(单)`、`第9-15,单周`，
 * 所以先把「单/双」抽成奇偶标记，再清掉所有括号和第字，最后才按逗号拆区间。
 */
export function parseWeekList(token: string): number[] {
  let raw = String(token ?? '').trim();
  if (!raw) return [];

  let parity: 'all' | 'odd' | 'even' = 'all';
  if (/单/.test(raw)) parity = 'odd';
  else if (/双/.test(raw)) parity = 'even';
  raw = raw
    .replace(/[单双]\s*周?/g, ' ')
    .replace(/[()（）]/g, ' ')
    .replace(/第/g, ' ')
    .replace(/\s*[-–—~]\s*/g, '-')
    .trim();
  if (!raw) {
    // 只写了「单周」「双周」，交给调用方按整学期展开
    return [];
  }

  const parts = raw.split(/[,，、;；\s]+/).map((item) => item.trim()).filter(Boolean);
  const weeks: number[] = [];

  for (const part of parts) {
    const range = /^(\d+)-(\d+)$/.exec(part);
    if (range) {
      const from = Number(range[1]);
      const to = Number(range[2]);
      for (let w = Math.min(from, to); w <= Math.max(from, to); w += 1) weeks.push(w);
      continue;
    }
    if (/^\d+$/.test(part)) weeks.push(Number(part));
  }

  const unique = [...new Set(weeks)].sort((a, b) => a - b);
  if (parity === 'odd') return unique.filter((w) => w % 2 === 1);
  if (parity === 'even') return unique.filter((w) => w % 2 === 0);
  return unique;
}

export interface ParsedSession {
  weeks: number[];
  /** 文字里没写节次时留空，由表格几何兜底 */
  startPeriod?: number;
  endPeriod?: number;
  room: string;
  teacher: string;
}

export interface ParsedCourseCell {
  name: string;
  code: string;
  sessions: ParsedSession[];
}

/** 全角括号/逗号归一 + 空白压成单空格（格子窄时浏览器会乱折行）。 */
function normalizeCell(text: string): string {
  return String(text ?? '')
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/，/g, ',')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 只取「课名 + 课程号」，不管周次节次。
 * 有些格子只写课名，周次/节次靠表格行列表达，这时候用得上。
 */
export function parseCellHeader(text: string): { name: string; code: string } {
  const flat = normalizeCell(text);
  if (!flat) return { name: '', code: '' };
  WEEK_GROUP_RE.lastIndex = 0;
  const firstWeek = WEEK_GROUP_RE.exec(flat);
  const head = firstWeek ? flat.slice(0, firstWeek.index) : flat;
  const codeMatch = /(\d{5,7}-\d{2,3})/.exec(head);
  return {
    name: head.replace(/\d{5,7}-\d{2,3}/, '').trim(),
    code: codeMatch ? codeMatch[1] : '',
  };
}

/** 周次标记：允许一层嵌套括号，郑大会写 `(11-15(单)周)` */
const WEEK_GROUP_RE = /\(\s*第?\s*((?:[^()]|\([^()]*\))*?)\s*周\s*\)/g;

/**
 * 班级 / 人数 这类行不属于课程安排。
 * 注意不能只写「级|班|学生」——「大学生职业生涯规划与就业指导」这种课名本身就含「学生」，
 * 会把课名当成噪声整条丢掉，所以要求前面带数字。
 */
const NOISE_RE = /\d+\s*[级班]|人数\s*[:：]|^学生人数/;

const CODE_RE = /\d{5,7}-\d{2,3}/g;

/**
 * 从「上一门课结束 → 本门课课程号」这段里剥出课名。
 *
 * 这段的典型内容是：`(4周)(5-8节) 主校区 材_406 贾全利 材料科学与工程2024级1班 人数:66/66 材料热力学`
 * ——前面的括号组、地点、老师、班级、人数都属于上一门课，最后剩下的那段才是本门课的名字。
 * 定位办法：找最后一个「级 / 班 / 人数 / 学生」这类噪声片段，它之后的就是课名。
 */
function extractTrailingName(between: string): { name: string; from: number } {
  const source = between;
  const tokens = [...source.matchAll(/\S+/g)].map((m) => ({ text: m[0], index: m.index ?? 0 }));
  if (tokens.length === 0) return { name: '', from: source.length };

  let start = -1;
  for (let i = tokens.length - 1; i >= 0; i -= 1) {
    if (NOISE_RE.test(tokens[i].text)) {
      start = i + 1;
      break;
    }
  }
  if (start < 0) {
    // 没有班级/人数这种锚点，就只信最后一个片段（多半是课名，地点通常带数字/下划线）
    const last = tokens[tokens.length - 1];
    if (/[\d_]/.test(last.text)) return { name: '', from: source.length };
    start = tokens.length - 1;
  }
  if (start >= tokens.length) return { name: '', from: source.length };

  const name = tokens
    .slice(start)
    .map((token) => token.text)
    .join(' ')
    .trim();
  return { name, from: tokens[start].index };
}

/**
 * 一个格子里可能塞了好几门课（郑大的实验课就是这样：同一格竖着排好几段）。
 * 用课程号当分隔符把格子切成若干「课名 + 课程号 + 安排」的段落。
 */
function splitCourseBlocks(flat: string): { name: string; code: string; body: string }[] {
  const codes: { code: string; index: number; end: number }[] = [];
  CODE_RE.lastIndex = 0;
  let match: RegExpExecArray | null = CODE_RE.exec(flat);
  while (match !== null) {
    codes.push({ code: match[0], index: match.index, end: match.index + match[0].length });
    match = CODE_RE.exec(flat);
  }

  if (codes.length === 0) {
    const head = parseCellHeader(flat);
    // 「人数:66/66」「…2024级1班」这类行不是课
    if (!head.name || NOISE_RE.test(flat)) return [];
    return [{ name: head.name, code: '', body: flat.slice(flat.indexOf(head.name) + head.name.length) }];
  }

  const names: { name: string; from: number }[] = [];
  let previousEnd = 0;
  for (const code of codes) {
    const between = flat.slice(previousEnd, code.index);
    const { name, from } = extractTrailingName(between);
    names.push({ name, from: previousEnd + from });
    previousEnd = code.end;
  }

  const blocks: { name: string; code: string; body: string }[] = [];
  for (let i = 0; i < codes.length; i += 1) {
    const name = names[i].name;
    if (!name) continue;
    const bodyEnd = i + 1 < codes.length ? names[i + 1].from : flat.length;
    blocks.push({
      name,
      code: codes[i].code,
      body: flat.slice(codes[i].end, bodyEnd).trim(),
    });
  }
  return blocks;
}

/** 解析一个格子里所有课程（一格一门时数组长度为 1） */
export function parseCourseBlocks(text: string): ParsedCourseCell[] {
  const flat = normalizeCell(text);
  if (!flat) return [];

  const blocks = splitCourseBlocks(flat);
  const result: ParsedCourseCell[] = [];

  for (const block of blocks) {
    const body = block.body;
    const marks: { token: string; from: number; to: number }[] = [];
    WEEK_GROUP_RE.lastIndex = 0;
    let m: RegExpExecArray | null = WEEK_GROUP_RE.exec(body);
    while (m !== null) {
      marks.push({ token: m[1], from: m.index, to: WEEK_GROUP_RE.lastIndex });
      m = WEEK_GROUP_RE.exec(body);
    }

    const pieces: { weeks: number[]; text: string }[] = [];
    if (marks.length === 0) {
      if (body) pieces.push({ weeks: [], text: body });
    } else {
      for (let i = 0; i < marks.length; i += 1) {
        const to = i + 1 < marks.length ? marks[i + 1].from : body.length;
        pieces.push({
          weeks: parseWeekList(marks[i].token),
          text: body.slice(marks[i].to, to).trim(),
        });
      }
    }
    if (pieces.length === 0) {
      result.push({ name: block.name, code: block.code, sessions: [] });
      continue;
    }

    const sessions: ParsedSession[] = pieces.map((piece) => {
      let rest = piece.text;
      let startPeriod: number | undefined;
      let endPeriod: number | undefined;
      const periodMatch = /\(\s*第?\s*([^()]*?)\s*节\s*\)/.exec(rest);
      if (periodMatch) {
        const span = /^(\d+)\s*(?:[-–—~]\s*(\d+))?$/.exec(periodMatch[1].trim());
        if (span) {
          startPeriod = Number(span[1]);
          endPeriod = span[2] ? Number(span[2]) : startPeriod;
        }
        rest = `${rest.slice(0, periodMatch.index)} ${rest.slice(periodMatch.index + periodMatch[0].length)}`;
      }
      const { room, teacher } = splitRoomTeacher(rest);
      return { weeks: piece.weeks, startPeriod, endPeriod, room, teacher };
    });

    result.push({ name: block.name, code: block.code, sessions });
  }

  return result;
}

/**
 * 解析一个课程格子的文字（一格只取第一门课，保留给单课格子与旧调用方）。
 *
 * 真实样本（郑大教务，2026-2027-1）：
 * ```
 * 材料研究方法
 * 082107-002
 * (1-4,6周)(1-2节) 主校区 材_406 贾全利
 * (9-15,单周)(1-2节) 主校区 材_406 范冰冰
 * 材料科学与工程2024级1班（无机非金属材料）
 * 人数:66/66
 * ```
 * 注意：格子窄的时候浏览器会把一行折成几行，`innerText` 里就多了换行，
 * 所以先把所有空白压成单空格再解析，不依赖行结构。
 */
export function parseCourseCell(text: string): ParsedCourseCell | undefined {
  return parseCourseBlocks(text)[0];
}

/** 把「主校区 材_406 贾全利」这种切成教室 + 老师，顺手丢掉班级/人数这类噪声。 */
function splitRoomTeacher(text: string): { room: string; teacher: string } {
  const parts = String(text ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .filter((part) => !/(级|班|人数|学生)/.test(part));
  if (parts.length === 0) return { room: '', teacher: '' };

  let room = '';
  let teacher = '';
  if (parts.length >= 3) {
    room = parts.slice(0, 2).join(' ');
    teacher = parts.slice(2).join(' ');
  } else if (parts.length === 2) {
    room = parts[0];
    teacher = parts[1];
  } else {
    // 「主校区材_406贾全利」这种挤在一起的：末尾 2-4 个汉字算老师
    const glued = /^(.+?[0-9A-Za-z_\-])\s*([\u4e00-\u9fa5]{2,4})$/.exec(parts[0]);
    room = glued ? glued[1] : parts[0];
    teacher = glued ? glued[2] : '';
  }
  // 「主校区 南2_404 (智慧教室) 范冰冰」：括号里的说明属于教室，别塞进老师名
  const parens = teacher.match(/\([^()]*\)/g) ?? [];
  if (parens.length > 0) {
    room = `${room} ${parens.join(' ')}`.trim();
    teacher = teacher
      .replace(/\([^()]*\)/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  return { room, teacher };
}

/**
 * 「1-2」「3」(节次标签) → [起, 止]
 */
function parsePeriodLabel(label: string | undefined): [number, number] | undefined {
  const text = String(label ?? '').trim();
  if (!text) return undefined;
  const m = /^(\d{1,2})\s*(?:[-–—~]\s*(\d{1,2}))?$/.exec(text);
  if (!m) return undefined;
  const a = Number(m[1]);
  const b = m[2] ? Number(m[2]) : a;
  if (a < 1 || b < a) return undefined;
  return [a, b];
}

/**
 * 表格单元格 → 与接口版同格式的记录（一条 = 一门课在某一天的一次）。
 * 这样后面的归并、去重、配色都能复用 `applyCaptured`，不用写第二套。
 *
 * 兜底：有些格子只写课名和课程号，周次/节次靠表格的行列表达，
 * 那就用行首的节次标签 + 整学期周次补上，别把课丢掉。
 */
export function cellsToRows(laid: LaidCell[], semester: Semester): CapturedRow[] {
  // 教务系统偶尔给一个不是周一的起始日，先归到那一周的周一，
  // 这样「第几周第几天」的换算跟 schedule.dateOf 是同一套规则。
  const aligned: Semester = {
    ...semester,
    startDate: toISODate(mondayOf(parseISODate(semester.startDate) ?? new Date())),
  };
  const allWeeks = Array.from({ length: Math.max(1, aligned.totalWeeks) }, (_, i) => i + 1);
  const rows: CapturedRow[] = [];
  const periodOfRow = periodsByRow(laid);

  for (const cell of laid) {
    const parsedBlocks = parseCourseBlocks(cell.text);
    const blocks =
      parsedBlocks.length > 0
        ? parsedBlocks
        : [{ ...parseCellHeader(cell.text), sessions: [] as ParsedSession[] }];
    if (blocks.every((b) => !b.name)) continue;

    // 表格几何：这一格竖着占几行，就是连上几节课。
    // 文字里写的「(1-2节)」有时会被浏览器折行/丢括号读不到，几何位置更可靠。
    const span = Math.max(1, cell.span ?? 1);
    const row = cell.row ?? -1;
    const geoStart = periodOfRow[row];
    const geoEnd =
      periodOfRow[row + span - 1] ?? (geoStart !== undefined ? geoStart + span - 1 : undefined);
    const geoSpan = geoStart !== undefined && geoEnd !== undefined ? geoEnd - geoStart + 1 : 0;

    // 文字里没写节次时，用表格几何兜底：
    //   1. 这一格竖着占几行（rowspan）→ 连上几节
    //   2. 否则看左边那一列的「大节」标签（1-2 / 3-4）
    const geoRange: [number, number] | undefined =
      span > 1 && geoSpan > 0
        ? [geoStart!, geoEnd!]
        : cell.rowBlock ?? (geoSpan > 0 ? [geoStart!, geoEnd!] : parsePeriodLabel(cell.rowLabel));

    for (const header of blocks) {
      if (!header.name) continue;
      const base =
        header.sessions.length > 0
          ? header.sessions
          : [{ weeks: [] as number[], room: '', teacher: '' } as ParsedSession];

      const sessions = base
        .map((session) => {
          const sp = session.startPeriod ?? geoRange?.[0];
          const ep =
            session.endPeriod ??
            (session.startPeriod !== undefined ? session.startPeriod : geoRange?.[1] ?? sp);
          if (sp === undefined || ep === undefined) return undefined;
          return {
            weeks: session.weeks.length > 0 ? session.weeks : allWeeks,
            startPeriod: sp,
            endPeriod: ep,
            room: session.room,
            teacher: session.teacher,
          };
        })
        .filter(
          (s): s is { weeks: number[]; startPeriod: number; endPeriod: number; room: string; teacher: string } =>
            Boolean(s),
        );

      for (const session of sessions) {
        for (const week of session.weeks) {
          if (week < 1 || week > 40) continue;
          const date = dateOf(week, cell.weekday as Weekday, aligned);
          rows.push({
            course_code: header.code || undefined,
            course_name: header.name,
            date: toISODate(date),
            start_unit: session.startPeriod,
            end_unit: session.endPeriod,
            rooms: session.room ? [{ name: session.room }] : [],
            teachers: session.teacher ? [{ name: session.teacher }] : [],
          });
        }
      }
    }
  }

  return rows;
}

/** 页面正文里能读到「学期起始日期：2026-09-07」就据此校正学期。 */
export function withSemesterStart(semester: Semester, pageText: string): Semester {
  const match = /学期起始日期\s*[:：]?\s*(\d{4})-(\d{2})-(\d{2})/.exec(String(pageText ?? ''));
  if (!match) return semester;
  const parsed = parseISODate(`${match[1]}-${match[2]}-${match[3]}`);
  if (!parsed) return semester;
  const start = mondayOf(parsed);
  return { ...semester, startDate: toISODate(start) };
}
