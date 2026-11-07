import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Course, Semester, WEEKDAY_LABELS } from '../types';
import {
  DaySession,
  UpcomingSession,
  addDays,
  sessionsOnDate,
  upcomingSessions,
  weekOfDate,
  weekdayOf,
} from '../schedule';
import { colors, courseAccent, radius } from '../theme';
import { safeTop } from '../safeArea';

const DAY_MS = 24 * 60 * 60 * 1000;

interface Props {
  semester: Semester;
  courses: Course[];
  now: Date;
  onPressCourse: (course: Course) => void;
  onOpenWeek: () => void;
}

/** 某一屏要显示的一天：把 DaySession 摊平成行 */
function sessionsOn(date: Date, courses: Course[], semester: Semester): DaySession[] {
  return sessionsOnDate(courses, semester, date, date);
}

function countdown(target: Date, now: Date): string {
  const minutes = Math.round((target.getTime() - now.getTime()) / 60000);
  if (minutes <= 0) return '现在就在上课';
  if (minutes < 60) return `还有 ${minutes} 分钟`;
  if (minutes >= 1440) {
    const days = Math.floor(minutes / 1440);
    const restHours = Math.round((minutes - days * 1440) / 60);
    return restHours > 0 ? `还有 ${days} 天 ${restHours} 小时` : `还有 ${days} 天`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (rest === 0) return `还有 ${hours} 小时`;
  return `还有 ${hours} 小时 ${rest} 分`;
}

function dayLabel(date: Date): string {
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

/** 今日页里一行就是一次课 */
type Row = DaySession;

/**
 * 同一天里同一门课常常连着排好几段（比如课程设计 08:00、10:10、14:00 各一节）。
 * 逐段列出来会像是重复 bug，这里把相邻的同门课并成一行。
 */
type RowGroup = {
  course: Course;
  rows: Row[];
  state: Row['state'];
};

function groupRows(rows: Row[]): RowGroup[] {
  const groups: RowGroup[] = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last && last.course.id === row.course.id && last.rows.length < 6) {
      last.rows.push(row);
      last.state = row.state;
      continue;
    }
    groups.push({ course: row.course, rows: [row], state: row.state });
  }
  return groups;
}

/** 这一节课「是哪天」的人话说法：今天 / 明天 / 后天 / 周六 */
function relativeDay(date: Date, now: Date): string {
  const days = Math.round(
    (new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() -
      new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) /
      DAY_MS
  );
  if (days === 0) return '今天';
  if (days === 1) return '明天';
  if (days === 2) return '后天';
  return `周${WEEKDAY_LABELS[weekdayOf(date)]}`;
}

function clockOf(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function NextCard({
  session,
  now,
  live,
  onPress,
}: {
  session: UpcomingSession;
  now: Date;
  live: boolean;
  onPress: () => void;
}) {
  const when = relativeDay(session.date, now);
  const clock = `${clockOf(session.startsAt)} – ${clockOf(session.endsAt)}`;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.nextCard, pressed && styles.pressed]}
    >
      <View style={[styles.nextBar, { backgroundColor: courseAccent(session.course.color) }]} />
      <View style={styles.nextBody}>
        <Text style={styles.nextLabel}>{live ? '正在上课' : '下一节'}</Text>
        <Text style={styles.nextName} numberOfLines={2}>
          {session.course.name}
        </Text>
        <Text style={styles.nextMeta}>
          {when} {clock}
          {session.course.location ? ` · ${session.course.location}` : ''}
        </Text>
        <Text style={styles.nextCount}>
          {live ? countdown(session.endsAt, now) : countdown(session.startsAt, now)}
        </Text>
      </View>
    </Pressable>
  );
}

export function TodayScreen({ semester, courses, now, onPressCourse, onOpenWeek }: Props) {
  const topPad = safeTop();
  const week = weekOfDate(now, semester);
  const inRange = week >= 1 && week <= semester.totalWeeks;
  const weekday = weekdayOf(now);
  const today = sessionsOn(now, courses, semester);
  const tomorrow = sessionsOn(addDays(now, 1), courses, semester);
  const upcoming = upcomingSessions(courses, semester, now, 14);
  const liveSession = upcoming.find(
    (s) => s.startsAt.getTime() <= now.getTime() && s.endsAt.getTime() > now.getTime()
  );
  const nextSession = liveSession ?? upcoming[0];
  // 「下一节」那张卡已经占了最近的一节，列表里别再重复一次
  const later = upcoming.filter(
    (s) => !nextSession || s.startsAt.getTime() > nextSession.startsAt.getTime()
  );

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.body, { paddingTop: topPad + 10 }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.topRow}>
        <Text style={styles.date}>{dayLabel(now)}</Text>
        <View style={styles.spacer} />
        <Pressable onPress={onOpenWeek} hitSlop={8} style={styles.textBtnHit}>
          <Text style={styles.textBtn}>{inRange ? `第 ${week} 周` : '不在学期内'}</Text>
        </Pressable>
      </View>
      <Text style={styles.weekday}>
        周{WEEKDAY_LABELS[weekday]}
        {inRange ? '' : ' · 现在不是上课周'}
      </Text>

      {nextSession ? (
        <NextCard
          session={nextSession}
          now={now}
          live={Boolean(liveSession)}
          onPress={() => onPressCourse(nextSession.course)}
        />
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>接下来两周没有课</Text>
          <Text style={styles.emptyHint}>导入课表之后，这里会显示你最近的一节课</Text>
        </View>
      )}

      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>今天</Text>
        <Text style={styles.sectionCount}>{today.length ? `${today.length} 节` : '没课'}</Text>
      </View>

      {today.length === 0 ? (
        <Text style={styles.quiet}>今天没有课，好好休息。</Text>
      ) : (
        groupRows(today).map((group) => {
          const first = group.rows[0];
          const last = group.rows[group.rows.length - 1];
          const ranges = group.rows.map((row) => `${row.start}–${row.end}`).join('、');
          return (
            <Pressable
              key={`${group.course.id}-${first.start}`}
              onPress={() => onPressCourse(group.course)}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            >
              <View
                style={[
                  styles.rowBar,
                  {
                    backgroundColor: courseAccent(group.course.color),
                    opacity: group.state === 'past' ? 0.3 : 1,
                  },
                ]}
              />
              <View style={styles.rowTimes}>
                <Text style={[styles.rowStart, group.state === 'past' && styles.dim]}>
                  {first.start}
                </Text>
                <Text style={styles.rowEnd}>{last.end}</Text>
              </View>
              <View style={styles.rowMain}>
                <Text
                  numberOfLines={1}
                  style={[styles.rowName, group.state === 'past' && styles.dim]}
                >
                  {group.course.name}
                </Text>
                <Text numberOfLines={1} style={styles.rowMeta}>
                  {group.course.location || '地点待定'}
                  {group.course.teacher ? ` · ${group.course.teacher}` : ''}
                </Text>
                {group.rows.length > 1 ? (
                  <Text numberOfLines={1} style={styles.rowRanges}>
                    {group.rows.length} 段 · {ranges}
                  </Text>
                ) : null}
              </View>
              {group.state === 'now' ? (
                <View style={styles.livePill}>
                  <Text style={styles.livePillText}>上课中</Text>
                </View>
              ) : group.state === 'past' ? (
                <Text style={styles.stateText}>已上</Text>
              ) : null}
            </Pressable>
          );
        })
      )}

      {today.length === 0 && later.length > 0 ? (
        <>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>接下来</Text>
            <Text style={styles.sectionCount}>再往后 {Math.min(3, later.length)} 次</Text>
          </View>
          {later.slice(0, 3).map((session, index) => (
            <Pressable
              key={`${session.course.id}-${index}`}
              onPress={() => onPressCourse(session.course)}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            >
              <View
                style={[
                  styles.rowBar,
                  { backgroundColor: courseAccent(session.course.color), opacity: index === 0 ? 1 : 0.5 },
                ]}
              />
              <View style={styles.rowTimes}>
                <Text style={styles.rowStart}>{relativeDay(session.date, now)}</Text>
                <Text style={styles.rowEnd}>{clockOf(session.startsAt)}</Text>
              </View>
              <View style={styles.rowMain}>
                <Text numberOfLines={1} style={styles.rowName}>
                  {session.course.name}
                </Text>
                <Text numberOfLines={1} style={styles.rowMeta}>
                  {session.course.location || '地点待定'}
                </Text>
              </View>
            </Pressable>
          ))}
        </>
      ) : null}

      {tomorrow.length ? (
        <>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>明天</Text>
            <Text style={styles.sectionCount}>{tomorrow.length} 节</Text>
          </View>
          {tomorrow.map((row) => (
            <Pressable
              key={row.course.id}
              onPress={() => onPressCourse(row.course)}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            >
              <View style={[styles.rowBar, { backgroundColor: courseAccent(row.course.color), opacity: 0.5 }]} />
              <View style={styles.rowTimes}>
                <Text style={styles.rowStart}>{row.start}</Text>
                <Text style={styles.rowEnd}>{row.end}</Text>
              </View>
              <View style={styles.rowMain}>
                <Text numberOfLines={1} style={styles.rowName}>
                  {row.course.name}
                </Text>
                <Text numberOfLines={1} style={styles.rowMeta}>
                  {row.course.location || '地点待定'}
                </Text>
              </View>
            </Pressable>
          ))}
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  body: { paddingHorizontal: 18, paddingBottom: 40 },
  topRow: { flexDirection: 'row', alignItems: 'flex-end' },
  date: { fontSize: 30, fontWeight: '700', color: colors.ink, letterSpacing: -0.8 },
  spacer: { flex: 1 },
  textBtnHit: { paddingVertical: 6, paddingLeft: 12 },
  textBtn: { fontSize: 13, fontWeight: '600', color: colors.pine },
  weekday: { fontSize: 13, color: colors.inkSoft, marginTop: 2, marginBottom: 18 },
  nextCard: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.rule,
    overflow: 'hidden',
  },
  nextBar: { width: 4 },
  nextBody: { flex: 1, paddingHorizontal: 14, paddingVertical: 13 },
  nextLabel: { fontSize: 11, fontWeight: '700', color: colors.pine, letterSpacing: 2 },
  nextName: { fontSize: 20, fontWeight: '700', color: colors.ink, marginTop: 4, letterSpacing: -0.3 },
  nextMeta: { fontSize: 13, color: colors.inkSoft, marginTop: 6 },
  nextCount: { fontSize: 12, fontWeight: '600', color: colors.pine, marginTop: 6 },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.rule,
    padding: 16,
  },
  emptyTitle: { fontSize: 15, fontWeight: '600', color: colors.ink },
  emptyHint: { fontSize: 12, color: colors.inkFaint, marginTop: 4, lineHeight: 18 },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 26,
    marginBottom: 6,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
  sectionCount: { fontSize: 12, color: colors.inkFaint, marginLeft: 8 },
  quiet: { fontSize: 13, color: colors.inkFaint, paddingVertical: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.rule,
  },
  rowBar: { width: 3, height: 34, borderRadius: 2, marginRight: 12 },
  rowTimes: { width: 46 },
  rowStart: { fontSize: 13, fontWeight: '600', color: colors.ink },
  rowEnd: { fontSize: 11, color: colors.inkFaint, marginTop: 1 },
  rowMain: { flex: 1, paddingRight: 8 },
  rowName: { fontSize: 15, fontWeight: '600', color: colors.ink },
  rowMeta: { fontSize: 12, color: colors.inkSoft, marginTop: 2 },
  rowRanges: { fontSize: 11, color: colors.inkFaint, marginTop: 2 },
  dim: { color: colors.inkFaint },
  livePill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.pineSoft,
  },
  livePillText: { fontSize: 10, fontWeight: '700', color: colors.pine },
  stateText: { fontSize: 11, color: colors.inkFaint },
  pressed: { opacity: 0.6 },
});
