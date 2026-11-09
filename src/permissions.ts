import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Notifications from 'expo-notifications';
import { Linking, Platform } from 'react-native';
import { ensurePermission, type PermissionState } from './notifications';

/**
 * 精确闹钟权限。
 *
 * 'unsupported' = 系统低于 Android 12 / iOS / 网页（这些平台本来就是精确的）；
 * 'unknown' = 拿不到状态（旧版 expo-notifications 或调用抛错），UI 上别武断说没给。
 */
export type AlarmState = 'granted' | 'denied' | 'unsupported' | 'unknown';

export interface PermissionSnapshot {
  /** 'unknown' = 还没读出来，UI 别急着下结论 */
  notifications: PermissionState | 'unknown';
  exactAlarm: AlarmState;
}

export type PermissionKey = 'notifications' | 'exactAlarm';

export const PACKAGE_NAME =
  Constants.expoConfig?.android?.package ?? 'com.soyo.timetable';

/**
 * 精确闹钟 API 是 expo-notifications 较新才有的；宿主里没有时不能直接调用，
 * 否则会 TypeError 让整个设置页崩掉。
 */
function hasExactAlarmApi(): boolean {
  return (
    Platform.OS === 'android' &&
    typeof (Notifications as Record<string, unknown>).getExactAlarmPermissionsAsync === 'function'
  );
}

function toAlarmState(res: { granted?: boolean; status?: string } | null | undefined): AlarmState {
  if (!res) return 'unknown';
  if (res.granted) return 'granted';
  if (res.status === 'undetermined' || res.status === 'unknown') return 'unknown';
  return 'denied';
}

/**
 * 读当前权限。
 *
 * 不发任何请求、不弹系统框 —— 只给 UI 显示状态用。
 * 网页版（开发预览）下给 unsupported，不要拿浏览器表现骗自己。
 */
export async function readPermissions(): Promise<PermissionSnapshot> {
  if (Platform.OS === 'web' || (Platform.OS !== 'android' && Platform.OS !== 'ios')) {
    return { notifications: 'unsupported', exactAlarm: 'unsupported' };
  }

  let notifications: PermissionState = 'denied';
  try {
    const res = await Notifications.getPermissionsAsync();
    notifications = res.granted ? 'granted' : 'denied';
  } catch {
    notifications = 'unsupported';
  }

  if (Platform.OS !== 'android') {
    return { notifications, exactAlarm: 'unsupported' };
  }
  if (!hasExactAlarmApi()) {
    return { notifications, exactAlarm: 'unknown' };
  }

  try {
    const res = await (Notifications as any).getExactAlarmPermissionsAsync();
    return { notifications, exactAlarm: toAlarmState(res) };
  } catch {
    return { notifications, exactAlarm: 'unknown' };
  }
}

/** 申请通知权限（会弹系统框）；已经拒绝过且不能再问时直接返回 denied */
export async function requestNotificationPermission(): Promise<PermissionState> {
  return ensurePermission();
}

/**
 * 申请精确闹钟权限。
 *
 * Android 的做法是跳到系统「闹钟和提醒」页，用户回来之后 Promise 才 resolve；
 * 所以调用方拿到结果后要重排一次提醒（状态可能刚变）。
 */
export async function requestExactAlarmPermission(): Promise<AlarmState> {
  if (Platform.OS !== 'android' || !hasExactAlarmApi()) {
    return Platform.OS === 'android' ? 'unknown' : 'unsupported';
  }
  try {
    const res = await (Notifications as any).requestExactAlarmPermissionsAsync();
    return toAlarmState(res);
  } catch {
    return 'denied';
  }
}

/** 应用信息页：所有权限的总入口，也是各种深链失败时的兜底 */
export async function openAppSettings(): Promise<void> {
  try {
    await Linking.openSettings();
  } catch {
    // 打不开就什么也做不了，静默
  }
}

async function startActivity(action: string, data?: string): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    await IntentLauncher.startActivityAsync(action, data ? { data } : undefined);
    return true;
  } catch {
    return false;
  }
}

const PROMPT_KEY = 'soyo.permissionPrompt.v1';

/** 第一次启动自动要权限只做一次：之后每次开 App 都弹会变成骚扰 */
export async function loadPermissionPrompted(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(PROMPT_KEY)) === '1';
  } catch {
    return true; // 读不出来就当已提示过，宁可少弹一次
  }
}

export async function markPermissionPrompted(): Promise<void> {
  try {
    await AsyncStorage.setItem(PROMPT_KEY, '1');
  } catch {
    // 记不上就算了，最多下次再引导一次
  }
}

/**
 * 电池优化白名单。
 *
 * 国产 ROM 会在息屏后把精确闹钟也往后推，30 分钟的提醒尤其容易整条不响；
 * 只有把 soyo 加进「不优化」才会按时。深链失败就退到应用信息页。
 */
export async function openBatteryOptimizationSettings(): Promise<void> {
  const ok = await startActivity(
    'android.settings.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS',
    `package:${PACKAGE_NAME}`
  );
  if (!ok) await openAppSettings();
}

/**
 * 自启动 / 后台运行（小米叫「自启动」，华为叫「应用启动管理」）。
 *
 * MIUI 的这个 action 没有公开 API，机型差异大；点亮了最好，点不开就退到应用信息页。
 */
export async function openAutoStartSettings(): Promise<void> {
  const ok = await startActivity('miui.intent.action.OP_AUTO_START');
  if (!ok) await openAppSettings();
}
