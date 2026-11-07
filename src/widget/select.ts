/**
 * 「今天该显示什么」的纯逻辑。
 *
 * 单独抽出来是为了能在 Node 里单测——render-widget.tsx 要 import
 * react-native-android-widget（原生模块），跑不进纯 JS 测试。
 */
import { AppData, Course, WEEKDAY_LABELS, Weekday } from '../types';
import {
  UpcomingSession,
  addDays,
  midnightOf,
  sessionsOnDate as daySessions,
  upcomingSessions,
  weekOfDate,
  weekdayOf,
} from '../schedule';

export type PreviewItem = {
  course: Course;
  startLabel: string;
  endLabel: string;
};

/** 桌面卡片右侧那一栏：一组「今天 / 明天 / 后天」的课 */
export type PreviewGroup = {
  label: string;
  items: PreviewItem[];
  /** 放不下的还有几节 */
  hiddenCount: number;
};

export type TodaySelection = {
  week: number;
  /** 现在是不是在学期内（寒暑假时为 false） */
  inRange: boolean;
  weekday: Weekday;
  /** 今天还没上完的课（已经结束的不占位置） */
  remaining: Course[];
  /** 未来两周内的下一节课 */
  next: UpcomingSession | undefined;
  hasCourses: boolean;
  /** 桌面小组件右边那一栏 */
  groups: PreviewGroup[];
};

const RELATIVE_LABELS = ['今天', '明天', '后天'];

/** 某一天要上的课；传了 now 就丢掉已经上完的 */
export function sessionsOnDate(
  courses: Course[],
  semester: AppData['semester'],
  date: Date,
  now?: Date
): PreviewItem[] {
  return daySessions(courses, semester, date, now)
    .filter((session) => !now || session.state !== 'past')
    .map((session) => ({
      course: session.course,
      startLabel: session.start,
      endLabel: session.end,
    }));
}

/**
 * 找到「最近一个还有课的日子」，最多往后看 maxDays 天。
 * 只返回一组——桌面卡片就那么大，多给也没地方放。
 */
export function selectPreview(
  courses: Course[],
  semester: AppData['semester'],
  now: Date,
  maxDays = 7,
  maxItems = 3
): PreviewGroup[] {
  for (let i = 0; i < maxDays; i += 1) {
    const date = addDays(midnightOf(now), i);
    // 今天的课要丢掉已经上完的，明天起就是整天
    const items = sessionsOnDate(courses, semester, date, i === 0 ? now : undefined);
    if (!items.length) continue;
    const label =
      i < RELATIVE_LABELS.length
        ? RELATIVE_LABELS[i]
        : `周${WEEKDAY_LABELS[weekdayOf(date)]}`;
    return [
      {
        label,
        items: items.slice(0, maxItems),
        hiddenCount: Math.max(0, items.length - maxItems),
      },
    ];
  }
  return [];
}

export function selectToday(data: AppData, now: Date): TodaySelection {
  const week = weekOfDate(now, data.semester);
  const inRange = week >= 1 && week <= data.semester.totalWeeks;
  const weekday = weekdayOf(now);

  return {
    week,
    inRange,
    weekday,
    remaining: inRange
      ? sessionsOnDate(data.courses, data.semester, now, now).map((item) => item.course)
      : [],
    next: upcomingSessions(data.courses, data.semester, now, 14)[0],
    hasCourses: data.courses.length > 0,
    groups: inRange ? selectPreview(data.courses, data.semester, now) : [],
  };
}
