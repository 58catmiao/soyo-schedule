import { useEffect, useMemo, useState } from 'react';
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
import { Course, Parity, PARITY_LABELS, Semester, WEEKDAY_LABELS, Weekday, WEEKDAYS } from '../types';
import { describeWeeks, expandWeeks } from '../schedule';
import { colors, coursePalette } from '../theme';
import { useSheetDrag } from './useSheetDrag';

interface Props {
  visible: boolean;
  semester: Semester;
  /** 现有课表，用来提示时段重叠 */
  courses: Course[];
  /** 传了就是「编辑这门课」，不传就是新增 */
  initial?: Course | null;
  /** 从空白格点进来时预填星期和节次；课程本身仍默认整学期 */
  prefill?: { weekday: Weekday; periodStart: number; periodEnd: number } | null;
  onClose: () => void;
  onSave: (course: Course) => void;
}

function Stepper({
  label,
  value,
  min,
  max,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix?: string;
  onChange: (next: number) => void;
}) {
  return (
    <View style={styles.stepper}>
      <Text style={styles.stepperLabel}>{label}</Text>
      <Pressable
        onPress={() => onChange(Math.max(min, value - 1))}
        style={({ pressed }) => [styles.stepBtn, pressed && styles.pressed]}
      >
        <Text style={styles.stepBtnText}>−</Text>
      </Pressable>
      <Text style={styles.stepValue}>
        {value}
        {suffix ? <Text style={styles.stepSuffix}>{suffix}</Text> : null}
      </Text>
      <Pressable
        onPress={() => onChange(Math.min(max, value + 1))}
        style={({ pressed }) => [styles.stepBtn, pressed && styles.pressed]}
      >
        <Text style={styles.stepBtnText}>+</Text>
      </Pressable>
    </View>
  );
}

export function AddCourseSheet({
  visible,
  semester,
  courses,
  initial,
  prefill,
  onClose,
  onSave,
}: Props) {
  const { translateY, dragHandlers } = useSheetDrag(onClose);
  const [name, setName] = useState('');
  const [teacher, setTeacher] = useState('');
  const [location, setLocation] = useState('');
  const [weekday, setWeekday] = useState<Weekday>(1);
  const [periodStart, setPeriodStart] = useState(1);
  const [periodEnd, setPeriodEnd] = useState(2);
  const [weekStart, setWeekStart] = useState(1);
  const [weekEnd, setWeekEnd] = useState(semester.totalWeeks);
  const [parity, setParity] = useState<Parity>('all');
  const [colorIndex, setColorIndex] = useState(0);

  useEffect(() => {
    if (!visible) return;
    if (initial) {
      const weeks = describeWeeks(initial.weeks);
      setName(initial.name);
      setTeacher(initial.teacher ?? '');
      setLocation(initial.location ?? '');
      setWeekday(initial.weekday);
      setPeriodStart(initial.periodStart);
      setPeriodEnd(initial.periodEnd);
      setWeekStart(weeks.startWeek);
      setWeekEnd(weeks.endWeek);
      setParity(weeks.parity);
      setColorIndex(Math.max(0, coursePalette.indexOf(initial.color)));
      return;
    }
    setName('');
    setTeacher('');
    setLocation('');
    // 从空白格进来的：星期和节次已经点明了，预填比让用户重选一遍省事
    const start = prefill?.periodStart ?? 1;
    const lastPeriod = Math.max(1, semester.periods.length);
    setWeekday(prefill?.weekday ?? 1);
    setPeriodStart(start);
    setPeriodEnd(prefill?.periodEnd ?? Math.min(start + 1, lastPeriod));
    setWeekStart(1);
    setWeekEnd(semester.totalWeeks);
    setParity('all');
    setColorIndex(0);
  }, [visible, semester.totalWeeks, semester.periods.length, initial, prefill]);

  const weeks = useMemo(
    () => expandWeeks(weekStart, weekEnd, parity),
    [weekStart, weekEnd, parity]
  );
  const weekSet = useMemo(() => new Set(weeks), [weeks]);

  const spanStart = Math.min(periodStart, periodEnd);
  const spanEnd = Math.max(periodStart, periodEnd);

  /**
   * 同一格两门课：星期相同、节次区间相交、周次还要有交集，三条都成立才算真重叠。
   * 只提示、不拦保存 —— 教务系统里确实有同一时段两门课的情况，
   * 要不要叠着排由用户自己决定。
   */
  const conflicts = useMemo(() => {
    if (weekSet.size === 0) return [];
    return courses.filter((course) => {
      if (course.id === initial?.id) return false;
      if (course.weekday !== weekday) return false;
      if (course.periodStart > spanEnd || course.periodEnd < spanStart) return false;
      return course.weeks.some((week) => weekSet.has(week));
    });
  }, [courses, initial?.id, weekday, spanStart, spanEnd, weekSet]);

  const canSave = name.trim().length > 0 && weeks.length > 0;

  const submit = () => {
    if (!canSave) return;
    onSave({
      // 时间戳到毫秒也可能撞（快速连点两下），带一截随机后缀才稳
      id: initial?.id ?? `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      name: name.trim(),
      teacher: teacher.trim() || undefined,
      location: location.trim() || undefined,
      weekday,
      periodStart: Math.min(periodStart, periodEnd),
      periodEnd: Math.max(periodStart, periodEnd),
      weeks,
      color: coursePalette[colorIndex % coursePalette.length],
      note: initial?.note,
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
            <Text style={styles.sheetTitle}>{initial ? '编辑课程' : '添加课程'}</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={styles.cancel}>取消</Text>
            </Pressable>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.sheetBody}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.fieldLabel}>课程名</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="例如 高等数学 A"
              placeholderTextColor={colors.textTertiary}
              style={styles.input}
              autoFocus
            />

            <View style={styles.twoCols}>
              <View style={styles.col}>
                <Text style={styles.fieldLabel}>老师</Text>
                <TextInput
                  value={teacher}
                  onChangeText={setTeacher}
                  placeholder="选填"
                  placeholderTextColor={colors.textTertiary}
                  style={styles.input}
                />
              </View>
              <View style={styles.col}>
                <Text style={styles.fieldLabel}>地点</Text>
                <TextInput
                  value={location}
                  onChangeText={setLocation}
                  placeholder="选填"
                  placeholderTextColor={colors.textTertiary}
                  style={styles.input}
                />
              </View>
            </View>

            <Text style={styles.fieldLabel}>星期</Text>
            <View style={styles.chipRow}>
              {WEEKDAYS.map((wd) => (
                <Pressable
                  key={wd}
                  onPress={() => setWeekday(wd)}
                  style={[styles.chip, weekday === wd && styles.chipActive]}
                >
                  <Text style={[styles.chipText, weekday === wd && styles.chipTextActive]}>
                    {WEEKDAY_LABELS[wd]}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.fieldLabel}>节次</Text>
            <View style={styles.stepperRow}>
              <Stepper label="从" value={periodStart} min={1} max={semester.periods.length} suffix=" 节" onChange={setPeriodStart} />
              <Stepper label="到" value={periodEnd} min={1} max={semester.periods.length} suffix=" 节" onChange={setPeriodEnd} />
            </View>

            <Text style={styles.fieldLabel}>周次</Text>
            <View style={styles.stepperRow}>
              <Stepper label="从" value={weekStart} min={1} max={semester.totalWeeks} suffix=" 周" onChange={setWeekStart} />
              <Stepper label="到" value={weekEnd} min={1} max={semester.totalWeeks} suffix=" 周" onChange={setWeekEnd} />
            </View>
            <View style={styles.chipRow}>
              {(['all', 'odd', 'even'] as Parity[]).map((p) => (
                <Pressable
                  key={p}
                  onPress={() => setParity(p)}
                  style={[styles.chip, parity === p && styles.chipActive]}
                >
                  <Text style={[styles.chipText, parity === p && styles.chipTextActive]}>
                    {PARITY_LABELS[p]}周
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.fieldLabel}>颜色</Text>
            <View style={styles.swatchRow}>
              {coursePalette.map((c, i) => (
                <Pressable
                  key={c}
                  onPress={() => setColorIndex(i)}
                  style={[
                    styles.swatch,
                    { backgroundColor: c },
                    i === colorIndex && styles.swatchActive,
                  ]}
                />
              ))}
            </View>

            <Text style={styles.hint}>
              共 {weeks.length} 次课
              {weeks.length > 0 ? `（第 ${weeks[0]}–${weeks[weeks.length - 1]} 周）` : ''}
            </Text>

            {conflicts.length > 0 ? (
              <View style={styles.conflictBox}>
                <Text style={styles.conflictTitle}>这个时段已经有课了</Text>
                {conflicts.map((course) => {
                  const w = describeWeeks(course.weeks);
                  const span =
                    course.periodStart === course.periodEnd
                      ? `第 ${course.periodStart} 节`
                      : `第 ${course.periodStart}–${course.periodEnd} 节`;
                  return (
                    <Text key={course.id} style={styles.conflictLine} numberOfLines={1}>
                      {course.name} · {span} · 第 {w.startWeek}–{w.endWeek} 周
                    </Text>
                  );
                })}
                <Text style={styles.conflictHint}>还能保存，两门课会叠在同一格</Text>
              </View>
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
  /** 把手下方的整条区域都能拖，比只拖那根 4dp 的细线好按得多 */
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
  twoCols: { flexDirection: 'row', gap: 10 },
  col: { flex: 1 },
  chipRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: {
    minWidth: 36,
    height: 34,
    paddingHorizontal: 10,
    borderRadius: 9,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: { backgroundColor: colors.accent },
  chipText: { fontSize: 13, color: colors.textSecondary },
  chipTextActive: { color: '#FFFFFF', fontWeight: '600' },
  stepperRow: { flexDirection: 'row', gap: 12, marginBottom: 8 },
  stepper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.bg,
    borderRadius: 10,
    paddingHorizontal: 8,
    height: 42,
  },
  stepperLabel: { fontSize: 12, color: colors.textTertiary },
  stepBtn: {
    width: 28,
    height: 28,
    borderRadius: 7,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  stepBtnText: { fontSize: 16, color: colors.text, lineHeight: 18 },
  stepValue: { fontSize: 14, color: colors.text, fontWeight: '500' },
  stepSuffix: { fontSize: 11, color: colors.textTertiary, fontWeight: '400' },
  swatchRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  swatch: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  swatchActive: { borderColor: colors.text },
  hint: { fontSize: 12, color: colors.textTertiary, marginTop: 14 },
  conflictBox: {
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: colors.dangerSoft,
  },
  conflictTitle: { fontSize: 13, fontWeight: '600', color: colors.danger },
  conflictLine: { fontSize: 12, color: colors.ink, marginTop: 5 },
  conflictHint: { fontSize: 11, color: colors.danger, marginTop: 7, opacity: 0.8 },
  saveBtn: {
    marginTop: 18,
    height: 46,
    borderRadius: 12,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnDisabled: { backgroundColor: colors.borderStrong },
  saveBtnText: { fontSize: 15, fontWeight: '600', color: '#FFFFFF' },
  pressed: { opacity: 0.7 },
});
