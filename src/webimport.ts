/**
 * 网页导入：在 App 里内嵌学校门户，让用户自己登录，
 * 我们从页面自己发出的请求里「捡」课表数据。
 *
 * 对外 API 不变；实现按职责拆在 ./webimport/ 下：
 *   payload.ts  回传消息与响应载荷解析
 *   week.ts     周次解析
 *   merge.ts    记录归并成课表 / 抓取状态
 *   parse.ts    课程格子文字解析
 *   dom.ts      表格摊平与单元格 → 记录
 *
 * 只放纯逻辑（不 import 任何原生模块），好在 Node 里直接用单测跑。
 */

export {
  SEMESTER_URL_HINT,
  TABLE_URL_HINT,
  describeMeta,
  decodeBase64ToText,
  unwrapPayload,
  pickRows,
  pickSemesters,
} from './webimport/payload';
export type {
  CapturedMessage,
  RequestMeta,
  DiagReport,
  DomReport,
  HookMessage,
  CapturedRow,
  CapturedSemester,
} from './webimport/payload';

export {
  semesterFromRows,
  applyCaptured,
  emptyCapture,
  consumeMessage,
  semesterFromCaptured,
} from './webimport/merge';
export type { ApplyResult, CaptureState } from './webimport/merge';

export type { AppData } from './types';

export {
  weekdayOfLabel,
  layoutTable,
  periodsByRow,
  cellsToRows,
  withSemesterStart,
} from './webimport/dom';
export type { DomCell, DomTable, LaidCell } from './webimport/dom';

export { parseWeekList } from './webimport/week';

export { parseCellHeader, parseCourseBlocks, parseCourseCell } from './webimport/parse';
export type { ParsedSession, ParsedCourseCell } from './webimport/parse';
