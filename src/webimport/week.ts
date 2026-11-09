/**
 * 网页导入 · 周次解析
 *
 * 纯逻辑（不 import 任何原生模块），可在 Node 里直接用单测跑。
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** 从「第 1 周周一」算到某天是第几周（1 起）。 */
export function weekOf(start: Date, date: Date): number {
  const s = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const t = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.floor((t.getTime() - s.getTime()) / DAY_MS / 7) + 1;
}

/** 周次标记：允许一层嵌套括号，郑大会写 `(11-15(单)周)` */
export const WEEK_GROUP_RE = /\(\s*第?\s*((?:[^()]|\([^()]*\))*?)\s*周\s*\)/g;

/**
 * 不带括号的写法：`1-15周`、`第1-15周单周`、`1,3,5-9周`。
 * 郑大的导出里两种都有；只认括号会把周次整个丢掉，最后兜底成全周。
 */
export const BARE_WEEK_RE =
  /(?:第\s*)?(\d+(?:\s*[-–—~]\s*\d+)?(?:\s*[,，、]\s*\d+(?:\s*[-–—~]\s*\d+)?)*)\s*周\s*(单|双)?\s*周?/g;

/** 周次写在下一个括号里：`(9-15周)(单)` */
const TRAILING_PARITY_RE = /^\s*[(（]\s*(单|双)\s*周?\s*[)）]/;

interface WeekMark {
  token: string;
  parity: 'all' | 'odd' | 'even';
  from: number;
  to: number;
}

function parityOfWord(word: string | undefined): 'all' | 'odd' | 'even' {
  if (!word) return 'all';
  return word.includes('单') ? 'odd' : 'even';
}

/**
 * 找出一个课块里所有「周次」标记，并把紧跟在后面的 (单)/(双周) 并进同一条。
 * 优先认括号写法；一个括号组都没有时再退回无括号写法。
 */
export function findWeekMarks(body: string): WeekMark[] {
  const marks: WeekMark[] = [];

  WEEK_GROUP_RE.lastIndex = 0;
  let m: RegExpExecArray | null = WEEK_GROUP_RE.exec(body);
  while (m !== null) {
    const mark: WeekMark = {
      token: m[1],
      parity: /单/.test(m[1]) ? 'odd' : /双/.test(m[1]) ? 'even' : 'all',
      from: m.index,
      to: WEEK_GROUP_RE.lastIndex,
    };
    if (mark.parity === 'all') {
      const trailing = TRAILING_PARITY_RE.exec(body.slice(mark.to, mark.to + 12));
      if (trailing) {
        mark.parity = parityOfWord(trailing[1]);
        mark.to += trailing[0].length;
      }
    }
    marks.push(mark);
    m = WEEK_GROUP_RE.exec(body);
  }
  if (marks.length > 0) return marks;

  BARE_WEEK_RE.lastIndex = 0;
  let bare: RegExpExecArray | null = BARE_WEEK_RE.exec(body);
  while (bare !== null) {
    marks.push({
      token: bare[1],
      parity: parityOfWord(bare[2]),
      from: bare.index,
      to: BARE_WEEK_RE.lastIndex,
    });
    bare = BARE_WEEK_RE.exec(body);
  }
  return marks;
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
