import { PeriodSlot, Semester } from './types';
import { addDays, mondayOf, toISODate } from './schedule';

/**
 * 郑州大学作息：一天 10 节，两节一大节。
 * 大节时间取自教务系统的课表（1-2 节 08:00–09:40、3-4 节 10:10–11:50、
 * 5-6 节 14:00–15:40、7-8 节 16:00–17:40、9-10 节 19:00–20:40），
 * 小节按中间 10 分钟课间拆开。提醒时间完全由这张表推导。
 */
export const DEFAULT_PERIODS: PeriodSlot[] = [
  { period: 1, start: '08:00', end: '08:45' },
  { period: 2, start: '08:55', end: '09:40' },
  { period: 3, start: '10:10', end: '10:55' },
  { period: 4, start: '11:05', end: '11:50' },
  { period: 5, start: '14:00', end: '14:45' },
  { period: 6, start: '14:55', end: '15:40' },
  { period: 7, start: '16:00', end: '16:45' },
  { period: 8, start: '16:55', end: '17:40' },
  { period: 9, start: '19:00', end: '19:45' },
  { period: 10, start: '19:55', end: '20:40' },
];

/**
 * 还没有课表时的空学期。
 *
 * 课表一开始是空的，等用户从教务系统导入或手动添加——不再塞一份示例课程，
 * 「（示例）」这种字眼也不该出现在一个要长期用的 App 里。
 *
 * 起始日仍然取「8 周前的那个周一」：空课表也要显示一个像样的周次，
 * 而郑大秋季学期这会儿正好在第 9 周；等真正导入时会被教务系统的学期覆盖。
 */
export function makeInitialSemester(): Semester {
  const start = addDays(mondayOf(new Date()), -7 * 8);
  return {
    name: '本学期',
    startDate: toISODate(start),
    totalWeeks: 20,
    periods: DEFAULT_PERIODS,
  };
}
