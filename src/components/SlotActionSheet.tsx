import { Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';
import { useSheetDrag } from './useSheetDrag';

interface Props {
  visible: boolean;
  /** 「周二 第 5 节 · 11 月 11 日」这种，让用户确认点中的是哪个格子 */
  slotLabel: string;
  /** 这个格子所在那天的日期，给待办用 */
  dateLabel: string;
  onAddCourse: () => void;
  onAddTodo: () => void;
  onClose: () => void;
}

/**
 * 点空白格子后的二选一。
 *
 * 不直接默认成「加课」：课表里的空位同样可能想记一件事（交作业、开会），
 * 让用户自己挑一次比猜错再退出重来便宜。
 */
export function SlotActionSheet({
  visible,
  slotLabel,
  dateLabel,
  onAddCourse,
  onAddTodo,
  onClose,
}: Props) {
  const { translateY, dragHandlers } = useSheetDrag(onClose);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.fill}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
          <View style={styles.dragArea} {...dragHandlers}>
            <View style={styles.handle} />
          </View>
          <View style={styles.header}>
            <Text style={styles.title}>{slotLabel}</Text>
            <Text style={styles.subtitle}>{dateLabel}</Text>
          </View>

          <Pressable
            onPress={onAddCourse}
            style={({ pressed }) => [styles.action, pressed && styles.pressed]}
          >
            <View style={[styles.actionIcon, styles.courseIcon]}>
              <Text style={styles.actionGlyph}>＋</Text>
            </View>
            <View style={styles.actionText}>
              <Text style={styles.actionTitle}>添加课程</Text>
              <Text style={styles.actionHint}>这门课会按周重复排进课表</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>

          <Pressable
            onPress={onAddTodo}
            style={({ pressed }) => [styles.action, pressed && styles.pressed]}
          >
            <View style={[styles.actionIcon, styles.todoIcon]}>
              <Text style={styles.actionGlyph}>✓</Text>
            </View>
            <View style={styles.actionText}>
              <Text style={styles.actionTitle}>添加待办</Text>
              <Text style={styles.actionHint}>只在这一天提醒，不占课时</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>

          <Pressable onPress={onClose} style={styles.cancelBtn}>
            <Text style={styles.cancelText}>取消</Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingBottom: 14,
  },
  dragArea: { paddingBottom: 8 },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
    marginTop: 8,
  },
  header: { paddingHorizontal: 18, paddingBottom: 6 },
  title: { fontSize: 17, fontWeight: '600', color: colors.text },
  subtitle: { fontSize: 12, color: colors.textTertiary, marginTop: 3 },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 14,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: colors.bg,
  },
  actionIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  courseIcon: { backgroundColor: colors.pineSoft },
  todoIcon: { backgroundColor: colors.accentSoft },
  actionGlyph: { fontSize: 17, fontWeight: '700', color: colors.pine },
  actionText: { flex: 1 },
  actionTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  actionHint: { fontSize: 11.5, color: colors.textTertiary, marginTop: 2 },
  chevron: { fontSize: 20, color: colors.textTertiary },
  cancelBtn: { marginTop: 10, height: 44, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontSize: 14, color: colors.textSecondary },
  pressed: { opacity: 0.7 },
});
