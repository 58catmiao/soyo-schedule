import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppData, Todo } from './types';

const KEY = 'soyo.data.v1';

/** 旧存档 / 手改过的档可能缺字段或混进脏数据，读的时候统一收拾一遍 */
function normalizeTodos(value: unknown): Todo[] {
  if (!Array.isArray(value)) return [];
  const out: Todo[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const t = item as Partial<Todo>;
    if (typeof t.id !== 'string' || typeof t.title !== 'string') continue;
    if (typeof t.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(t.date)) continue;
    out.push({
      id: t.id,
      title: t.title,
      date: t.date,
      done: t.done === true,
      note: typeof t.note === 'string' ? t.note : undefined,
    });
  }
  return out;
}

export async function loadData(): Promise<AppData | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AppData;
    if (!parsed || !parsed.semester || !Array.isArray(parsed.courses)) return null;
    return { ...parsed, todos: normalizeTodos(parsed.todos) };
  } catch {
    return null;
  }
}

export async function saveData(data: AppData): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // 本地落盘失败不该让界面崩；最坏情况是下次打开还是上次保存的课表
  }
}
