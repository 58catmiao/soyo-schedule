import { addDays, parseISODate, toISODate } from './schedule';
import { Todo } from './types';

/** 今天往后挪几天，返回干净日期，用来给日期选择器和快捷按钮算「明天」 */
export function shiftISODate(date: string, days: number): string {
  return toISODate(addDays(parseISODate(date), days));
}

/** 未完成在前，再按日期升序、同一天按添加顺序（id 里的时间戳天然近似） */
export function sortTodos(todos: Todo[]): Todo[] {
  return [...todos].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/** 某一天的待办（含已完成的，界面上要能打勾回看） */
export function todosOn(todos: Todo[], date: string): Todo[] {
  return sortTodos(todos.filter((t) => t.date === date));
}

/**
 * 今天该看见的待办：逾期未完成 + 今天的。
 * 已完成的只留今天的，否则逾期列表会越滚越长。
 */
export function todosForToday(todos: Todo[], today: string): Todo[] {
  return sortTodos(
    todos.filter((t) => {
      if (t.date === today) return true;
      return t.date < today && !t.done;
    })
  );
}

/** 提醒/表头圆点用：只数没完成的 */
export function pendingCountOn(todos: Todo[], date: string): number {
  let n = 0;
  for (const t of todos) if (t.date === date && !t.done) n += 1;
  return n;
}

export interface TodoStats {
  /** 今天（含逾期）还没做的条数 */
  pending: number;
  /** 其中逾期的条数 */
  overdue: number;
  /** 今天做完的条数 */
  doneToday: number;
}

export function todoStats(todos: Todo[], today: string): TodoStats {
  let pending = 0;
  let overdue = 0;
  let doneToday = 0;
  for (const t of todos) {
    if (t.date === today) {
      if (t.done) doneToday += 1;
      else pending += 1;
    } else if (t.date < today && !t.done) {
      pending += 1;
      overdue += 1;
    }
  }
  return { pending, overdue, doneToday };
}

/** 「今天 / 明天 / 昨天 / 5 月 12 日」 */
export function describeDate(date: string, today: string): string {
  if (date === today) return '今天';
  if (date === shiftISODate(today, 1)) return '明天';
  if (date === shiftISODate(today, -1)) return '昨天';
  const d = parseISODate(date);
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日`;
}

/** 「周三 · 今天」这种给表单用的完整说法 */
export function describeDateFull(date: string, today: string): string {
  const d = parseISODate(date);
  const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()];
  return `${week} · ${describeDate(date, today)}`;
}

/** 表单里新建/编辑用：id 带时间戳，方便和课程的 c- 前缀区分 */
export function makeTodoId(): string {
  return `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}
