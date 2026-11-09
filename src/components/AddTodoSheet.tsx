import { useEffect, useState } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Todo } from '../types';
import { describeDateFull, makeTodoId, shiftISODate } from '../todos';
import { colors } from '../theme';
import { useSheetDrag } from './useSheetDrag';

interface Props {
  visible: boolean;
  /** 新建时的默认日期 'YYYY-MM-DD'；编辑时以 initial.date 为准 */
  date: string;
  today: string;
  /** 传了就是编辑 */
  initial?: Todo | null;
  onClose: () => void;
  onSave: (todo: Todo) => void;
  onDelete?: (id: string) => void;
}

/**
 * 待办编辑面板。
 *
 * 和课程表单一样从底部弹出、可下拉关闭；字段刻意只有三样：
 * 做什么、哪天、备注。待办的要义是快，多一个字段就多一次犹豫。
 */
export function AddTodoSheet({ visible, date, today, initial, onClose, onSave, onDelete }: Props) {
  const { translateY, dragHandlers } = useSheetDrag(onClose);
  const [title, setTitle] = useState('');
  const [todoDate, setTodoDate] = useState(date);
  const [note, setNote] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!visible) return;
    if (initial) {
      setTitle(initial.title);
      setTodoDate(initial.date);
      setNote(initial.note ?? '');
      setDone(initial.done);
      return;
    }
    setTitle('');
    setTodoDate(date);
    setNote('');
    setDone(false);
  }, [visible, initial, date]);

  const canSave = title.trim().length > 0;

  const submit = () => {
    if (!canSave) return;
    onSave({
      id: initial?.id ?? makeTodoId(),
      title: title.trim(),
      date: todoDate,
      done: initial ? done : false,
      note: note.trim() || undefined,
    });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.backdrop} onPress={onClose} />
        <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
          <View style={styles.dragArea} {...dragHandlers}>
            <View style={styles.handle} />
          </View>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{initial ? '编辑待办' : '添加待办'}</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={styles.cancel}>取消</Text>
            </Pressable>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.sheetBody}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.fieldLabel}>做什么</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="例如 交实验报告"
              placeholderTextColor={colors.textTertiary}
              style={styles.input}
              autoFocus
            />

            <Text style={styles.fieldLabel}>哪天</Text>
            <View style={styles.dateRow}>
              <Pressable
                onPress={() => setTodoDate((d) => shiftISODate(d, -1))}
                style={({ pressed }) => [styles.stepBtn, pressed && styles.pressed]}
              >
                <Text style={styles.stepBtnText}>‹</Text>
              </Pressable>
              <View style={styles.dateValue}>
                <Text style={styles.dateText}>{describeDateFull(todoDate, today)}</Text>
              </View>
              <Pressable
                onPress={() => setTodoDate((d) => shiftISODate(d, 1))}
                style={({ pressed }) => [styles.stepBtn, pressed && styles.pressed]}
              >
                <Text style={styles.stepBtnText}>›</Text>
              </Pressable>
            </View>
            <View style={styles.chipRow}>
              <Pressable onPress={() => setTodoDate(today)} style={styles.chip}>
                <Text style={styles.chipText}>今天</Text>
              </Pressable>
              <Pressable onPress={() => setTodoDate(shiftISODate(today, 1))} style={styles.chip}>
                <Text style={styles.chipText}>明天</Text>
              </Pressable>
              <Pressable onPress={() => setTodoDate(shiftISODate(today, 7))} style={styles.chip}>
                <Text style={styles.chipText}>一周后</Text>
              </Pressable>
            </View>

            <Text style={styles.fieldLabel}>备注</Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="选填"
              placeholderTextColor={colors.textTertiary}
              style={styles.input}
            />

            {initial ? (
              <Pressable onPress={() => setDone((v) => !v)} style={styles.doneRow}>
                <View style={[styles.checkbox, done && styles.checkboxOn]}>
                  {done ? <Text style={styles.checkboxMark}>✓</Text> : null}
                </View>
                <Text style={styles.doneText}>已完成</Text>
              </Pressable>
            ) : null}

            <Pressable
              onPress={submit}
              disabled={!canSave}
              style={({ pressed }) => [
                styles.saveBtn,
                !canSave && styles.saveBtnDisabled,
                pressed && canSave && styles.pressed,
              ]}
            >
              <Text style={styles.saveBtnText}>保存</Text>
            </Pressable>

            {initial && onDelete ? (
              <Pressable
                onPress={() => onDelete(initial.id)}
                style={({ pressed }) => [styles.deleteBtn, pressed && styles.pressed]}
              >
                <Text style={styles.deleteText}>删除这条待办</Text>
              </Pressable>
            ) : null}
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
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
    maxHeight: '88%',
    paddingBottom: 12,
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
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 8,
  },
  sheetTitle: { fontSize: 17, fontWeight: '600', color: colors.text },
  cancel: { fontSize: 14, color: colors.textSecondary },
  sheetBody: { paddingHorizontal: 18, paddingBottom: 28 },
  fieldLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 14,
    marginBottom: 6,
  },
  input: {
    height: 42,
    borderRadius: 10,
    backgroundColor: colors.bg,
    paddingHorizontal: 12,
    fontSize: 15,
    color: colors.text,
  },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dateValue: {
    flex: 1,
    height: 42,
    borderRadius: 10,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateText: { fontSize: 15, color: colors.text, fontWeight: '500' },
  stepBtn: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: { fontSize: 20, color: colors.text, lineHeight: 22 },
  chipRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  chip: {
    height: 32,
    paddingHorizontal: 14,
    borderRadius: 9,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: { fontSize: 13, color: colors.textSecondary },
  doneRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  checkboxMark: { fontSize: 13, color: '#FFFFFF', fontWeight: '700', lineHeight: 15 },
  doneText: { fontSize: 14, color: colors.text },
  saveBtn: {
    marginTop: 20,
    height: 46,
    borderRadius: 12,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnDisabled: { backgroundColor: colors.borderStrong },
  saveBtnText: { fontSize: 15, fontWeight: '600', color: '#FFFFFF' },
  deleteBtn: { marginTop: 10, height: 42, alignItems: 'center', justifyContent: 'center' },
  deleteText: { fontSize: 14, color: colors.danger },
  pressed: { opacity: 0.7 },
});
