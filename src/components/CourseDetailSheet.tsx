import { useEffect, useState } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Course, Semester, WEEKDAY_LABELS } from '../types';
import { describeWeeks } from '../schedule';
import { colors } from '../theme';
import { useSheetDrag } from './useSheetDrag';

type Props = {
  course: Course | null;
  semester: Semester;
  onClose: () => void;
  onEdit: (course: Course) => void;
  onDelete: (course: Course) => void;
};

/**
 * 课程详情弹层。
 *
 * 为什么不用 Alert：react-native-web 的 Alert 是空壳（`static alert() {}`），
 * 在浏览器里点了完全没有反应。所以详情、删除确认全部自绘，Web 与原生同一套。
 */
export function CourseDetailSheet({ course, semester, onClose, onEdit, onDelete }: Props) {
  const [armed, setArmed] = useState(false);
  const { translateY, dragHandlers } = useSheetDrag(onClose);

  const open = course !== null;

  // 每次重新打开都复位。只盯 course.id 是盯不住的：
  // 关掉再打开同一门课时 id 根本没变，会带着上一次的 armed 直接删掉。
  useEffect(() => {
    if (open) setArmed(false);
  }, [open]);

  // 「再点一次」只在几秒内算数：放着不管就自动撤销，手滑也不会误删。
  useEffect(() => {
    if (!armed) return undefined;
    const timer = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(timer);
  }, [armed]);

  if (!course) return null;

  const start = semester.periods.find((p) => p.period === course.periodStart);
  const end = semester.periods.find((p) => p.period === course.periodEnd);
  const timeText = start && end ? `${start.start} – ${end.end}` : '—';
  const periodText =
    course.periodStart === course.periodEnd
      ? `第 ${course.periodStart} 节`
      : `第 ${course.periodStart}–${course.periodEnd} 节`;

  const weeks = describeWeeks(course.weeks);
  const parityWord =
    weeks.parity === 'odd' ? '单周' : weeks.parity === 'even' ? '双周' : '每周';
  const weeksText =
    weeks.startWeek === weeks.endWeek
      ? `第 ${weeks.startWeek} 周`
      : `第 ${weeks.startWeek}–${weeks.endWeek} 周　${parityWord}`;

  const rows: { label: string; value: string }[] = [
    { label: '时间', value: `${WEEKDAY_LABELS[course.weekday]}　${periodText}　${timeText}` },
    { label: '周次', value: `${weeksText}（共 ${course.weeks.length} 次）` },
    { label: '老师', value: course.teacher?.trim() || '—' },
    { label: '地点', value: course.location?.trim() || '—' },
  ];

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.root}>
        {/*
          背景单独摊一层、不和 sheet 同父：早先是 Pressable 直接包住 sheet，
          点详情行或空白处都会顺带把弹层关掉。
        */}
        <Pressable style={styles.backdrop} onPress={onClose} />
        <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
          <View style={styles.dragArea} {...dragHandlers}>
            <View style={styles.handle} />
            <View style={[styles.bar, { backgroundColor: course.color }]} />
          </View>

          <Text style={styles.name}>{course.name}</Text>

          <View style={styles.rows}>
            {rows.map((r) => (
              <View key={r.label} style={styles.row}>
                <Text style={styles.rowLabel}>{r.label}</Text>
                <Text style={styles.rowValue}>{r.value}</Text>
              </View>
            ))}
          </View>

          {course.note?.trim() ? <Text style={styles.note}>{course.note}</Text> : null}

          <Pressable
            onPress={() => onEdit(course)}
            style={({ pressed }) => [styles.editBtn, pressed && styles.pressed]}
          >
            <Text style={styles.editText}>编辑这门课</Text>
          </Pressable>

          <Pressable
            onPress={() => {
              if (!armed) {
                setArmed(true);
                return;
              }
              onDelete(course);
            }}
            style={({ pressed }) => [
              styles.deleteBtn,
              armed && styles.deleteBtnArmed,
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.deleteText, armed && styles.deleteTextArmed]}>
              {armed ? '再点一次确认删除' : '删除这门课'}
            </Text>
          </Pressable>

          <Pressable
            onPress={onClose}
            style={({ pressed }) => [styles.closeBtn, pressed && styles.pressed]}
          >
            <Text style={styles.closeText}>关闭</Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 26,
  },
  dragArea: { paddingBottom: 6 },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.ruleStrong,
    marginBottom: 12,
  },
  bar: { height: 4, borderRadius: 2, width: 44, marginBottom: 14 },
  name: { fontSize: 21, fontWeight: '700', color: colors.text },
  rows: { marginTop: 14 },
  row: { flexDirection: 'row', paddingVertical: 7 },
  rowLabel: { width: 44, fontSize: 13, color: colors.textTertiary },
  rowValue: { flex: 1, fontSize: 14, color: colors.text, lineHeight: 20 },
  note: {
    marginTop: 10,
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 19,
  },
  editBtn: {
    marginTop: 22,
    height: 46,
    borderRadius: 12,
    backgroundColor: colors.pine,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editText: { fontSize: 15, color: '#FFFFFF', fontWeight: '700' },
  deleteBtn: {
    marginTop: 10,
    height: 46,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.ruleStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtnArmed: { backgroundColor: colors.danger, borderColor: colors.danger },
  deleteText: { fontSize: 15, color: colors.danger, fontWeight: '600' },
  deleteTextArmed: { color: '#FFFFFF' },
  closeBtn: { marginTop: 10, height: 42, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 14, color: colors.textSecondary },
  pressed: { opacity: 0.7 },
});
