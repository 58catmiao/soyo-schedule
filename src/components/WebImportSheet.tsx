import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Constants from 'expo-constants';

import WebViewHost from './WebViewHost';
import { recordImportLog } from '../importLog';
import { colors } from '../theme';
import { safeTop } from '../safeArea';
import type { Course, Semester } from '../types';
import {
  applyCaptured,
  cellsToRows,
  consumeMessage,
  describeMeta,
  emptyCapture,
  layoutTable,
  parseCourseBlocks,
  semesterFromCaptured,
  withSemesterStart,
  type CaptureState,
  type CapturedMessage,
  type DomTable,
  type HookMessage,
  type LaidCell,
} from '../webimport';

/**
 * 只留一条路：统一身份认证 → 登完自动跳回综合信息门户。
 *
 * 关键是 `service` 参数——不带它的话，CAS 登完只会停在「欢迎使用统一身份认证系统」
 * 那一页，哪儿也去不了（2026-11-07 在真机上遇到的就是这个）。
 */
const PORTAL = 'https://info.s.zzu.edu.cn/';
export const LOGIN_URL = `https://cas.s.zzu.edu.cn/cas/login?service=${encodeURIComponent(PORTAL)}`;

/** 门户里绕不到课表时的兜底去处 */
export const JW_DIRECT_URL = 'https://jwxt.zzu.edu.cn/';

/**
 * 课表真正的地址。
 *
 * 2026-11-07 在真机上诊断出来的：`/student/home` 只是个壳，
 * innerText 只有 122 字、table 0 个，课表装在 iframe
 * `https://jwxt.zzu.edu.cn/student/for-std/course-table` 里。
 * 直接把 WebView 指到这个地址，页面自己就是课表，钩子和解析都能落地。
 */
export const COURSE_TABLE_URL = 'https://jwxt.zzu.edu.cn/student/for-std/course-table';

/**
 * 在页面脚本之前注入：劫持 XHR / fetch。
 *
 * 两条腿走路：
 *   1. 每一次请求都记一个 kind:'meta'（只有地址，不含内容），
 *      抓不到课表时用户把这行日志拍给我，就知道学校到底调了什么接口。
 *   2. 命中课表/学期关键词（或者响应体看起来像课表 JSON）的，把原文回传。
 *
 * ⚠️ 郑大教务的课表在 **iframe** 里（/student/for-std/course-table），
 * 只钩主框架等于什么都没钩到。所以这里对同源的子框架也逐个装钩子，
 * 并且定时补装——iframe 往往比主页晚加载。
 */
const HOOK_SCRIPT = `
(function () {
  function send(obj) {
    try { window.ReactNativeWebView.postMessage(JSON.stringify(obj)); } catch (e) {}
  }
  function meta(url, status, len) {
    send({ kind: 'meta', url: String(url || ''), status: status, len: len });
  }
  function post(url, text) {
    try {
      if (!text || String(text).length > 4000000) { return; }
      send({ kind: 'body', url: String(url || ''), body: String(text) });
    } catch (e) {}
  }
  function interesting(url, text) {
    if (/course|schedule|kebiao|timetable|semester|term|xk|kb/i.test(String(url || ''))) { return true; }
    if (!text) { return false; }
    var head = String(text).slice(0, 3000);
    return /course_name|courseName|kcmc|kcb|jsxx|teaching_class|week_num/i.test(head);
  }
  function hookWin(win) {
    try {
      if (!win || win.__soyoHooked) { return; }
      var X = win.XMLHttpRequest;
      if (!X) { return; }
      win.__soyoHooked = true;
      var XO = X.prototype.open;
      var XS = X.prototype.send;
      X.prototype.open = function (method, url) {
        this.__soyoUrl = url;
        return XO.apply(this, arguments);
      };
      X.prototype.send = function () {
        var xhr = this;
        xhr.addEventListener('load', function () {
          try {
            var text = '';
            try { text = xhr.responseText || ''; } catch (e) {}
            meta(xhr.__soyoUrl, xhr.status, text ? text.length : 0);
            if (interesting(xhr.__soyoUrl, text)) { post(xhr.__soyoUrl, text); }
          } catch (e) {}
        });
        return XS.apply(this, arguments);
      };
      if (win.fetch) {
        var F = win.fetch;
        win.fetch = function () {
          var args = arguments;
          var url = (args[0] && args[0].url) || args[0];
          return F.apply(this, args).then(function (res) {
            try {
              res.clone().text().then(function (t) {
                meta(url, res.status, t ? t.length : 0);
                if (interesting(url, t)) { post(url, t); }
              }).catch(function () {});
            } catch (e) {}
            return res;
          });
        };
      }
    } catch (e) {}
  }
  function hookAll() {
    hookWin(window);
    try {
      for (var i = 0; i < window.frames.length; i++) {
        hookWin(window.frames[i]);
      }
    } catch (e) {}
  }
  hookAll();
  if (!window.__soyoTimer) {
    window.__soyoTimer = setInterval(hookAll, 600);
  }
})();
true;
`;

/** 用户点「诊断」时执行的脚本：把页面结构摘要回传，用来判断该怎么抓。 */
const DIAG_SCRIPT = `
(function () {
  function send(obj) {
    try { window.ReactNativeWebView.postMessage(JSON.stringify(obj)); } catch (e) {}
  }
  var lines = [];
  try {
    lines.push('url: ' + location.href);
    lines.push('title: ' + document.title);
    var text = document.body ? (document.body.innerText || '') : '';
    lines.push('innerText: ' + text.length + ' 字符');
    var tables = document.querySelectorAll('table');
    lines.push('table: ' + tables.length);
    var i;
    for (i = 0; i < tables.length && i < 3; i++) {
      var t = tables[i];
      lines.push('  table' + i + ': ' + t.rows.length + '行 × ' + (t.rows[0] ? t.rows[0].cells.length : 0) + '列');
    }
    var iframes = document.querySelectorAll('iframe,frame');
    lines.push('iframe: ' + iframes.length);
    for (i = 0; i < iframes.length && i < 5; i++) {
      lines.push('  iframe' + i + ': ' + String(iframes[i].src || '').slice(0, 120));
    }
    // 课表往往在子框架里，这儿钻进去看一眼
    try {
      for (i = 0; i < window.frames.length && i < 4; i++) {
        try {
          var fw = window.frames[i];
          var fdoc = fw.document;
          if (!fdoc) { continue; }
          lines.push('frame' + i + ': ' + String(fw.location.href || '').slice(0, 120));
          var ft = fdoc.querySelectorAll('table');
          var ftext = (fdoc.body && fdoc.body.innerText) || '';
          lines.push('  innerText: ' + ftext.length + ' / table: ' + ft.length);
          if (ft.length > 0) {
            var f0 = ft[0];
            lines.push('  table0: ' + f0.rows.length + '行 × ' + (f0.rows[0] ? f0.rows[0].cells.length : 0) + '列');
            lines.push('  表样本: ' + (f0.innerText || '').replace(/\\s+/g, ' ').slice(0, 500));
          } else {
            lines.push('  文本样本: ' + ftext.replace(/\\s+/g, ' ').slice(0, 500));
          }
        } catch (e) {
          lines.push('frame' + i + ': 读不到（' + (e && e.message ? e.message : '跨域?') + '）');
        }
      }
    } catch (e) {}
    var tableText = tables.length > 0 ? (tables[0].innerText || '') : '';
    var sample = (tableText || text).replace(/\\s+/g, ' ').slice(0, 600);
    lines.push('样本: ' + sample);
  } catch (e) {
    lines.push('诊断出错: ' + (e && e.message ? e.message : String(e)));
  }
  send({ kind: 'diag', text: lines.join('\\n') });
})();
true;
`;

/** 页面加载完后跑一遍：把课表表格的结构和正文抄回来。 */
const SCRAPE_SCRIPT = `
(function () {
  function send(obj) {
    try { window.ReactNativeWebView.postMessage(JSON.stringify(obj)); } catch (e) {}
  }
  function dump(tbl) {
    var out = [];
    var rows = tbl.rows || [];
    for (var r = 0; r < rows.length; r++) {
      var cells = rows[r].cells || [];
      var row = [];
      for (var c = 0; c < cells.length; c++) {
        var title = '';
        try { title = String(cells[c].getAttribute('title') || '').trim().slice(0, 160); } catch (e) {}
        row.push({
          // 4000 而不是 400：实验课那一格会竖着排四五个实验项目，每段都带课名、
      // 周次、节次、实验室、老师、班级、人数，400 字只够两三段，
      // 后面的周次被截掉就会「整周整周地少课」。
      text: String(cells[c].innerText || '').trim().slice(0, 4000),
          colspan: cells[c].colSpan || 1,
          rowspan: cells[c].rowSpan || 1,
          title: title
        });
      }
      out.push(row);
    }
    return out;
  }
  // 页面上所有能摸到的 table（含同源 iframe 里的）
  function collect() {
    var found = [];
    function scan(doc) {
      if (!doc) { return; }
      var tables = doc.querySelectorAll('table');
      for (var i = 0; i < tables.length; i++) {
        found.push({ table: tables[i], doc: doc });
      }
    }
    try { scan(document); } catch (e) {}
    try {
      var frames = window.frames;
      for (var i = 0; i < frames.length; i++) {
        try { scan(frames[i].document); } catch (e) {}
      }
    } catch (e) {}
    return found;
  }
  function score(item) {
    var text = '';
    try { text = item.table.innerText || ''; } catch (e) {}
    var days = (text.match(/(?:星期|周)[一二三四五六日天]/g) || []).length;
    var tds = 0;
    try { tds = item.table.querySelectorAll('td').length; } catch (e) {}
    // 有星期表头的优先，其次看格子多少
    return days * 100000 + tds;
  }
  function bestOf(list) {
    var best = list[0];
    for (var i = 1; i < list.length; i++) {
      if (score(list[i]) > score(best)) { best = list[i]; }
    }
    return best;
  }
  // 教务页顶上那个「含实验」开关默认是没勾的，不勾实验课根本不会渲染进表格，
  // 抄出来自然就少了——每次抄之前先把它勾上（已经勾着就不动）。
  function ensureLab() {
    try {
      var boxes = document.querySelectorAll('input[type=checkbox]');
      for (var b = 0; b < boxes.length; b++) {
        var box = boxes[b];
        var label = box.closest ? box.closest('label') : null;
        var text = String((label && label.innerText) || '');
        if (!text && box.parentElement) { text = String(box.parentElement.innerText || ''); }
        if (text.length > 12 || text.indexOf('含实验') < 0) { continue; }
        if (box.checked) { return '已勾着'; }
        box.click();
        // 点完还是没勾上，说明这层只是装饰，真正的开关在别处；
        // 这时不能按住等待，否则会一直等到超时也抄不到课表。
        if (!box.checked) {
          window.__soyoLabTried = 1;
          return '点了没生效';
        }
        return '刚勾上';
      }
      // 自绘的方块没有 input，只能在第一轮点一次，否则每 2.5 秒会被来回切换
      if (window.__soyoLabTried) { return '没找到 input（已试过点方块）'; }
      var all = document.querySelectorAll('span,div,a,button,label');
      for (var i = 0; i < all.length && i < 4000; i++) {
        var t = String(all[i].innerText || '').trim();
        if (t.length <= 6 && t.indexOf('含实验') >= 0 && all[i].click) {
          window.__soyoLabTried = 1;
          all[i].click();
          return '点了自绘方块';
        }
      }
      return '没找到开关';
    } catch (e) {
      return '异常:' + String(e && e.message);
    }
  }
  var labState = ensureLab();
  // 刚勾上「含实验」的那一轮，DOM 里还是不含实验的旧表——页面正在重新拉数据。
  // 这时候抄回去就会把实验课整节漏掉，而且抄到东西后抓取会停，
  // 于是这一漏就是永久漏。先按住 6 秒，等页面把带实验的课表换上来再抄。
  if (labState === '刚勾上' || labState === '点了自绘方块') {
    window.__soyoLabHold = Date.now() + 6000;
    return;
  }
  if (window.__soyoLabHold && Date.now() < window.__soyoLabHold) { return; }
  var items = collect();
  if (!items.length) { return; }
  // 带「星期X」表头的才是课表；一门课可能被拆在几张表里，全都带回去
  var picked = [];
  for (var i = 0; i < items.length; i++) {
    var sc = score(items[i]);
    if (sc >= 3 * 100000) { picked.push(items[i]); }
  }
  if (!picked.length) { picked.push(bestOf(items)); }
  picked.sort(function (a, b) { return score(b) - score(a); });
  picked = picked.slice(0, 4);

  var tables = [];
  for (var j = 0; j < picked.length; j++) {
    tables.push({ rows: dump(picked[j].table) });
  }
  var text = '';
  try { text = (picked[0].doc.body && picked[0].doc.body.innerText) || ''; } catch (e) {}
  var payload = {
    kind: 'dom',
    tables: tables,
    text: String(text).slice(0, 4000),
    lab: labState
  };
  var json = '';
  try { json = JSON.stringify(payload); } catch (e) { return; }
  // 同一批表不重复回传（会每 2.5 秒抄一次）
  if (window.__soyoLastDom === json) { return; }
  window.__soyoLastDom = json;
  try { window.ReactNativeWebView.postMessage(json); } catch (e) {}
})();
true;
`;

export interface WebImportSheetProps {
  visible: boolean;
  semester: Semester;
  onClose: () => void;
  onImported: (semester: Semester, courses: Course[]) => void;
}

type ImportFailureKind = 'network' | 'login' | 'parse';

type ImportFailure = {
  kind: ImportFailureKind;
  detail: string;
};

/** 三种失败的标题、说明、按钮文案都不一样，组合成一张小卡片 */
const FAILURE_COPY: Record<ImportFailureKind, { title: string; hint: string; action: string }> = {
  network: {
    title: '页面没能打开',
    hint: '可能是网络不通，或学校门户暂时打不开。',
    action: '重新加载',
  },
  login: {
    title: '登录状态失效了',
    hint: '门户把请求退回登录页了，重新登录一次。',
    action: '重新登录',
  },
  parse: {
    title: '抓到了，但没能读成课程',
    hint: '表格结构和预期不一样。可以再试一次，或去看日志。',
    action: '重试',
  },
};

/** 单元格文字压成一行，太长的截断 */
function clip(value: unknown, max: number): string {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return '·';
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** [5,6,7,8,10] → "5-8,10"，日志里看周次比一长串数字直观 */
function compactWeeks(weeks: number[]): string {
  const sorted = [...new Set(weeks)].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < sorted.length; i += 1) {
    let end = i;
    while (end + 1 < sorted.length && sorted[end + 1] === sorted[end] + 1) end += 1;
    parts.push(end > i ? `${sorted[i]}-${sorted[end]}` : `${sorted[i]}`);
    i = end;
  }
  return parts.join(',');
}

const WEEK_LABELS = ['一', '二', '三', '四', '五', '六', '日'];

/**
 * 把抓到的表格摊平成可读的结构摘要。
 *
 * 导入错位时最需要两样东西并排看：每行到底给了几格、哪一格跨了几列，
 * 以及解析器把每一格判成了「周几、第几行」。只看其中一边，分不清是
 * 页面结构怪还是我们的列映射错。
 */
function describeGrid(
  tables: DomTable[],
  laid: LaidCell[][],
  rowCounts: number[],
): string[] {
  const lines: string[] = [];
  tables.slice(0, 4).forEach((table, index) => {
    const rows = table.rows ?? [];
    lines.push(`表${index + 1}：${rows.length} 行，解析出 ${rowCounts[index] ?? 0} 条`);
    rows.forEach((row, rowIndex) => {
      const parts = row.map((cell) => {
        const span = `${(cell.colspan ?? 1) > 1 ? `c${cell.colspan}` : ''}${
          (cell.rowspan ?? 1) > 1 ? `r${cell.rowspan}` : ''
        }`;
        const title = String(cell.title ?? '').replace(/\s+/g, ' ').trim();
        const titleMark = title ? `~${clip(title, 40)}` : '';
        return `${clip(cell.text, 16)}${span ? `(${span})` : ''}${titleMark}`;
      });
      lines.push(`  r${rowIndex}: ${parts.join(' | ')}`);
    });
    const cells = laid[index] ?? [];
    if (cells.length > 0) {
      lines.push('  — 逐格落位 —');
      for (const cell of cells) {
        const blocks = parseCourseBlocks(cell.text);
        const parsed =
          blocks.length === 0
            ? '→ 解析不出课名（这一格会被整格丢掉）'
            : blocks
                .map((block) => {
                  const weeks = block.sessions
                    .map((session) => (session.weeks.length > 0 ? compactWeeks(session.weeks) : '全'))
                    .join('/');
                  const periods = block.sessions
                    .map((session) =>
                      session.startPeriod === undefined
                        ? '按格子'
                        : `${session.startPeriod}-${session.endPeriod ?? session.startPeriod}`,
                    )
                    .join('/');
                  return `${block.name || '(无名)'}[${weeks || '全'}周 ${periods || '按格子'}节]`;
                })
                .join(' ');
        lines.push(
          `  周${cell.weekday} 行${cell.row ?? '?'} 跨${cell.span ?? 1}: ${clip(cell.text, 120)} ${parsed}`,
        );
      }
    }
  });
  return lines;
}

export default function WebImportSheet({
  visible,
  semester,
  onClose,
  onImported,
}: WebImportSheetProps) {
  const topPad = safeTop();
  const [capture, setCapture] = useState<CaptureState>(emptyCapture);
  /** 当前要打开的地址；换地址靠给 WebView 换 key 重挂 */
  const [url, setUrl] = useState(LOGIN_URL);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  /** 抓不到课表时的排查线索：页面发过哪些请求 */
  const [logs, setLogs] = useState<string[]>([]);
  /** 抓到的表格结构快照。几十行、还要横向看，日志区塞不下，单独收一份 */
  const [diag, setDiag] = useState<string[]>([]);
  /** 从页面正文里读到的学期起点（比 App 里的示例学期准） */
  const [usedSemester, setUsedSemester] = useState<Semester | undefined>(undefined);
  /**
   * 失败按类别记下来：网络、登录态、解析三种对用户的处置完全不一样，
   * 混成一行「失败了」用户不知道下一步该干嘛。
   */
  const [failure, setFailure] = useState<ImportFailure | null>(null);
  /** 换一个值就能让 WebView 重新挂载，等于「在同一地址上重试」 */
  const [reloadNonce, setReloadNonce] = useState(0);
  const webRef = useRef<any>(null);
  const scrapeTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  /** 有没有真的抄到过课表；没有的话收尾时自动跑一次诊断 */
  const foundRef = useRef(false);

  const stopScrape = useCallback(() => {
    if (scrapeTimer.current) {
      clearInterval(scrapeTimer.current);
      scrapeTimer.current = null;
    }
  }, []);

  /**
   * 课表藏在 iframe 里，切页不会触发外层的 onLoadEnd，
   * 所以加载完后隔一会儿再抄一次，最多抄 20 次（约 50 秒）。
   * 一次都没抄到的话，最后自动跑一次诊断，把结构留在诊断里。
   */
  const startScrape = useCallback(() => {
    stopScrape();
    foundRef.current = false;
    let tries = 0;
    const run = () => {
      webRef.current?.injectJavaScript?.(SCRAPE_SCRIPT);
      tries += 1;
      if (tries < 20) return;
      stopScrape();
      if (!foundRef.current) {
        webRef.current?.injectJavaScript?.(DIAG_SCRIPT);
      }
    };
    run();
    scrapeTimer.current = setInterval(run, 2500);
  }, [stopScrape]);

  useEffect(() => stopScrape, [stopScrape]);

  const reset = useCallback(() => {
    stopScrape();
    foundRef.current = false;
    setCapture(emptyCapture());
    setProgress(0);
    setLogs([]);
    setDiag([]);
    setUsedSemester(undefined);
    setFailure(null);
    setUrl(LOGIN_URL);
  }, [stopScrape]);

  const pushLog = useCallback((line: string) => {
    setLogs((prev) => {
      const next = [...prev, line];
      return next.length > 60 ? next.slice(next.length - 60) : next;
    });
  }, []);

  const handleMessage = useCallback(
    (data: string) => {
      let message: HookMessage | null = null;
      try {
        const parsed = JSON.parse(data) as HookMessage;
        if (parsed && typeof parsed.kind === 'string') message = parsed;
      } catch {
        message = null;
      }
      if (!message) return;

      if (message.kind === 'meta') {
        pushLog(describeMeta(message));
        return;
      }
      if (message.kind === 'diag') {
        setLogs((prev) => [...prev, '— 诊断 —', ...message.text.split('\n')]);
        return;
      }
      if (message.kind === 'dom') {
        const usedSemester = withSemesterStart(semester, message.text ?? '');
        const tables = message.tables ?? [];
        const laidTables: LaidCell[][] = [];
        const rowCounts: number[] = [];
        const collected: ReturnType<typeof cellsToRows> = [];
        for (const table of tables) {
          const laid = layoutTable(table as DomTable);
          laidTables.push(laid);
          if (laid.length === 0) {
            rowCounts.push(0);
            continue;
          }
          const rows = cellsToRows(laid, usedSemester);
          rowCounts.push(rows.length);
          collected.push(...rows);
        }
        // 结构快照整份存下来，日志面板只留一句提示
        const preview = collected.length > 0 ? applyCaptured(collected, usedSemester) : undefined;
        const previewLines = preview
          ? [
              `— 入库结果（${preview.courses.length} 门）—`,
              ...preview.courses.map(
                (course) =>
                  `  周${WEEK_LABELS[course.weekday - 1] ?? course.weekday} ${course.periodStart}-${course.periodEnd} 节 · ${course.name} · ${course.weeks.length} 周（${compactWeeks(course.weeks) || '无'}）`,
              ),
            ]
          : ['— 入库结果：0 门 —'];
        setDiag([
          `soyo 导入诊断 · ${Constants.expoConfig?.version ?? '?'}`,
          `时间：${new Date().toLocaleString()}`,
          `地址：${url}`,
          `学期：${usedSemester?.name ?? semester.name} 起 ${usedSemester?.startDate ?? semester.startDate} 共 ${usedSemester?.totalWeeks ?? semester.totalWeeks} 周`,
          `页面正文长度：${(message.text ?? '').length}`,
          `含实验开关：${message.lab ?? '未知'}`,
          '— 表格结构 —',
          ...describeGrid(tables, laidTables, rowCounts),
          ...previewLines,
        ]);
        pushLog(`表格结构：${rowCounts.join(' / ') || '无'} 条`);
        if (collected.length === 0) return;
        foundRef.current = true;
        stopScrape();
        setFailure(null);
        setUsedSemester(usedSemester);
        const body = JSON.stringify({ rows: collected });
        setCapture((prev) => consumeMessage(prev, { kind: 'body', url: 'dom', body }));
        return;
      }
      setUsedSemester(undefined);
      setCapture((prev) => consumeMessage(prev, message as CapturedMessage));
    },
    [pushLog, semester, stopScrape, url],
  );

  const handleApply = useCallback(() => {
    if (capture.rows.length === 0) return;
    setBusy(true);
    try {
      const fallback = semesterFromCaptured(capture.semesters, capture.rows);
      const result = applyCaptured(capture.rows, usedSemester ?? fallback);
      reset();
      onImported(result.semester, result.courses);
      onClose();
    } catch (error) {
      // 抓到数据却读不成课程：单独一类，重试就是再解析一遍
      setFailure({
        kind: 'parse',
        detail: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setBusy(false);
    }
  }, [capture, onClose, onImported, reset, usedSemester]);

  /** 页面本身打不开（断网 / 门户挂了），WebView 会直接报错 */
  const handleWebError = useCallback((description: string) => {
    setFailure({ kind: 'network', detail: description || '页面加载失败' });
  }, []);

  /**
   * HTTP 层失败。WebView 会对子资源（图标、脚本）也报这个，
   * 所以只认「登录态失效」和「服务器挂了」两种，别的当噪音放掉。
   */
  const handleHttpError = useCallback((status: number) => {
    if (status === 401 || status === 403) {
      setFailure({ kind: 'login', detail: `门户返回了 HTTP ${status}` });
      return;
    }
    if (status >= 500) {
      setFailure({ kind: 'network', detail: `门户返回了 HTTP ${status}` });
    }
  }, []);

  /** 三种失败的补救动作不一样：重载页面 / 回登录页 / 再解析一次 */
  const retryFailure = useCallback(() => {
    const kind = failure?.kind;
    if (!kind) return;
    if (kind === 'parse') {
      handleApply();
      return;
    }
    setFailure(null);
    if (kind === 'login') {
      setUrl(LOGIN_URL);
    }
    setReloadNonce((n) => n + 1);
  }, [failure?.kind, handleApply]);

  /**
   * 诊断快照留档：导入页不再摆日志面板，用户真要看现场，
   * 去「设置 → 关于 → 导入诊断」导出。结构快照 + 请求日志一起收。
   */
  useEffect(() => {
    if (diag.length === 0 && logs.length === 0) return;
    void recordImportLog([...diag, '— 抓取日志 —', ...logs]);
  }, [diag, logs]);

  const statusText = useMemo(() => {
    if (capture.rows.length > 0) {
      return `已抓到 ${capture.rows.length} 条课表记录`;
    }
    if (capture.hits > 0) {
      return '收到了响应，但里面没有课表数据';
    }
    if (logs.length > 0) {
      return `页面发了 ${logs.length} 个请求，还没识别出课表`;
    }
    return '登录后进入「我的课表」页面，会自动抓取';
  }, [capture, logs.length]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <View style={[styles.root, { paddingTop: topPad }]}>
        <View style={styles.topBar}>
          <Pressable onPress={onClose} hitSlop={10} style={styles.topBtn}>
            <Text style={styles.topBtnText}>关闭</Text>
          </Pressable>
          <Text style={styles.title}>网页导入</Text>
          <Pressable onPress={reset} hitSlop={10} style={styles.topBtn}>
            <Text style={styles.topBtnText}>重来</Text>
          </Pressable>
        </View>

        {progress > 0 && progress < 1 ? (
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
          </View>
        ) : null}

        <View style={styles.webWrap}>
          <WebViewHost
            key={`${url}#${reloadNonce}`}
            webRef={webRef}
            source={url}
            injectedJavaScriptBeforeContentLoaded={HOOK_SCRIPT}
            onMessage={handleMessage}
            onLoadProgress={(value) => setProgress(value)}
            onError={handleWebError}
            onHttpError={handleHttpError}
            onLoadEnd={() => {
              // 课表页是直出的 HTML，没有请求可钩——加载完直接抄表格，
              // 之后每 2.5 秒再抄一次（iframe 里的页面切换不会触发这里）。
              startScrape();
            }}
            style={styles.web}
          />
        </View>

        {failure ? (
          <View style={styles.failPanel}>
            <View style={styles.failText}>
              <Text style={styles.failTitle}>{FAILURE_COPY[failure.kind].title}</Text>
              <Text style={styles.failDetail} numberOfLines={3}>
                {failure.detail ? `${failure.detail} · ` : ''}
                {FAILURE_COPY[failure.kind].hint}
              </Text>
            </View>
            <Pressable onPress={retryFailure} hitSlop={8} style={styles.failBtn}>
              <Text style={styles.failBtnText}>{FAILURE_COPY[failure.kind].action}</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.footer}>
          <View style={styles.footerText}>
            <Text style={styles.status} numberOfLines={2}>
              {statusText}
            </Text>
            <Text style={styles.statusHint}>导入出问题时，可到「设置 → 关于」导出诊断</Text>
          </View>
          <Pressable
            onPress={handleApply}
            disabled={capture.rows.length === 0 || busy}
            style={[
              styles.applyBtn,
              (capture.rows.length === 0 || busy) && styles.applyBtnDisabled,
            ]}
          >
            {busy ? (
              <ActivityIndicator color={colors.surface} />
            ) : (
              <Text style={styles.applyText}>应用到课表</Text>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  topBar: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  topBtn: {
    minWidth: 44,
  },
  topBtnText: {
    fontSize: 14,
    color: colors.accent,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  progressTrack: {
    height: 2,
    backgroundColor: colors.border,
  },
  progressFill: {
    height: 2,
    backgroundColor: colors.accent,
  },
  webWrap: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  web: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    gap: 12,
  },
  footerText: {
    flex: 1,
  },
  status: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  statusHint: {
    marginTop: 3,
    fontSize: 10.5,
    color: colors.textTertiary,
  },
  failPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 12,
    marginBottom: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: colors.dangerSoft,
  },
  failText: { flex: 1 },
  failTitle: { fontSize: 13, fontWeight: '600', color: colors.danger },
  failDetail: { fontSize: 12, color: colors.ink, marginTop: 3, lineHeight: 17 },
  failBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: colors.danger,
  },
  failBtnText: { fontSize: 12, fontWeight: '600', color: colors.surface },
  applyBtn: {
    minWidth: 108,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    paddingHorizontal: 16,
  },
  applyBtnDisabled: {
    backgroundColor: colors.borderStrong,
  },
  applyText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.surface,
  },
});
