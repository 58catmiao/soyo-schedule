import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { Reminder } from './reminders';

/**
 * Android 8 起通知必须归到一个 channel，声音和震动都由 channel 决定。
 *
 * 注意：**channel 一旦创建，声音/震动/重要级别就改不动了**——系统会把用户改过的值锁住，
 * 再调 setNotificationChannelAsync 只更新名字和描述。所以调这些参数的办法只有一个：
 * 换一个新 id 重新建。这里每改一次响铃方式就升一版，旧 id 只用来清理。
 *
 * v3 相对 v2 的改动：音频用途从 NOTIFICATION 换成 ALARM —— 走闹钟音量，
 * 手机调成振动/静音时也能响；同时 channel 的震动模式重新下发一次。
 */
export const REMINDER_CHANNEL_ID = 'class-reminders-v3';
const LEGACY_CHANNEL_IDS = ['class-reminders', 'class-reminders-v2'];

/** 响三下：等一下、震、停、震、停、震 */
const VIBRATION = [0, 300, 200, 300, 200, 300];

/**
 * 只有真机上的原生端能发通知。
 * 网页版（我们现在的预览方式）没有通知通道，调用这里一律安全地空转，
 * 不要在 UI 上假装能发。
 */
export function isNotificationSupported(): boolean {
  return Platform.OS === 'android' || Platform.OS === 'ios';
}

let handlerInstalled = false;

/** App 在前台时也希望看到横幅、听到声音，而不是什么都不发生 */
function installForegroundHandler() {
  if (handlerInstalled || !isNotificationSupported()) return;
  handlerInstalled = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
      priority: Notifications.AndroidNotificationPriority.MAX,
    }),
  });
}

/**
 * 模块加载时就装上前台处理函数。
 *
 * 之前是等到「申请权限 / 发测试提醒」时才装——可提醒大多是在 App 没跑的时候触发的，
 * 等用户下一次打开 App 通知已经过去了，handler 装了也没用。
 */
installForegroundHandler();

async function ensureChannel() {
  if (Platform.OS !== 'android') return;

  for (const legacy of LEGACY_CHANNEL_IDS) {
    try {
      await Notifications.deleteNotificationChannelAsync(legacy);
    } catch {
      // 旧 channel 删不掉也不影响新 channel
    }
  }

  await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL_ID, {
    name: '上课提醒',
    description: '每节课前响铃 + 震动提醒你该去教室了',
    importance: Notifications.AndroidImportance.MAX,
    sound: 'default',
    enableVibrate: true,
    vibrationPattern: VIBRATION,
    // 静音/勿扰也要响：需要用户在系统里给 soyo 开「勿扰例外」，没开时系统会自动忽略
    bypassDnd: true,
    showBadge: true,
    enableLights: true,
    lightColor: '#17493C',
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    audioAttributes: {
      usage: Notifications.AndroidAudioUsage.ALARM,
      contentType: Notifications.AndroidAudioContentType.SONIFICATION,
      flags: {
        enforceAudibility: true,
        requestHardwareAudioVideoSynchronization: false,
      },
    },
  });
}

export type PermissionState = 'granted' | 'denied' | 'unsupported';

export async function ensurePermission(): Promise<PermissionState> {
  if (!isNotificationSupported()) return 'unsupported';
  installForegroundHandler();
  await ensureChannel();

  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return 'granted';
  if (!current.canAskAgain) return 'denied';

  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted ? 'granted' : 'denied';
}

export async function cancelAllReminders(): Promise<void> {
  if (!isNotificationSupported()) return;
  await Notifications.cancelAllScheduledNotificationsAsync();
}

/** 提醒的公共外观：声音、震动、优先级，Android / iOS 各给一套 */
function reminderContent(title: string, body: string, data: Record<string, unknown>) {
  return {
    title,
    body,
    sound: 'default' as const,
    vibrate: VIBRATION,
    priority: Notifications.AndroidNotificationPriority.MAX,
    interruptionLevel: 'timeSensitive' as const,
    data,
  };
}

/**
 * 先全清再全排。
 *
 * 课表一变（加课/删课/改周次），旧的排期就全错了，增量维护只会留一堆幽灵提醒；
 * 反正条数不多，整体重排最不容易出错。
 */
export async function scheduleReminders(reminders: Reminder[]): Promise<number> {
  if (!isNotificationSupported()) return 0;

  // channel 不存在的话 Android 会直接把这条通知丢掉，排期前必须确保它已经建好
  await ensureChannel();
  await Notifications.cancelAllScheduledNotificationsAsync();

  let scheduled = 0;
  for (const reminder of reminders) {
    if (reminder.fireAt.getTime() <= Date.now()) continue;
    try {
      await Notifications.scheduleNotificationAsync({
        content: reminderContent(reminder.title, reminder.body, { courseId: reminder.courseId }),
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: reminder.fireAt,
          channelId: REMINDER_CHANNEL_ID,
          // 不要用 'alarmClock'：那会在状态栏常驻一个闹钟图标（60 条排期 = 一直显示）
          delivery: 'bestEffort',
        },
      });
      scheduled += 1;
    } catch {
      // 单条排不上（系统限额、被电池策略拒掉）不该把后面几十条一起断掉
    }
  }
  return scheduled;
}

/**
 * 立刻排一条几秒后的测试通知。
 * 课前提醒是「未来的事」，用户没法当场验收；给他一个 5 秒的，权限、通道、
 * 声音、震动、横幅一次全验到。
 */
export async function sendTestReminder(delaySeconds = 5): Promise<boolean> {
  if (!isNotificationSupported()) return false;
  installForegroundHandler();
  await ensureChannel();

  const state = await ensurePermission();
  if (state !== 'granted') return false;

  await Notifications.scheduleNotificationAsync({
    content: reminderContent('soyo 测试提醒', '能看到这条，说明课前提醒能正常响。', { test: true }),
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(Date.now() + Math.max(1, delaySeconds) * 1000),
      channelId: REMINDER_CHANNEL_ID,
      delivery: 'bestEffort',
    },
  });
  return true;
}
