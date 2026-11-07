import { useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Course, Semester } from '../types';
import { datesOfWeek, formatRange } from '../schedule';
import { describeLead } from '../reminders';
import { colors, radius } from '../theme';
import { safeTop } from '../safeArea';
import { WeekPager, WeekPagerHandle } from '../components/WeekPager';

interface Props {
  semester: Semester;
  courses: Course[];
  week: number;
  currentWeek: number;
  reminderEnabled: boolean;
  leadMinutes: number;
  scheduledCount: number | null;
  onWeekChange: (week: number) => void;
  onPressCourse: (course: Course) => void;
  onLongPressCourse: (course: Course) => void;
  onOpenImport: () => void;
  onOpenSettings: () => void;
  onAddCourse: () => void;
}

export function WeekScreen({
  semester,
  courses,
  week,
  currentWeek,
  reminderEnabled,
  leadMinutes,
  scheduledCount,
  onWeekChange,
  onPressCourse,
  onLongPressCourse,
  onOpenImport,
  onOpenSettings,
  onAddCourse,
}: Props) {
  const topPad = safeTop();
  const isCurrent = week === currentWeek;
  const pager = useRef<WeekPagerHandle>(null);
  const atFirst = week <= 1;
  const atLast = week >= semester.totalWeeks;

  // 箭头和滑动走同一条路：都交给 pager 做跟手/收尾动画，到头时给一次回弹
  const goPrev = () => pager.current?.goPrev();
  const goNext = () => pager.current?.goNext();

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.body, { paddingTop: topPad + 8 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topRow}>
          <Text style={styles.brand}>soyo</Text>
          <View style={styles.spacer} />
          <Pressable onPress={onOpenImport} hitSlop={12} style={styles.textBtnHit}>
            <Text style={styles.textBtn}>导入课表</Text>
          </Pressable>
        </View>

        <View style={styles.weekBlock}>
          <View style={styles.weekLine}>
            <Pressable
              onPress={goPrev}
              android_ripple={{ color: colors.pineSoft, radius: 22 }}
              hitSlop={6}
              style={({ pressed }) => [styles.arrowHit, pressed && styles.pressed]}
            >
              <Text style={[styles.arrow, atFirst && styles.arrowOff]}>‹</Text>
            </Pressable>
            <Pressable onPress={() => onWeekChange(currentWeek)} hitSlop={8} style={styles.titleHit}>
              <Text style={styles.weekTitle}>第 {week} 周</Text>
            </Pressable>
            <Pressable
              onPress={goNext}
              android_ripple={{ color: colors.pineSoft, radius: 22 }}
              hitSlop={6}
              style={({ pressed }) => [styles.arrowHit, pressed && styles.pressed]}
            >
              <Text style={[styles.arrow, atLast && styles.arrowOff]}>›</Text>
            </Pressable>
          </View>

          <View style={styles.weekMeta}>
            <Text style={styles.weekRange}>{formatRange(datesOfWeek(week, semester))}</Text>
            {isCurrent ? (
              <View style={styles.nowPill}>
                <Text style={styles.nowPillText}>本周</Text>
              </View>
            ) : (
              <Pressable onPress={() => onWeekChange(currentWeek)} hitSlop={10}>
                <Text style={styles.jump}>回到本周</Text>
              </Pressable>
            )}
          </View>
        </View>

        {reminderEnabled ? (
          <Pressable
            onPress={onOpenSettings}
            style={({ pressed }) => [styles.reminderLine, pressed && styles.pressed]}
          >
            <Text style={styles.reminderText}>
              课前提醒 · {describeLead(leadMinutes)}
              {scheduledCount !== null && scheduledCount > 0 ? ` · 已排 ${scheduledCount} 条` : ''}
            </Text>
            <Text style={styles.reminderChevron}>›</Text>
          </Pressable>
        ) : null}

        {courses.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>课表还是空的</Text>
            <Text style={styles.emptyBody}>
              从教务系统导入最省事，也可以点右下角的 ＋ 自己加一门。
            </Text>
            <Pressable
              onPress={onOpenImport}
              style={({ pressed }) => [styles.emptyBtn, pressed && styles.pressed]}
            >
              <Text style={styles.emptyBtnText}>导入课表</Text>
            </Pressable>
          </View>
        ) : null}

        <WeekPager
          ref={pager}
          semester={semester}
          courses={courses}
          week={week}
          onWeekChange={onWeekChange}
          onPressCourse={onPressCourse}
          onLongPressCourse={onLongPressCourse}
        />

        {courses.length > 0 ? (
          <Text style={styles.hint}>点课块看详情 · 长按直接改 · 左右滑动换周 · 点「第 N 周」回到本周</Text>
        ) : null}
      </ScrollView>

      <Pressable
        onPress={onAddCourse}
        hitSlop={8}
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
  body: { paddingBottom: 96 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
  },
  brand: { fontSize: 15, fontWeight: '700', color: colors.ink, letterSpacing: 1.5 },
  spacer: { flex: 1 },
  textBtnHit: { paddingVertical: 4, paddingLeft: 12 },
  textBtn: { fontSize: 13, fontWeight: '600', color: colors.pine },
  weekBlock: { paddingHorizontal: 18, marginTop: 6 },
  weekLine: { flexDirection: 'row', alignItems: 'center' },
  arrowHit: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 2,
  },
  titleHit: { paddingVertical: 2 },
  arrow: { fontSize: 22, color: colors.inkSoft, lineHeight: 24 },
  arrowOff: { opacity: 0.25 },
  weekTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.ink,
    letterSpacing: -0.6,
    marginLeft: 4,
    marginRight: 4,
  },
  weekMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 2, marginLeft: 34 },
  weekRange: { fontSize: 13, color: colors.inkSoft },
  nowPill: {
    marginLeft: 8,
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: radius.pill,
    backgroundColor: colors.pineSoft,
  },
  nowPillText: { fontSize: 11, fontWeight: '600', color: colors.pine },
  jump: { fontSize: 12, color: colors.pine, marginLeft: 10, fontWeight: '600' },
  reminderLine: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    marginHorizontal: 18,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.rule,
  },
  reminderText: { flex: 1, fontSize: 12, color: colors.inkSoft },
  reminderChevron: { fontSize: 16, color: colors.inkFaint, marginLeft: 6 },
  hint: {
    marginTop: 14,
    paddingHorizontal: 18,
    fontSize: 11,
    lineHeight: 16,
    color: colors.inkFaint,
  },
  empty: {
    marginTop: 14,
    marginHorizontal: 18,
    padding: 16,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.rule,
  },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
  emptyBody: {
    marginTop: 6,
    fontSize: 12.5,
    lineHeight: 19,
    color: colors.inkSoft,
  },
  emptyBtn: {
    marginTop: 14,
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: radius.pill,
    backgroundColor: colors.pine,
  },
  emptyBtnText: { fontSize: 12.5, fontWeight: '700', color: '#FFFFFF' },
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
