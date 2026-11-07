export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const WEEKDAY_LABELS: Record<Weekday, string> = {
  1: '一',
  2: '二',
  3: '三',
  4: '四',
  5: '五',
  6: '六',
  7: '日',
};

export const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 7];

/** 单双周口径 */
export type Parity = 'all' | 'odd' | 'even';

export const PARITY_LABELS: Record<Parity, string> = {
  all: '全',
  odd: '单',
  even: '双',
};

/** 一节课的时间段，来自各校作息表 */
export interface PeriodSlot {
  period: number;
  start: string; // 'HH:mm'
  end: string; // 'HH:mm'
}

/**
 * 一门课。
 *
 * 周次用显式列表 `weeks` 而不是「起始周 + 单双周」：
 * 单双周只是其中一种常见形态，还有 3-9 周、跳周、只上后半学期等情况，
 * 显式列表能全部表达，展示和提醒只需要一次 includes 判断。
 * 用户在表单里按「起止周 + 单双周」填写，保存时展开成列表。
 */
export interface Course {
  id: string;
  name: string;
  teacher?: string;
  location?: string;
  weekday: Weekday;
  /** 第几节开始，1 起 */
  periodStart: number;
  /** 第几节结束，含本节 */
  periodEnd: number;
  /** 有课的周次列表，升序 */
  weeks: number[];
  /** 课块底色 'rgb' 或 '#RRGGBB' */
  color: string;
  note?: string;
}

export interface Semester {
  name: string;
  /** 第 1 周的周一，'YYYY-MM-DD' */
  startDate: string;
  totalWeeks: number;
  periods: PeriodSlot[];
}

export interface AppData {
  semester: Semester;
  courses: Course[];
}
