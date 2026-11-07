import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_REMINDER_OPTIONS, clampLead } from './reminders';

const KEY = 'soyo.reminders.v1';

export interface ReminderPrefs {
  enabled: boolean;
  leadMinutes: number;
}

export const DEFAULT_PREFS: ReminderPrefs = {
  enabled: false,
  leadMinutes: DEFAULT_REMINDER_OPTIONS.leadMinutes,
};

export async function loadPrefs(): Promise<ReminderPrefs> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<ReminderPrefs>;
    return {
      enabled: parsed.enabled === true,
      leadMinutes:
        typeof parsed.leadMinutes === 'number'
          ? clampLead(parsed.leadMinutes)
          : DEFAULT_PREFS.leadMinutes,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export async function savePrefs(prefs: ReminderPrefs): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // 存不下就算了，下次打开退回默认值，不阻断 UI
  }
}
