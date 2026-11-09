import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Course, Semester, Todo, WEEKDAY_LABELS, WEEKDAYS, Weekday } from '../types';
import { coursesInWeek, datesOfWeek, toISODate } from '../schedule';
import { pendingCountOn } from '../todos';
import { colors, radius } from '../theme';

const LABEL_W = 30;
const CELL_H = 54;

interface Props {
  semester: Semester;
  courses: Course[];
  week: number;
  onPressCourse: (course: Course) => void;
  onLongPressCourse: (course: Course) => void;
  /** 仅用于表头的小圆点：某天有待办就让日期下面亮一个点 */
  todos?: Todo[];
  /** 点空白格子：传回星期和节次，由调用方决定加课还是加待办 */
  onPressBlank?: (weekday: Weekday, period: number) => void;
}

export function TimetableGrid({
  semester,
  courses,
  week,
  onPressCourse,
  onLongPressCourse,
  todos,
  onPressBlank,
}: Props) {
  const { width: windowWidth } = useWindowDimensions();
  // 用实际量到的容器宽度，而不是窗口宽度：Web 上有滚动条会吃掉十几像素，
  // 用窗口宽度算列宽会让最右一列被裁掉。量到之前先拿窗口宽度顶一下。
  const [measured, setMeasured] = useState(0);
  const width = measured || windowWidth;
  const dayW = (width - LABEL_W) / 7;
  const dates = useMemo(() => datesOfWeek(week, semester), [week, semester]);
  const todayIso = toISODate(new Date());
  const periods = semester.periods;
  const blocks = useMemo(() => coursesInWeek(courses, week), [courses, week]);

  return (
    <View
      onLayout={(e) => {
        const w = Math.round(e.nativeEvent.layout.width);
        if (w > 0 && w !== measured) setMeasured(w);
      }}
    >
      {/* 星期表头 */}
      <View style={styles.headerRow}>
        <View style={[styles.headerCell, styles.headerLabelCell, { width: LABEL_W }]}>
          <Text style={styles.headerLabelText}>周</Text>
        </View>
        {WEEKDAYS.map((wd, i) => {
          const isToday = toISODate(dates[i]) === todayIso;
          const todoDots = todos ? pendingCountOn(todos, toISODate(dates[i])) : 0;
          return (
            <View
              key={wd}
              style={[styles.headerCell, { width: dayW }, isToday && styles.headerCellToday]}
            >
              <Text style={[styles.headerWeekday, isToday && styles.headerTextToday]}>
                {WEEKDAY_LABELS[wd]}
              </Text>
              <Text style={[styles.headerDate, isToday && styles.headerTextToday]}>
                {dates[i].getDate()}
              </Text>
              {todoDots > 0 ? <View style={styles.headerTodoDot} /> : null}
            </View>
          );
        })}
      </View>

      {/* 课表主体：先铺格子，再把课块绝对定位盖上去 */}
      <View style={{ height: periods.length * CELL_H }}>
        {periods.map((slot) => (
          <View key={slot.period} style={styles.row}>
            <View style={[styles.cell, styles.labelCell, { width: LABEL_W }]}>
              <Text style={styles.labelText}>{slot.period}</Text>
            </View>
            {WEEKDAYS.map((wd) => (
              <Pressable
                key={wd}
                accessibilityRole={onPressBlank ? 'button' : undefined}
                accessibilityLabel={
                  onPressBlank ? `周${WEEKDAY_LABELS[wd]} 第 ${slot.period} 节，空白处` : undefined
                }
                onPress={onPressBlank ? () => onPressBlank(wd, slot.period) : undefined}
                style={[styles.cell, { width: dayW }]}
              />
            ))}
          </View>
        ))}

        {blocks.map((course) => {
          const top = (course.periodStart - 1) * CELL_H;
          // 数据万一写反（periodEnd < periodStart），也照着至少一节的高度画，
          // 别算出负高度让课块直接消失
          const span = Math.max(1, course.periodEnd - course.periodStart + 1);
          const height = span * CELL_H;
          const left = LABEL_W + (course.weekday - 1) * dayW;
          const periodsText =
            course.periodStart === course.periodEnd
              ? `第 ${course.periodStart} 节`
              : `第 ${course.periodStart}–${course.periodEnd} 节`;
          return (
            <Pressable
              key={course.id}
              accessibilityRole="button"
              accessibilityLabel={`${course.name}，周${WEEKDAY_LABELS[course.weekday]}，${periodsText}${
                course.location ? `，${course.location}` : ''
              }`}
              onPress={() => onPressCourse(course)}
              onLongPress={() => onLongPressCourse(course)}
              style={[
                styles.block,
                {
                  top: top + 2,
                  height: height - 4,
                  left: left + 2,
                  width: dayW - 4,
                  backgroundColor: course.color,
                },
              ]}
            >
              <Text numberOfLines={2} style={styles.blockName}>
                {course.name}
              </Text>
              {course.location ? (
                <Text numberOfLines={1} style={styles.blockLocation}>
                  {course.location}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.rule,
  },
  headerCell: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderColor: colors.rule,
  },
  headerLabelCell: {
    justifyContent: 'center',
  },
  headerCellToday: {
    backgroundColor: colors.pineSoft,
  },
  headerLabelText: {
    fontSize: 10,
    color: colors.inkFaint,
  },
  headerWeekday: {
    fontSize: 11,
    color: colors.inkSoft,
  },
  headerDate: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.ink,
    marginTop: 1,
  },
  headerTextToday: {
    color: colors.pine,
  },
  headerTodoDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.pine,
    marginTop: 2,
  },
  row: {
    flexDirection: 'row',
  },
  cell: {
    height: CELL_H,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.rule,
  },
  labelCell: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelText: {
    fontSize: 11,
    color: colors.inkFaint,
  },
  block: {
    position: 'absolute',
    borderRadius: radius.block,
    paddingHorizontal: 5,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  blockName: {
    fontSize: 10.5,
    lineHeight: 13.5,
    fontWeight: '700',
    color: colors.ink,
  },
  blockLocation: {
    fontSize: 9,
    lineHeight: 11.5,
    color: colors.inkSoft,
    marginTop: 1,
  },
});
