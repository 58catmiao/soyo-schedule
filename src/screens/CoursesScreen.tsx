import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Course, Semester, WEEKDAY_LABELS, WEEKDAYS, Weekday } from '../types';
import { describeWeeks, periodSlot } from '../schedule';
import { colors } from '../theme';
import { safeTop } from '../safeArea';

interface Props {
  semester: Semester;
  courses: Course[];
  onPressCourse: (course: Course) => void;
  onAddCourse: () => void;
}

function weeksLabel(course: Course): string {
  const weeks = describeWeeks(course.weeks);
  const parity = weeks.parity === 'odd' ? '单周' : weeks.parity === 'even' ? '双周' : '';
  if (weeks.startWeek === weeks.endWeek) return `第 ${weeks.startWeek} 周`;
  return `第 ${weeks.startWeek}–${weeks.endWeek} 周${parity ? ` ${parity}` : ''}`;
}

function periodLabel(course: Course): string {
  if (course.periodStart === course.periodEnd) return `第 ${course.periodStart} 节`;
  return `第 ${course.periodStart}–${course.periodEnd} 节`;
}

function timeLabel(course: Course, semester: Semester): string {
  const start = periodSlot(semester.periods, course.periodStart);
  const end = periodSlot(semester.periods, course.periodEnd);
  if (!start || !end) return periodLabel(course);
  return `${start.start} – ${end.end}`;
}

export function CoursesScreen({ semester, courses, onPressCourse, onAddCourse }: Props) {
  const topPad = safeTop();
  const sorted = [...courses].sort(
    (a, b) => a.weekday - b.weekday || a.periodStart - b.periodStart
  );
  const byDay = new Map<Weekday, Course[]>();
  for (const wd of WEEKDAYS) byDay.set(wd, []);
  for (const course of sorted) byDay.get(course.weekday)?.push(course);

  const weeklyPeriods = [...new Set(courses.map((c) => c.weekday))]
    .flatMap((wd) => byDay.get(wd) ?? [])
    .reduce((sum, c) => sum + (c.periodEnd - c.periodStart + 1), 0);

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.body, { paddingTop: topPad + 10 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topRow}>
          <Text style={styles.title}>课程</Text>
        </View>
        <Text style={styles.summary}>
          {courses.length} 门课 · 每周 {weeklyPeriods} 节 · 学期 {semester.totalWeeks} 周
        </Text>

        {courses.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>还没有课</Text>
            <Text style={styles.emptyHint}>
              去「课表」页右上角导入一份，或者点右下角的 ＋ 自己加一门。
            </Text>
          </View>
        ) : (
          WEEKDAYS.map((wd) => {
            const list = byDay.get(wd) ?? [];
            if (!list.length) return null;
            return (
              <View key={wd} style={styles.group}>
                <View style={styles.groupHead}>
                  <Text style={styles.groupTitle}>周{WEEKDAY_LABELS[wd]}</Text>
                  <Text style={styles.groupCount}>{list.length} 门</Text>
                </View>
                {list.map((course) => (
                  <Pressable
                    key={course.id}
                    onPress={() => onPressCourse(course)}
                    style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                  >
                    <View style={[styles.rowBar, { backgroundColor: course.color }]} />
                    <View style={styles.rowMain}>
                      <Text numberOfLines={1} style={styles.rowName}>
                        {course.name}
                      </Text>
                      <Text numberOfLines={1} style={styles.rowMeta}>
                        {weeksLabel(course)} · {periodLabel(course)}
                        {course.location ? ` · ${course.location}` : ''}
                        {course.teacher ? ` · ${course.teacher}` : ''}
                      </Text>
                    </View>
                    <Text style={styles.rowTime}>{timeLabel(course, semester)}</Text>
                  </Pressable>
                ))}
              </View>
            );
          })
        )}
      </ScrollView>

      <Pressable
        onPress={onAddCourse}
        style={({ pressed }) => [styles.fab, pressed && styles.pressed]}
      >
        <Text style={styles.fabText}>＋</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flex: 1 },
  body: { paddingHorizontal: 16, paddingBottom: 96 },
  topRow: { flexDirection: 'row', alignItems: 'flex-end' },
  title: { fontSize: 27, fontWeight: '700', color: colors.ink, letterSpacing: -0.7 },
  spacer: { flex: 1 },
  textBtnHit: { paddingVertical: 6, paddingLeft: 12 },
  textBtn: { fontSize: 13, fontWeight: '600', color: colors.pine },
  summary: { fontSize: 12, color: colors.inkFaint, marginTop: 2, marginBottom: 10 },
  group: { marginTop: 18 },
  groupHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.ruleStrong,
  },
  groupTitle: { fontSize: 13, fontWeight: '700', color: colors.ink },
  groupCount: { fontSize: 11, color: colors.inkFaint, marginLeft: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.rule,
  },
  rowBar: { width: 3, height: 32, borderRadius: 2, marginRight: 12 },
  rowMain: { flex: 1, paddingRight: 10 },
  rowName: { fontSize: 15, fontWeight: '600', color: colors.ink },
  rowMeta: { fontSize: 11.5, color: colors.inkSoft, marginTop: 3, lineHeight: 16 },
  rowTime: { fontSize: 11, color: colors.inkFaint, textAlign: 'right' },
  empty: { marginTop: 28 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  emptyHint: { marginTop: 6, fontSize: 13, lineHeight: 20, color: colors.inkSoft },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 22,
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.pine,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0B1F19',
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 6,
  },
  fabText: { fontSize: 26, color: '#FFFFFF', lineHeight: 28, marginTop: -2 },
  pressed: { opacity: 0.65 },
});
