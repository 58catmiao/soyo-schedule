/**
 * 网页导入 · 回传消息与响应载荷解析
 *
 * 纯逻辑（不 import 任何原生模块），可在 Node 里直接用单测跑。
 */

/** 网页里页面自己调接口时，我们关心哪两类地址。 */
export const SEMESTER_URL_HINT = /semester|term/i;
export const TABLE_URL_HINT = /course|schedule|kebiao|timetable/i;

/** WebView 回传的一条消息。 */
export interface CapturedMessage {
  kind: 'body';
  url: string;
  body: string;
}

/**
 * 页面上发生过的每一次请求（只记地址，不记内容）。
 * 课表抓不到的时候，靠它看学校到底调了哪些接口。
 */
export interface RequestMeta {
  kind: 'meta';
  url: string;
  status?: number;
  len?: number;
}

/** 用户手动点「诊断页面」时，页面回传的环境摘要。 */
export interface DiagReport {
  kind: 'diag';
  text: string;
}

/** 页面加载完后把课表表格抄回来的那份数据（可能有多张表）。 */
export interface DomReport {
  kind: 'dom';
  tables: { rows: { text: string; colspan?: number; rowspan?: number; title?: string }[][] }[];
  text?: string;
  /** 「含实验」开关的处置结果：只用于诊断，不改解析 */
  lab?: string;
}

export type HookMessage = CapturedMessage | RequestMeta | DiagReport | DomReport;

/** 把一条请求日志压成一行短文本，方便塞进底部面板。 */
export function describeMeta(meta: RequestMeta): string {
  const url = meta.url.replace(/^https?:\/\/[^/]+/, '');
  const bits: string[] = [];
  if (typeof meta.status === 'number') bits.push(String(meta.status));
  if (typeof meta.len === 'number') bits.push(`${meta.len}B`);
  const tail = bits.length > 0 ? ` ${bits.join(' ')}` : '';
  const cut = url.length > 96 ? `${url.slice(0, 96)}…` : url;
  return `${cut}${tail}`;
}

/** 从页面响应里认出来的一条课表记录（郑大教务那套字段）。 */
export interface CapturedRow {
  course_code?: string;
  course_name?: string;
  lesson_id?: string;
  lesson_no?: string;
  date: string;
  start_unit: number | string;
  end_unit: number | string;
  start_time?: string;
  end_time?: string;
  weeks?: string;
  weekstate?: string;
  rooms?: { name?: string }[] | string;
  teachers?: { name?: string }[] | string;
  [key: string]: unknown;
}

export interface CapturedSemester {
  id?: string;
  code?: string;
  year?: string | number;
  season?: string;
  start_date?: string;
  end_date?: string;
}

// ---------------------------------------------------------------------------
// 解包：页面的响应可能是裸 JSON，也可能被包成 { business_data: "<base64>" }。
// ---------------------------------------------------------------------------

function tryParseJson(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
}

const B64_CHARS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * 手写 base64 解码（不经 atob / Buffer，两个平台都能跑）。
 * 网页抓到的 business_data 是标准 base64，没有换行。
 */
export function decodeBase64ToText(input: string): string {
  let clean = '';
  for (const ch of input) {
    if (ch === '=' || ch === '\n' || ch === '\r') continue;
    if (B64_CHARS.indexOf(ch) >= 0) clean += ch;
  }
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < clean.length; i += 1) {
    buffer = (buffer << 6) | B64_CHARS.indexOf(clean[i]);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  if (bytes.length === 0) return '';

  // UTF-8 解码
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const b0 = bytes[i];
    if (b0 < 0x80) {
      out += String.fromCharCode(b0);
      i += 1;
    } else if (b0 >= 0xc0 && b0 < 0xe0 && i + 1 < bytes.length) {
      out += String.fromCharCode(((b0 & 0x1f) << 6) | (bytes[i + 1] & 0x3f));
      i += 2;
    } else if (b0 >= 0xe0 && b0 < 0xf0 && i + 2 < bytes.length) {
      out += String.fromCharCode(
        ((b0 & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f),
      );
      i += 3;
    } else if (b0 >= 0xf0 && i + 3 < bytes.length) {
      const cp =
        ((b0 & 0x07) << 18) |
        ((bytes[i + 1] & 0x3f) << 12) |
        ((bytes[i + 2] & 0x3f) << 6) |
        (bytes[i + 3] & 0x3f);
      out += String.fromCodePoint(cp);
      i += 4;
    } else {
      i += 1;
    }
  }
  return out;
}

/** 把页面响应解成可能是对象/数组的东西。 */
export function unwrapPayload(raw: string): unknown {
  const first = tryParseJson(raw);
  if (first === undefined) return undefined;
  if (first && typeof first === 'object') {
    const obj = first as Record<string, unknown>;
    const wrapped = obj.business_data ?? obj.data ?? obj.result;
    if (typeof wrapped === 'string' && wrapped.length > 0) {
      const decoded = tryParseJson(decodeBase64ToText(wrapped));
      if (decoded !== undefined) return decoded;
    }
  }
  return first;
}

function looksLikeRow(value: unknown): value is CapturedRow {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  const hasDate = typeof row.date === 'string';
  const hasUnit =
    row.start_unit !== undefined ||
    row.startUnit !== undefined ||
    row.start_period !== undefined ||
    row.start_time !== undefined;
  const hasName =
    row.course_name !== undefined ||
    row.courseName !== undefined ||
    row.course_code !== undefined ||
    row.courseCode !== undefined ||
    row.name !== undefined;
  return hasDate && hasUnit && hasName;
}

/** 从一次响应里挑出课表记录（数组、或 { rows/list/data: [...] }）。 */
export function pickRows(value: unknown): CapturedRow[] {
  if (Array.isArray(value)) return value.filter(looksLikeRow);
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    for (const key of ['list', 'rows', 'items', 'data', 'courseList']) {
      const nested = obj[key];
      if (Array.isArray(nested)) {
        const rows = nested.filter(looksLikeRow);
        if (rows.length > 0) return rows;
      }
    }
  }
  return [];
}

/** 从一次响应里挑出学期信息。 */
export function pickSemesters(value: unknown): CapturedSemester[] {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    const list = obj.semesters ?? obj.list;
    if (Array.isArray(list)) {
      return list.filter((s): s is CapturedSemester => Boolean(s) && typeof s === 'object');
    }
  }
  if (Array.isArray(value)) {
    return value.filter((s): s is CapturedSemester => Boolean(s) && typeof s === 'object');
  }
  return [];
}
