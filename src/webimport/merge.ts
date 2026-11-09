/**
 * 网页导入 · 记录归并成课表与抓取状态
 *
 * 纯逻辑（不 import 任何原生模块），可在 Node 里直接用单测跑。
 */

import { type Course, type Semester } from '../types';
import { mondayOf, parseISODate, toISODate, weekdayOf } from '../schedule';
import { DEFAULT_PERIODS } from '../seed';
import {
  type CapturedMessage,
  type CapturedRow,
  type CapturedSemester,
  pickRows,
  pickSemesters,
  unwrapPayload,
} from './payload';
import { weekOf } from './week';

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
