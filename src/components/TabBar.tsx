import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';

export type Tab = 'week' | 'today' | 'courses' | 'todos' | 'settings';

const ITEMS: { key: Tab; label: string }[] = [
  { key: 'week', label: '课表' },
  { key: 'today', label: '今日' },
  { key: 'courses', label: '课程' },
  { key: 'todos', label: '待办' },
  { key: 'settings', label: '设置' },
];

/**
 * 底部五个入口。
 *
 * 不用图标：字形本身就是这个 App 的信息层级（课表 / 今日 / 课程 / 待办 / 设置
 * 五个词够短），省一整套图标资源，也少一层视觉噪音。选中态靠「墨色 + 下方一条松绿短线」。
 */
export function TabBar({ value, onChange }: { value: Tab; onChange: (tab: Tab) => void }) {
  return (
    <View style={styles.wrap}>
      {ITEMS.map((item) => {
        const active = item.key === value;
        return (
          <Pressable
            key={item.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={item.label}
            onPress={() => onChange(item.key)}
            android_ripple={{ color: colors.pineSoft, borderless: true }}
            hitSlop={{ top: 6, bottom: 6 }}
            style={styles.item}
          >
            <Text style={[styles.label, active && styles.labelActive]}>{item.label}</Text>
            <View style={[styles.marker, active && styles.markerActive]} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.rule,
    paddingBottom: 8,
    paddingTop: 6,
  },
  item: {
    flex: 1,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 6,
  },
  // 未选中的也用 inkSoft 而不是 inkFaint：13px 的淡字在纸色底上只有 2.4:1，
  // 太阳底下基本看不见；区分靠的是字重和下面那条线，不必靠把字调淡。
  label: { fontSize: 13, color: colors.inkSoft },
  labelActive: { color: colors.ink, fontWeight: '700' },
  marker: { marginTop: 5, width: 14, height: 2, borderRadius: 1, backgroundColor: 'transparent' },
  markerActive: { backgroundColor: colors.pine },
});
