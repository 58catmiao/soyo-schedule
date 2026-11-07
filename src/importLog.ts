import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Share } from 'react-native';

/**
 * 最近一次网页导入的诊断快照。
 *
 * 导入页本身不再摆日志面板（那是开发时看的），但真出问题时得拿得到现场：
 * 这里存一份完整的结构快照 + 抓取日志，落盘保留到最后一次导入为止，
 * 用户可以在「设置 → 关于 → 导入诊断」里一键发出来。
 */
export interface ImportLogEntry {
  /** 毫秒时间戳 */
  at: number;
  /** 记下这份快照时的 App 版本 */
  version: string;
  text: string;
}

const KEY = 'soyo.importLog.v1';
/** 一次导入的结构快照撑死十几 KB，太长的直接截断，别把本地存储撑爆 */
const MAX_CHARS = 24000;

export async function recordImportLog(lines: string[]): Promise<void> {
  if (lines.length === 0) return;
  const text = lines.join('\n').slice(0, MAX_CHARS);
  const entry: ImportLogEntry = {
    at: Date.now(),
    version: Constants.expoConfig?.version ?? '?',
    text,
  };
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(entry));
  } catch {
    // 存不下就算了，界面上会显示「暂无」，不影响导入本身
  }
}

export async function loadImportLog(): Promise<ImportLogEntry | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ImportLogEntry;
    if (!parsed || typeof parsed.text !== 'string' || typeof parsed.at !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

/** 「09-07 21:44」这种一眼能对上的时间 */
export function formatLogTime(at: number): string {
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 走系统分享发出去；没有可用目标时返回 false，让调用方给个提示 */
export async function shareImportLog(entry: ImportLogEntry | null): Promise<boolean> {
  const text = entry
    ? entry.text
    : [
        `soyo 导入诊断 · ${Constants.expoConfig?.version ?? '?'}`,
        '（这台手机上还没有导入记录）',
      ].join('\n');
  try {
    await Share.share({ title: 'soyo 导入诊断', message: text });
    return true;
  } catch {
    return false;
  }
}
