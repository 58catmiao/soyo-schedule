import AsyncStorage from '@react-native-async-storage/async-storage';
import { Linking } from 'react-native';

/**
 * 应用内更新：从 GitHub Releases 拿最新版本号，跟当前版本比一比。
 * 只做「检查 + 打开下载页」，不在应用里直接装 APK——
 * 安卓装 APK 要额外声明安装权限、还得处理 FileProvider，
 * 交给系统浏览器下载管理器更稳（下载完点通知就能装）。
 */

export const REPO = '58catmiao/soyo-schedule';
export const RELEASES_PAGE = `https://github.com/${REPO}/releases`;

const RELEASES_API = `https://api.github.com/repos/${REPO}/releases/latest`;
const LAST_CHECK_KEY = 'soyo.updateCheckedAt';
/** 自动检查的间隔：6 小时。手动点「检查更新」不受它限制。 */
export const AUTO_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

export interface UpdateInfo {
  version: string;
  notes: string;
  apkUrl: string | null;
  pageUrl: string;
}

export type UpdateStatus = 'idle' | 'checking' | 'latest' | 'available' | 'error';

/** "v1.9.1" / "1.9.1" → [1, 9, 1] */
export function versionParts(version: string): number[] {
  return version
    .replace(/^v/i, '')
    .split('.')
    .map((part) => Number.parseInt(part, 10) || 0);
}

/** 大于返回 1，相等返回 0，小于返回 -1 */
export function compareVersions(a: string, b: string): number {
  const left = versionParts(a);
  const right = versionParts(b);
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

function shorten(text: string, max = 400): string {
  const flat = text.replace(/\r/g, '').trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

/**
 * 查 GitHub 上最新的 release。
 * 拿不到（网络不通、没发过 release、被限流）就抛错，交给调用方显示人话。
 */
export async function fetchLatestRelease(currentVersion: string): Promise<UpdateInfo | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const response = await fetch(RELEASES_API, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'soyo-schedule',
      },
      signal: controller.signal,
    });
    if (response.status === 404) return null; // 还没发过 release
    if (!response.ok) throw new Error(`GitHub ${response.status}`);
    const data = (await response.json()) as {
      tag_name?: string;
      body?: string;
      html_url?: string;
      assets?: { name?: string; browser_download_url?: string }[];
    };
    const version = (data.tag_name ?? '').replace(/^v/i, '').trim();
    if (!version) return null;
    const apk = (data.assets ?? []).find((asset) => (asset.name ?? '').toLowerCase().endsWith('.apk'));
    if (compareVersions(version, currentVersion) <= 0) return null;
    return {
      version,
      notes: shorten(data.body ?? ''),
      apkUrl: apk?.browser_download_url ?? null,
      pageUrl: data.html_url ?? RELEASES_PAGE,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function readLastCheck(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(LAST_CHECK_KEY);
    const value = raw ? Number.parseInt(raw, 10) : 0;
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

export async function writeLastCheck(at: number): Promise<void> {
  try {
    await AsyncStorage.setItem(LAST_CHECK_KEY, String(at));
  } catch {
    // 记不下来就下次再查，不影响使用
  }
}

/** 打开下载地址；没挂 APK 就退到 release 页面 */
export async function openUpdate(info: UpdateInfo): Promise<boolean> {
  const url = info.apkUrl ?? info.pageUrl;
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}
