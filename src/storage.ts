import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppData } from './types';

const KEY = 'soyo.data.v1';

export async function loadData(): Promise<AppData | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AppData;
    if (!parsed || !parsed.semester || !Array.isArray(parsed.courses)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function saveData(data: AppData): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // 本地落盘失败不该让界面崩；最坏情况是下次打开退回示例数据
  }
}

export async function clearData(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // 同上
  }
}
