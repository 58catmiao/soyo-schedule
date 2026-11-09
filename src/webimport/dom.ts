/**
 * 网页导入 · 表格摊平与单元格转记录
 *
 * 纯逻辑（不 import 任何原生模块），可在 Node 里直接用单测跑。
 */

import { type Semester, type Weekday } from '../types';
import { dateOf, mondayOf, parseISODate, toISODate } from '../schedule';
import type { CapturedRow } from './payload';
import {
  parseCellHeader,
  parseCourseBlocks,
  parsePeriodLabel,
  type ParsedSession,
} from './parse';

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
            // 有周次用周次；只有单/双周就按整学期的奇偶展开；
            // 两样都没有才真的兜底成全周（以前这里一律全周，单双周课就变成周周都上）
            weeks:
              session.weeks.length > 0
                ? session.weeks
                : session.parity
                  ? allWeeks.filter((w) => (session.parity === 'odd' ? w % 2 === 1 : w % 2 === 0))
                  : allWeeks,
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
