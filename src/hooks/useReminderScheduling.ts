import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import type { AppData } from '../types';
import type { ReminderPrefs } from '../reminderPrefs';
import { RESCHEDULE_OPTIONS, buildReminders, reminderSignature } from '../reminders';
import {
  cancelAllReminders,
  isNotificationSupported,
  scheduleReminders,
  sendTestReminder,
} from '../notifications';
import {
  loadPermissionPrompted,
  markPermissionPrompted,
  readPermissions,
  requestExactAlarmPermission,
  requestNotificationPermission,
  type PermissionSnapshot,
} from '../permissions';
import { formatTime } from '../schedule';

export type NotificationPermission = 'granted' | 'denied' | 'unsupported' | 'unknown';

/**
 * 通知 / 精确闹钟的权限状态，以及「课表一变就重排提醒」的那套逻辑。
 *
 * 抽出来是因为 App 里光这块就有三件事：首次启动要权限、回前台重读权限、
 * 排期指纹不变就不重复打扰系统。放在一起看比塞在 App 里清楚。
 */
export function useReminderScheduling(data: AppData | null, prefs: ReminderPrefs) {
  const [permission, setPermission] = useState<NotificationPermission>(
    isNotificationSupported() ? 'unknown' : 'unsupported'
  );
  /**
   * 权限快照：通知 / 精确闹钟。设置页和权限面板都读它。
   * 单独存一份是因为 ReminderBar 只认三态的 `permission`，而精确闹钟是第二件事。
   */
  const [permissions, setPermissions] = useState<PermissionSnapshot>({
    notifications: 'unknown',
    exactAlarm: 'unknown',
  });
  const [permissionSheetVisible, setPermissionSheetVisible] = useState(false);
  const [scheduledCount, setScheduledCount] = useState<number | null>(null);
  const [testState, setTestState] = useState<'idle' | 'sent' | 'failed'>('idle');
  /** 最近一条将发的提醒，给设置页做「下一条」 */
  const [nextReminderLabel, setNextReminderLabel] = useState<string | null>(null);

  /**
   * 回到前台时叫醒一次：排期窗口 21 天，只是「打开 App 时往前滚」，
   * 后台不会自己续排——超过 21 天完全没打开，后面的课就断了。
   * 顺手也重读一次权限：用户去系统设置里开了通知、再切回来，状态才会跟着变。
   */
  const [resumeTick, setResumeTick] = useState(0);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setResumeTick((n) => n + 1);
    });
    return () => sub.remove();
  }, []);

  /** 读一次权限，快照和 ReminderBar 用的三态一起更新 */
  const refreshPermissions = useCallback(async () => {
    const snap = await readPermissions();
    setPermissions(snap);
    if (snap.notifications !== 'unknown') setPermission(snap.notifications);
    return snap;
  }, []);

  /**
   * 首次启动自动把权限要一遍。
   *
   * 1.9.x 从来没主动要过通知权限，用户装完看到的就是「没震动、提醒不响」。
   * 通知权限用系统弹窗（系统只让问一次）；精确闹钟在 Android 12+ 是跳系统页，
   * 无理由硬跳很突兀，所以只把面板打开、让用户自己点。
   */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (Platform.OS !== 'android' && Platform.OS !== 'ios') {
        setPermissions({ notifications: 'unsupported', exactAlarm: 'unsupported' });
        setPermission('unsupported');
        return;
      }

      const snap = await readPermissions();
      if (cancelled) return;
      setPermissions(snap);
      if (snap.notifications !== 'unknown') setPermission(snap.notifications);

      const prompted = await loadPermissionPrompted();
      if (prompted || cancelled) return;

      if (snap.notifications !== 'granted') {
        const state = await requestNotificationPermission();
        if (cancelled) return;
        setPermission(state);
      }
      await markPermissionPrompted();

      const after = await readPermissions();
      if (cancelled) return;
      setPermissions(after);
      if (after.notifications !== 'granted' || after.exactAlarm === 'denied') {
        setPermissionSheetVisible(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 从系统设置切回来：权限可能刚变，重读一次（排期 effect 也会因快照变化重跑）
  useEffect(() => {
    if (resumeTick === 0) return;
    void refreshPermissions();
  }, [resumeTick, refreshPermissions]);

  const lastSignature = useRef<string>('');
  /** 上一次看到的精确闹钟状态：从「没有」变成「有」时，已排的非精确闹钟要重排 */
  const lastAlarmState = useRef<string | null>(null);

  /**
   * 课表或提醒设置一变就重排通知。
   *
   * 只在原生端真做（网页版没有通知通道）。排期指纹没变的就不重复打扰系统。
   */
  useEffect(() => {
    if (!data) return;
    let cancelled = false;

    (async () => {
      if (!prefs.enabled) {
        await cancelAllReminders();
        lastSignature.current = '';
        if (!cancelled) {
          setScheduledCount(0);
          setNextReminderLabel(null);
        }
        return;
      }

      // 这里只读、不申请：权限申请统一走首次引导和设置页，
      // 否则一改课表就可能蹦出系统弹窗，而且会和引导流程抢同一次请求。
      const snap = await readPermissions();
      if (cancelled) return;
      setPermissions(snap);
      if (snap.notifications !== 'unknown') setPermission(snap.notifications);
      if (
        snap.exactAlarm === 'granted' &&
        lastAlarmState.current &&
        lastAlarmState.current !== 'granted'
      ) {
        // 权限是在系统设置里补给的（没走设置页按钮），也得把非精确的闹钟换成精确的
        lastSignature.current = '';
      }
      lastAlarmState.current = snap.exactAlarm;
      if (snap.notifications !== 'granted') {
        if (!cancelled) {
          setScheduledCount(null);
          setNextReminderLabel(null);
        }
        return;
      }

      // 窗口 21 天：只用打开 App 时滚排，窗口太短的话一周不开就断档
      const reminders = buildReminders(data.courses, data.semester, new Date(), {
        ...RESCHEDULE_OPTIONS,
        leadMinutes: prefs.leadMinutes,
      });

      if (!cancelled) {
        const first = reminders[0];
        if (first) {
          const name = first.title.split('·').slice(1).join('·').trim() || '上课';
          setNextReminderLabel(
            `${first.fireAt.getMonth() + 1} 月 ${first.fireAt.getDate()} 日 ${formatTime(
              first.fireAt
            )} · ${name}`
          );
        } else {
          setNextReminderLabel(null);
        }
      }

      const signature = reminderSignature(reminders);
      if (signature === lastSignature.current) return;

      // 指纹要等真的排上了再记：先记账再排的话，一旦失败就再也不会重试，
      // 用户看着「已排 30 条」，其实一条都没进系统。
      try {
        const count = await scheduleReminders(reminders);
        lastSignature.current = signature;
        if (!cancelled) setScheduledCount(count);
      } catch {
        lastSignature.current = '';
        if (!cancelled) setScheduledCount(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    data,
    prefs.enabled,
    prefs.leadMinutes,
    resumeTick,
    permissions.notifications,
    permissions.exactAlarm,
  ]);

  /** 课表整个换了 / 学期挪了：让下一次排期别被指纹挡住 */
  const invalidateSchedule = useCallback(() => {
    lastSignature.current = '';
  }, []);

  const handleRequestNotifications = useCallback(async () => {
    const state = await requestNotificationPermission();
    setPermission(state);
    // 刚拿到通知权限时，之前的提醒其实一条都没排上，必须让它重排
    lastSignature.current = '';
    await refreshPermissions();
  }, [refreshPermissions]);

  const handleRequestExactAlarm = useCallback(async () => {
    await requestExactAlarmPermission();
    // 精确闹钟从「没有」变成「有」以后，已经排成非精确的那些也要重排一次，
    // 否则指纹没变、effect 会直接跳过，权限给了等于没给。
    lastSignature.current = '';
    // 这个 Promise 要等用户从系统页切回来才落，回来时重读一次
    await refreshPermissions();
  }, [refreshPermissions]);

  const handleTestReminder = useCallback(async () => {
    const ok = await sendTestReminder(5);
    setTestState(ok ? 'sent' : 'failed');
    setTimeout(() => setTestState('idle'), 10_000);
  }, []);

  return {
    permission,
    permissions,
    permissionSheetVisible,
    setPermissionSheetVisible,
    scheduledCount,
    testState,
    nextReminderLabel,
    refreshPermissions,
    invalidateSchedule,
    handleRequestNotifications,
    handleRequestExactAlarm,
    handleTestReminder,
  };
}
