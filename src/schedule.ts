import { Course, Parity, PeriodSlot, Semester, Weekday } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

/** 'YYYY-MM-DD' → 当天 00:00 的本地时间 */
export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

/** Date → 'YYYY-MM-DD'（本地时间，不用 toISOString 以免跨时区偏一天） */
export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function midnightOf(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

export function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

/** 该日期所在周的周一（周一开始计周） */
export function mondayOf(date: Date): Date {
  const d = midnightOf(date);
  const dow = d.getDay(); // 0=周日
  const offset = dow === 0 ? -6 : 1 - dow;
  return addDays(d, offset);
}

/** 1..7（周一 = 1，周日 = 7） */
export function weekdayOf(date: Date): Weekday {
  const dow = date.getDay();
  return (dow === 0 ? 7 : dow) as Weekday;
}

/**
 * 给定日期是第几周（1 起）。
 * 早于开学返回 0 或负数，超过总周数返回更大的数——调用方自行判断是否在学期内。
 */
export function weekOfDate(date: Date, semester: Semester): number {
  const start = parseISODate(semester.startDate);
  const target = midnightOf(date);
  const diffDays = Math.floor((target.getTime() - start.getTime()) / DAY_MS);
  return Math.floor(diffDays / 7) + 1;
}

/** 第 week 周的七天日期（周一 → 周日） */
export function datesOfWeek(week: number, semester: Semester): Date[] {
  const start = parseISODate(semester.startDate);
  const monday = addDays(start, (week - 1) * 7);
  return [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(monday, i));
}

/** 某学期某周某天的日期 */
export function dateOf(week: number, weekday: Weekday, semester: Semester): Date {
  const start = parseISODate(semester.startDate);
  return addDays(start, (week - 1) * 7 + (weekday - 1));
}

/** 起止周 + 单双周 → 显式周次列表 */
export function expandWeeks(startWeek: number, endWeek: number, parity: Parity): number[] {
  const from = Math.max(1, Math.min(startWeek, endWeek));
  const to = Math.max(startWeek, endWeek);
  const out: number[] = [];
  for (let w = from; w <= to; w += 1) {
    if (parity === 'odd' && w % 2 === 0) continue;
    if (parity === 'even' && w % 2 !== 0) continue;
    out.push(w);
  }
  return out;
}

/** 从显式周次还原成「起止周 + 单双周」，给编辑表单用 */
export function describeWeeks(weeks: number[]): {
  startWeek: number;
  endWeek: number;
  parity: Parity;
} {
  // 注意：这是有损的正常化。例如「1-16 周单周」实际只上到第 15 周，
  // 会还原成「1-15 周单周」——两者行为完全等价，只是数字更贴近事实。
  if (weeks.length === 0) return { startWeek: 1, endWeek: 1, parity: 'all' };
  const sorted = [...weeks].sort((a, b) => a - b);
  const startWeek = sorted[0];
  const endWeek = sorted[sorted.length - 1];
  const allOdd = sorted.every((w) => w % 2 === 1);
  const allEven = sorted.every((w) => w % 2 === 0);
  // 只有当整个区间都能被该单双周口径完整覆盖时，才判定为单/双周
  const expectedOdd = expandWeeks(startWeek, endWeek, 'odd');
  const expectedEven = expandWeeks(startWeek, endWeek, 'even');
  if (allOdd && expectedOdd.length === sorted.length) {
    return { startWeek, endWeek, parity: 'odd' };
  }
  if (allEven && expectedEven.length === sorted.length) {
    return { startWeek, endWeek, parity: 'even' };
  }
  return { startWeek, endWeek, parity: 'all' };
}

/** 该周要上的课 */
export function coursesInWeek(courses: Course[], week: number): Course[] {
  return courses.filter((c) => c.weeks.includes(week));
}

/** 该周某天要上的课，按开始节次排序 */
export function coursesOnDay(courses: Course[], week: number, weekday: Weekday): Course[] {
  return coursesInWeek(courses, week)
    .filter((c) => c.weekday === weekday)
    .sort((a, b) => a.periodStart - b.periodStart);
}

export function periodSlot(periods: PeriodSlot[], period: number): PeriodSlot | undefined {
  return periods.find((p) => p.period === period);
}

/** 把 'HH:mm' 落到某一天的 Date 上 */
export function atTime(date: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(date);
  d.setHours(h, m, 0, 0);
  return d;
}

export interface DaySession {
  course: Course;
  /** 作息表里没配这一节时是空串 */
  start: string;
  end: string;
  startsAt: Date | null;
  endsAt: Date | null;
  /** 相对 now 的状态；没传 now 时一律 upcoming */
  state: 'past' | 'now' | 'upcoming';
}

/**
 * 某一天真实要上的课，带上作息表里的起止时刻。
 *
 * 「今天有哪些课」这件事今日页和桌面小组件都要问，规则只写这一处：
 * 不在学期内返回空，传了 now 才算 past/now/upcoming。
 */
export function sessionsOnDate(
  courses: Course[],
  semester: Semester,
  date: Date,
  now?: Date
): DaySession[] {
  const week = weekOfDate(date, semester);
  if (week < 1 || week > semester.totalWeeks) return [];

  return coursesOnDay(courses, week, weekdayOf(date)).map((course) => {
    const start = periodSlot(semester.periods, course.periodStart);
    const end = periodSlot(semester.periods, course.periodEnd);
    const startsAt = start ? atTime(date, start.start) : null;
    const endsAt = end ? atTime(date, end.end) : null;

    let state: DaySession['state'] = 'upcoming';
    if (now && startsAt && endsAt) {
      if (endsAt.getTime() <= now.getTime()) state = 'past';
      else if (startsAt.getTime() <= now.getTime()) state = 'now';
    }

    return {
      course,
      start: start ? start.start : '',
      end: end ? end.end : '',
      startsAt,
      endsAt,
      state,
    };
  });
}

export interface UpcomingSession {
  course: Course;
  date: Date;
  startsAt: Date;
  endsAt: Date;
}/**
 * 从 now 起未来 days 天内所有真实要上的课次。
 * 用于提醒排期：只排真实存在的课，不排「每周固定」的抽象规则。
 */
export function upcomingSessions(
  courses: Course[],
  semester: Semester,
  now: Date,
  days: number
): UpcomingSession[] {
  const base = mondayOf(now);
  const weeksToScan = new Set<number>();
  const maxWeek = Math.ceil(days / 7) + 1;
  for (let i = 0; i < maxWeek; i += 1) {
    const d = addDays(base, i * 7);
    weeksToScan.add(weekOfDate(d, semester));
  }

  const out: UpcomingSession[] = [];
  const limit = addDays(now, days);

  for (const week of weeksToScan) {
    if (week < 1 || week > semester.totalWeeks + 1) continue;
    for (const course of coursesInWeek(courses, week)) {
      const day = dateOf(week, course.weekday, semester);
      const slot = periodSlot(semester.periods, course.periodStart);
      const endSlot = periodSlot(semester.periods, course.periodEnd);
      if (!slot) continue;
      const startsAt = atTime(day, slot.start);
      const endsAt = atTime(day, endSlot ? endSlot.end : slot.end);
      // 只看「还没下课」的：正在上的那节要留下来（今天页的「正在上课」卡片靠它），
      // 提醒那边会自己跳过 fireAt 已经过去的条目，不会因此多弹通知。
      if (endsAt.getTime() <= now.getTime()) continue;
      if (startsAt.getTime() > limit.getTime()) continue;
      out.push({ course, date: day, startsAt, endsAt });
    }
  }

  return out.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

export function formatRange(dates: Date[]): string {
  if (dates.length === 0) return '';
  const first = dates[0];
  const last = dates[dates.length - 1];
  const md = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
  if (first.getMonth() === last.getMonth()) {
    return `${first.getMonth() + 1}月${first.getDate()}日 – ${last.getDate()}日`;
  }
  return `${md(first)} – ${md(last)}`;
}

export function formatTime(date: Date): string {
  const h = `${date.getHours()}`.padStart(2, '0');
  const m = `${date.getMinutes()}`.padStart(2, '0');
  return `${h}:${m}`;
}
