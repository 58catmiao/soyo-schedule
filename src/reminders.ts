import { Course, Semester } from './types';
import { formatTime, upcomingSessions } from './schedule';

/** 一条待发提醒：把「哪门课、什么时候、提前多久」算成确定的触发时刻 */
export interface Reminder {
  courseId: string;
  title: string;
  body: string;
  /** 通知应该响的时刻 */
  fireAt: Date;
  /** 这节课真正的开始时刻 */
  startsAt: Date;
}

export interface ReminderOptions {
  /** 提前多少分钟提醒 */
  leadMinutes: number;
  /** 往后排多少天 */
  days: number;
  /** 最多排多少条 */
  maxCount: number;
}

/**
 * 默认只排 7 天、最多 60 条。
 *
 * 这不是随手取的数：iOS 的待发本地通知硬上限是 64 条，超出的会被系统丢掉。
 * 所以策略是「排近的」，每次打开 App 都重新排一遍，滚动的近端永远准。
 * Android 没有这个硬上限，但排太多也会拖慢系统，跟着同一个策略走更省心。
 */
export const DEFAULT_REMINDER_OPTIONS: ReminderOptions = {
  leadMinutes: 15,
  days: 7,
  maxCount: 60,
};

/** 常用提前量（只是快捷按钮，真正存的是用户自己填的分钟数） */
export const LEAD_CHOICES = [5, 10, 15, 30, 60];

/** 提前量的上限：再大就没意义了（课与课之间没那么久） */
export const MAX_LEAD_MINUTES = 240;

/** 把任意输入收进 0..MAX 的整数；不是数字就退回默认 15。 */
export function clampLead(minutes: number): number {
  if (!Number.isFinite(minutes)) return DEFAULT_REMINDER_OPTIONS.leadMinutes;
  return Math.min(MAX_LEAD_MINUTES, Math.max(0, Math.round(minutes)));
}

export function describeLead(minutes: number): string {
  if (minutes <= 0) return '上课时';
  if (minutes < 60) return `提前 ${minutes} 分钟`;
  const hours = minutes / 60;
  return Number.isInteger(hours) ? `提前 ${hours} 小时` : `提前 ${minutes} 分钟`;
}

/**
 * 把课表算成一串「确定时刻」的提醒。
 *
 * 只排真实存在的课次（会跳过单双周、跳周、已经开始的课），
 * 不排抽象的「每周三固定」——因为调休、停课一改就对不上了。
 */
export function buildReminders(
  courses: Course[],
  semester: Semester,
  now: Date,
  options: ReminderOptions = DEFAULT_REMINDER_OPTIONS
): Reminder[] {
  const leadMs = Math.max(0, options.leadMinutes) * 60_000;
  const sessions = upcomingSessions(courses, semester, now, options.days);
  const out: Reminder[] = [];

  for (const session of sessions) {
    const fireAt = new Date(session.startsAt.getTime() - leadMs);
    // 提醒点已经过去（比如 8:50 才打开 App，而 8:45 就该提醒了）→ 不再补发
    if (fireAt.getTime() <= now.getTime()) continue;

    const { course } = session;
    const parts = [formatTime(session.startsAt)];
    if (course.location?.trim()) parts.push(course.location.trim());

    out.push({
      courseId: course.id,
      title: `${describeLead(options.leadMinutes)} · ${course.name}`,
      body: parts.join(' · '),
      fireAt,
      startsAt: session.startsAt,
    });
  }

  out.sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime());
  return out.slice(0, Math.max(0, options.maxCount));
}

/**
 * 排期指纹：内容一样就不必重新排。
 * 除了「课程 id + 触发时刻」，还要带上标题和正文——
 * 改了课名或地点时提醒文案要跟着变，只认 id 会一直发旧文案。
 */
export function reminderSignature(reminders: Reminder[]): string {
  return reminders
    .map((r) => `${r.courseId}@${r.fireAt.getTime()}@${r.title}@${r.body}`)
    .join('|');
}
