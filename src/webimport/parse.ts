/**
 * 网页导入 · 课程格子文字解析
 *
 * 纯逻辑（不 import 任何原生模块），可在 Node 里直接用单测跑。
 */

import type { Parity } from '../types';
import { BARE_WEEK_RE, WEEK_GROUP_RE, findWeekMarks, parseWeekList } from './week';

export interface ParsedSession {
  weeks: number[];
  /**
   * 单/双周。`weeks` 为空时，调用方按这个标记在整学期里筛奇偶周；
   * 两者都空才说明「文字里完全没写周次」，只能按几何兜底成全周。
   */
  parity?: Exclude<Parity, 'all'>;
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
  // 没有括号写法时，`1-15周` 这种也要算「周次从这里开始」，否则整段当成课名
  BARE_WEEK_RE.lastIndex = 0;
  const bareWeek = firstWeek ? null : BARE_WEEK_RE.exec(flat);
  const cut = firstWeek ? firstWeek.index : bareWeek ? bareWeek.index : -1;
  const head = cut >= 0 ? flat.slice(0, cut) : flat;
  const codeMatch = /(\d{5,7}-\d{2,3})/.exec(head);
  return {
    name: head.replace(/\d{5,7}-\d{2,3}/, '').trim(),
    code: codeMatch ? codeMatch[1] : '',
  };
}

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
    const marks = findWeekMarks(body);

    const pieces: { weeks: number[]; parity: 'all' | 'odd' | 'even'; text: string }[] = [];
    if (marks.length === 0) {
      // 完全没写数字、只写「单周/双周」：保住奇偶，别退回全周
      if (body && /单\s*周|双\s*周/.test(body)) {
        pieces.push({
          weeks: [],
          parity: /单\s*周/.test(body) ? 'odd' : 'even',
          text: body,
        });
      } else if (body) {
        pieces.push({ weeks: [], parity: 'all', text: body });
      }
    } else {
      for (let i = 0; i < marks.length; i += 1) {
        const mark = marks[i];
        const to = i + 1 < marks.length ? marks[i + 1].from : body.length;
        let weeks = parseWeekList(mark.token);
        // 奇偶写在周次标记外面时，parseWeekList 看不到，这里补过滤
        if (mark.parity === 'odd') weeks = weeks.filter((w) => w % 2 === 1);
        else if (mark.parity === 'even') weeks = weeks.filter((w) => w % 2 === 0);
        pieces.push({
          weeks,
          parity: mark.parity,
          text: body.slice(mark.to, to).trim(),
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
      return {
        weeks: piece.weeks,
        parity: piece.parity === 'all' ? undefined : piece.parity,
        startPeriod,
        endPeriod,
        room,
        teacher,
      };
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
export function parsePeriodLabel(label: string | undefined): [number, number] | undefined {
  const text = String(label ?? '').trim();
  if (!text) return undefined;
  const m = /^(\d{1,2})\s*(?:[-–—~]\s*(\d{1,2}))?$/.exec(text);
  if (!m) return undefined;
  const a = Number(m[1]);
  const b = m[2] ? Number(m[2]) : a;
  if (a < 1 || b < a) return undefined;
  return [a, b];
}
