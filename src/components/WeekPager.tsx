import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  Easing,
  LayoutChangeEvent,
  PanResponder,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { Course, Semester, Todo, Weekday } from '../types';
import { TimetableGrid } from './TimetableGrid';

/** 横向划过这么多像素才接管手势，避免轻点课块被当成滑动 */
const DRAG_START = 12;
/** 横向位移至少是纵向的多少倍，才认为你在翻周而不是在上下滚 */
const HORIZONTAL_BIAS = 1.4;
/** 松手时位移超过页宽的多少比例就换周 */
const COMMIT_RATIO = 0.26;
/** 甩动速度（px/ms）—— 划得够快，位移小一点也认 */
const FLING_VX = 0.32;
/** 甩动至少要有一点点位移，避免手抖误翻 */
const FLING_MIN_DX = 16;
/** 到头之后继续拖的橡皮筋阻尼 */
const EDGE_DAMP = 0.32;
/** 到头后再拖，最多让出来多少像素 */
const EDGE_MAX = 56;
/** 回弹 / 到边提示的位移量 */
const NUDGE_PX = 14;

/** 位移 → 时长：走得越远、甩得越快，收得越干脆（都夹在 150~300ms 内） */
function durationOf(distance: number, vx: number): number {
  return Math.round(
    Math.min(300, Math.max(150, 150 + distance * 0.42 - Math.min(Math.abs(vx), 2) * 45))
  );
}

export interface WeekPagerHandle {
  goPrev: () => void;
  goNext: () => void;
}

interface Props {
  semester: Semester;
  courses: Course[];
  week: number;
  onWeekChange: (week: number) => void;
  onPressCourse: (course: Course) => void;
  onLongPressCourse: (course: Course) => void;
  todos?: Todo[];
  onPressBlank?: (weekday: Weekday, period: number) => void;
}

/**
 * 可跟手滑动的周视图。
 *
 * 三页轨道（上一周 / 本周 / 下一周）并排放在一个 overflow hidden 的视口里，
 * 手势过程中直接改 translateX —— 网表是真的跟着手指走，不是松手才跳。
 * 松手后按「位移够不够 / 甩得够不够快」决定去下一周还是弹回来，
 * 再用一段 short timing 把剩下的距离补完，视觉上就是「滑到位」。
 *
 * 换周时先换内容、再在 layout 阶段把位移复位一格，两步之间不会渲染出
 * 中间那一帧，所以看不出接缝。
 */
export const WeekPager = forwardRef<WeekPagerHandle, Props>(function WeekPager(
  {
    semester,
    courses,
    week,
    onWeekChange,
    onPressCourse,
    onLongPressCourse,
    todos,
    onPressBlank,
  },
  ref
) {
  const { width: windowWidth } = useWindowDimensions();
  const [pageW, setPageW] = useState(0);
  // 量到真实宽度之前先拿窗口宽度顶上，量到之后再校正
  const width = pageW || windowWidth;

  // 轨道当前以哪一周为中心：换周动画播完才更新，避免中途换内容
  const [centerWeek, setCenterWeek] = useState(week);
  const centerRef = useRef(centerWeek);
  centerRef.current = centerWeek;

  const totalRef = useRef(semester.totalWeeks);
  totalRef.current = semester.totalWeeks;

  const widthRef = useRef(width);
  widthRef.current = width;

  const onWeekChangeRef = useRef(onWeekChange);
  onWeekChangeRef.current = onWeekChange;

  const tx = useRef(new Animated.Value(0)).current;
  /** 当前位移的记账值：不读 Animated 内部字段，跟手和复位都靠它 */
  const posRef = useRef(0);
  /** 一次手势开始时的位移 */
  const startPos = useRef(0);
  /** 手势被接管那一刻已经走过的 dx —— 不扣掉它，轨道一接上就会跳十几像素 */
  const grabDx = useRef(0);
  /** 换周后需要把位移复位（放到 layout 阶段做，避免中间帧） */
  const resetPending = useRef(false);

  // 每帧把真实位移记下来，这样中途再抓住轨道也不会跳
  useEffect(() => {
    const id = tx.addListener(({ value }) => {
      posRef.current = value;
    });
    return () => {
      tx.removeListener(id);
    };
  }, [tx]);

  // 换周或容器宽度变了（含首帧）就把轨道对齐到中间那一页
  useLayoutEffect(() => {
    tx.setValue(-width);
    posRef.current = -width;
    resetPending.current = false;
  }, [width, tx]);

  // 换周的这一帧：内容已经是新的，位移还停在上/下一格，这里悄悄复位
  useLayoutEffect(() => {
    if (!resetPending.current) return;
    resetPending.current = false;
    tx.setValue(-width);
    posRef.current = -width;
  });

  // 外部改周（点「第 N 周」回到本周、导入了新课表……）：不滑动，直接归位
  useLayoutEffect(() => {
    const target = Math.min(Math.max(1, week), semester.totalWeeks);
    if (target === centerWeek) return;
    tx.stopAnimation();
    setCenterWeek(target);
    tx.setValue(-width);
    posRef.current = -width;
  }, [week, centerWeek, semester.totalWeeks, width, tx]);

  /** 松手/点箭头之后：滑到目标页，播完再换内容并复位 */
  const settle = useCallback(
    (direction: -1 | 0 | 1, vx: number) => {
      const w = widthRef.current;
      const center = centerRef.current;
      const total = totalRef.current;
      const base = -w;

      // 到头了就不换周，只弹回来
      let dir = direction;
      if (dir !== 0 && (center + dir < 1 || center + dir > total)) dir = 0;

      // 下一页在轨道左边一格（位移更负），上一页在右边一格
      const target = base - dir * w;
      const distance = Math.abs(target - posRef.current);

      Animated.timing(tx, {
        toValue: target,
        duration: durationOf(distance, vx),
        easing: Easing.out(Easing.cubic),
        // 位移用 JS 驱动：Web 上也能跑同一条路径，且能在手势中途无缝接管
        useNativeDriver: false,
      }).start(({ finished }) => {
        if (!finished || dir === 0) return;
        const nextWeek = center + dir;
        // 内容先换、位移在 layout 阶段复位 —— 同一帧内完成，看不到接缝
        resetPending.current = true;
        setCenterWeek(nextWeek);
        onWeekChangeRef.current(nextWeek);
      });
    },
    [tx]
  );

  /** 已经在第一周 / 最后一周：给一下到边的回弹，别让人以为按钮坏了 */
  const nudge = useCallback(
    (dir: -1 | 1) => {
      const base = -widthRef.current;
      Animated.sequence([
        Animated.timing(tx, {
          toValue: base - dir * NUDGE_PX,
          duration: 110,
          easing: Easing.out(Easing.quad),
          useNativeDriver: false,
        }),
        Animated.timing(tx, {
          toValue: base,
          duration: 170,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
      ]).start();
    },
    [tx]
  );

  const step = useCallback(
    (dir: -1 | 1) => {
      const next = centerRef.current + dir;
      if (next < 1 || next > totalRef.current) nudge(dir);
      else settle(dir, 0);
    },
    [nudge, settle]
  );

  useImperativeHandle(
    ref,
    () => ({
      goPrev: () => step(-1),
      goNext: () => step(1),
    }),
    [step]
  );

  const pan = useMemo(
    () =>
      PanResponder.create({
        // 起点不抢，轻点课块还是点课块
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_e, g) =>
          Math.abs(g.dx) > DRAG_START && Math.abs(g.dx) > Math.abs(g.dy) * HORIZONTAL_BIAS,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (_e, g) => {
          // 可能正停在上一段动画里，停住再从当前位置接着跟手
          tx.stopAnimation();
          startPos.current = posRef.current;
          // 接管发生在划出去十几像素之后，把这部分扣掉才是真正的「跟手」
          grabDx.current = g.dx;
        },
        onPanResponderMove: (_e, g) => {
          const w = widthRef.current;
          const base = -w;
          const center = centerRef.current;
          const total = totalRef.current;
          // 允许滑到的范围：中间是基准，两边各一页；到边界就只剩中间
          const min = center < total ? base - w : base;
          const max = center > 1 ? base + w : base;

          let next = startPos.current + (g.dx - grabDx.current);
          if (next > max) next = max + Math.min((next - max) * EDGE_DAMP, EDGE_MAX);
          else if (next < min) next = min + Math.max((next - min) * EDGE_DAMP, -EDGE_MAX);

          tx.setValue(next);
        },
        onPanResponderRelease: (_e, g) => {
          const w = widthRef.current;
          const offset = posRef.current + w; // 相对基准页的位移
          const enough = Math.abs(offset) > w * COMMIT_RATIO;
          const flung = Math.abs(g.vx) > FLING_VX && Math.abs(offset) > FLING_MIN_DX;
          const nextWeek = centerRef.current + (offset < 0 ? 1 : -1);

          if (nextWeek < 1 || nextWeek > totalRef.current) settle(0, g.vx);
          else if (enough || flung) settle(offset < 0 ? 1 : -1, g.vx);
          else settle(0, g.vx);
        },
        // 被别的手势（比如纵向滚动）抢走时也回弹，不要停在半路
        onPanResponderTerminate: () => {
          settle(0, 0);
        },
      }),
    [settle, tx]
  );

  const handleLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w > 0 && w !== pageW) setPageW(w);
  };

  // 上一周 / 本周 / 下一周，越界的位置留空占位，保证三格宽度永远对齐
  const pages = [centerWeek - 1, centerWeek, centerWeek + 1];

  return (
    <View style={styles.viewport} onLayout={handleLayout} {...pan.panHandlers}>
      <Animated.View
        style={[styles.track, { width: width * 3, transform: [{ translateX: tx }] }]}
      >
        {pages.map((w) => (
          <View key={w} style={{ width }}>
            {w >= 1 && w <= semester.totalWeeks ? (
              <TimetableGrid
                semester={semester}
                courses={courses}
                week={w}
                onPressCourse={onPressCourse}
                onLongPressCourse={onLongPressCourse}
                todos={todos}
                onPressBlank={onPressBlank}
              />
            ) : null}
          </View>
        ))}
      </Animated.View>
    </View>
  );
});

const styles = StyleSheet.create({
  viewport: { overflow: 'hidden' },
  track: { flexDirection: 'row' },
});
