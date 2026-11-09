import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AppData, Course, WEEKDAY_LABELS, Weekday } from './src/types';
import { addDays, dateOf, parseISODate, toISODate, weekOfDate } from './src/schedule';
import { makeInitialSemester } from './src/seed';
import { loadData, saveData } from './src/storage';
import { DEFAULT_PREFS, ReminderPrefs, loadPrefs, savePrefs } from './src/reminderPrefs';
import { clampLead } from './src/reminders';
import {
  openAppSettings,
  openAutoStartSettings,
  openBatteryOptimizationSettings,
} from './src/permissions';
import { describeDate } from './src/todos';
import { colors } from './src/theme';
import { AddCourseSheet } from './src/components/AddCourseSheet';
import { AddTodoSheet } from './src/components/AddTodoSheet';
import { CourseDetailSheet } from './src/components/CourseDetailSheet';
import { PermissionSheet } from './src/components/PermissionSheet';
import { PinHintModal } from './src/components/PinHintModal';
import { SlotActionSheet } from './src/components/SlotActionSheet';
import WebImportSheet from './src/components/WebImportSheet';
import { TabBar, Tab } from './src/components/TabBar';
import { WeekScreen } from './src/screens/WeekScreen';
import { TodayScreen } from './src/screens/TodayScreen';
import { CoursesScreen } from './src/screens/CoursesScreen';
import { TodosScreen } from './src/screens/TodosScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { pinTodayWidget, refreshTodayWidget } from './src/widget/refresh';
import { safeBottom } from './src/safeArea';
import { openUpdate } from './src/updater';
import { useReminderScheduling } from './src/hooks/useReminderScheduling';
import { useTodoActions } from './src/hooks/useTodoActions';
import { useUpdateCheck } from './src/hooks/useUpdateCheck';

/**
 * 周次永远落在 1..总周数 之间。
 * 开学前打开会算出第 0 周甚至负数，把总周数改小之后当前周也可能越界；
 * 越界的周次会让标题写着「第 N 周」、课表画的却是别的周。
 */
function clampWeek(week: number, totalWeeks: number): number {
  return Math.min(Math.max(1, totalWeeks), Math.max(1, week));
}

export default function App() {
  const bottomPad = safeBottom();
  const [data, setData] = useState<AppData | null>(null);
  /** 用户动过课表才落盘：只有 commit 会把它点亮（首启的示例数据不该被写死） */
  const dirtyRef = useRef(false);
  const [tab, setTab] = useState<Tab>('week');
  const [week, setWeek] = useState(1);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [editing, setEditing] = useState<Course | null>(null);
  const [webImportVisible, setWebImportVisible] = useState(false);
  const [detail, setDetail] = useState<Course | null>(null);
  const [prefs, setPrefs] = useState<ReminderPrefs>(DEFAULT_PREFS);
  /** launcher 不支持「一键添加」时，改用一页手把手说明 */
  const [pinHintVisible, setPinHintVisible] = useState(false);
  /** 「放到桌面」的请求有没有被 launcher 接走 —— true 也只代表请求发出去了，不代表真加上了 */
  const [pinAccepted, setPinAccepted] = useState(false);
  /** 点空白格后先问「加课还是加待办」 */
  const [slot, setSlot] = useState<{ weekday: Weekday; period: number; date: string } | null>(
    null
  );
  /** 从空白格进建课表单时预填的星期 / 节次 */
  const [addPrefill, setAddPrefill] = useState<{
    weekday: Weekday;
    periodStart: number;
    periodEnd: number;
  } | null>(null);
  /**
   * 「现在」只给今日页用。
   *
   * 早先是常驻的 30 秒定时器：每跳一次都重渲染整棵树，而周视图同时挂着三张课表。
   * 现在只有停在今日页时才走表，切过去的那一刻也先取一次最新时间。
   */
  const [now, setNow] = useState(() => new Date());

  /**
   * 只在用户真的改动了课表时落盘。
   * 早先是在 data 一变就自动保存，结果**首次打开就会把示例数据写死进本地**，
   * 之后改示例作息表、改学期起始日，App 里永远是旧的那份——调试时会被坑。
   */
  const commit = useCallback((updater: (prev: AppData) => AppData) => {
    // 落盘不放在 updater 里：updater 会被 React 重复调用（StrictMode 下尤其），
    // 副作用混在里面既可能写两次，写失败也没人知道。这里只打标记，写到 effect 里。
    dirtyRef.current = true;
    setData((prev) => (prev ? updater(prev) : prev));
  }, []);

  const {
    permission,
    permissions,
    permissionSheetVisible,
    setPermissionSheetVisible,
    scheduledCount,
    testState,
    nextReminderLabel,
    invalidateSchedule,
    handleRequestNotifications,
    handleRequestExactAlarm,
    handleTestReminder,
  } = useReminderScheduling(data, prefs);

  const {
    todoSheetVisible,
    editingTodo,
    todoDate,
    openNewTodo,
    openTodo,
    closeTodoSheet,
    saveTodo,
    toggleTodo,
    deleteTodo,
  } = useTodoActions(commit);

  const { updateInfo, updateStatus, checkUpdate } = useUpdateCheck();

  useEffect(() => {
    if (tab !== 'today') return undefined;
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, [tab]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const loadedPrefs = await loadPrefs();
      if (!cancelled) setPrefs(loadedPrefs);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const loaded = await loadData();
      if (cancelled) return;
      // 第一次打开是空课表：不塞示例数据，让用户自己导入或用 ＋ 添加
      const next: AppData = loaded ?? {
        semester: makeInitialSemester(),
        courses: [],
      };
      setData(next);
      setWeek(clampWeek(weekOfDate(new Date(), next.semester), next.semester.totalWeeks));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** 总周数被改小之后，当前周可能已经越界，收回到有效范围里 */
  useEffect(() => {
    if (!data) return;
    setWeek((w) => clampWeek(w, data.semester.totalWeeks));
  }, [data]);

  useEffect(() => {
    if (!dirtyRef.current || !data) return;
    dirtyRef.current = false;
    void saveData(data);
  }, [data]);

  /** 课表一变就顺手把桌面小组件刷一遍（桌面上没放组件时什么都不会发生） */
  useEffect(() => {
    if (!data) return;
    void refreshTodayWidget(data);
  }, [data]);

  const handleToggleReminders = (enabled: boolean) => {
    const next = { ...prefs, enabled };
    setPrefs(next);
    void savePrefs(next);
  };

  const handleLeadChange = (minutes: number) => {
    const next = { ...prefs, leadMinutes: clampLead(minutes) };
    setPrefs(next);
    void savePrefs(next);
    invalidateSchedule();
  };

  /**
   * 「放到桌面」：`requestPinAppWidget` 返回 true 只代表「请求交给系统了」，
   * 不代表桌面上真弹了确认框 —— 不少国产 launcher 收下请求后什么也不做。
   * 所以无论结果如何都给一页手动添加的说明，别让按钮点了像没反应。
   */
  const handlePinWidget = async () => {
    const accepted = await pinTodayWidget();
    setPinAccepted(accepted);
    setPinHintVisible(true);
  };

  if (!data) {
    return (
      <View style={styles.boot}>
        <StatusBar style="dark" />
        <Text style={styles.bootText}>soyo</Text>
      </View>
    );
  }

  const { semester, courses } = data;
  const totalWeeks = semester.totalWeeks;
  const currentWeek = clampWeek(weekOfDate(new Date(), semester), totalWeeks);

  const openAddCourse = () => {
    setEditing(null);
    setAddPrefill(null);
    setSheetVisible(true);
  };

  /** 点空白格：先问加课还是加待办，不直接替用户选 */
  const openBlankSlot = (weekday: Weekday, period: number) => {
    setSlot({ weekday, period, date: toISODate(dateOf(week, weekday, semester)) });
  };

  const handleAddCourseFromSlot = () => {
    if (!slot) return;
    setAddPrefill({
      weekday: slot.weekday,
      periodStart: slot.period,
      periodEnd: Math.min(slot.period + 1, semester.periods.length),
    });
    setEditing(null);
    setSheetVisible(true);
    setSlot(null);
  };

  const handleAddTodoFromSlot = () => {
    openNewTodo(slot ? slot.date : undefined);
    setSlot(null);
  };

  const openEditCourse = (course: Course) => {
    setDetail(null);
    setEditing(course);
    setSheetVisible(true);
  };

  /** 新增和编辑共用一个表单：id 已存在就替换 */
  const handleSaveCourse = (course: Course) => {
    commit((prev) => {
      const exists = prev.courses.some((c) => c.id === course.id);
      return {
        ...prev,
        courses: exists
          ? prev.courses.map((c) => (c.id === course.id ? course : c))
          : [...prev.courses, course],
      };
    });
    setSheetVisible(false);
    setEditing(null);
  };

  const handleDelete = (course: Course) => {
    commit((prev) => ({
      ...prev,
      courses: prev.courses.filter((c) => c.id !== course.id),
    }));
    setDetail(null);
  };

  const handleClearCourses = () => {
    commit((prev) => ({ ...prev, courses: [] }));
    invalidateSchedule();
  };

  const handleImported = (nextSemester: AppData['semester'], nextCourses: Course[]) => {
    commit(() => ({ semester: nextSemester, courses: nextCourses }));
    setWeek(clampWeek(weekOfDate(new Date(), nextSemester), nextSemester.totalWeeks));
    setWebImportVisible(false);
    // 课表整个换了，通知要重排
    invalidateSchedule();
  };

  const handleShiftStart = (days: number) => {
    commit((prev) => ({
      ...prev,
      semester: {
        ...prev.semester,
        startDate: toISODate(addDays(parseISODate(prev.semester.startDate), days)),
      },
    }));
    invalidateSchedule();
  };

  const handleChangeWeeks = (delta: number) => {
    commit((prev) => ({
      ...prev,
      semester: {
        ...prev.semester,
        totalWeeks: Math.min(30, Math.max(1, prev.semester.totalWeeks + delta)),
      },
    }));
    invalidateSchedule();
  };

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />

      <View style={styles.content}>
        {tab === 'week' ? (
          <WeekScreen
            semester={semester}
            courses={courses}
            week={week}
            currentWeek={currentWeek}
            reminderEnabled={prefs.enabled}
            leadMinutes={prefs.leadMinutes}
            scheduledCount={scheduledCount}
            todos={data.todos ?? []}
            onWeekChange={(w) => setWeek(Math.min(Math.max(1, w), totalWeeks))}
            onPressCourse={(c) => setDetail(c)}
            onPressBlank={openBlankSlot}
            onLongPressCourse={(c) => {
              // 单击看详情、长按直接改：原来两个手势都只是打开详情，长按等于白按
              setEditing(c);
              setSheetVisible(true);
            }}
            onOpenImport={() => setWebImportVisible(true)}
            onOpenSettings={() => setTab('settings')}
            onAddCourse={openAddCourse}
          />
        ) : null}

        {tab === 'today' ? (
          <TodayScreen
            semester={semester}
            courses={courses}
            now={now}
            todos={data.todos ?? []}
            onPressCourse={(c) => setDetail(c)}
            onOpenWeek={() => setTab('week')}
            onOpenTodo={openTodo}
            onToggleTodo={toggleTodo}
            onOpenTodos={() => setTab('todos')}
          />
        ) : null}

        {tab === 'todos' ? (
          <TodosScreen
            todos={data.todos ?? []}
            today={toISODate(new Date())}
            onCreate={() => openNewTodo()}
            onOpenTodo={openTodo}
            onToggleTodo={toggleTodo}
          />
        ) : null}

        {tab === 'courses' ? (
          <CoursesScreen
            semester={semester}
            courses={courses}
            onPressCourse={(c) => setDetail(c)}
            onAddCourse={openAddCourse}
          />
        ) : null}

        {tab === 'settings' ? (
          <SettingsScreen
            semester={semester}
            courseCount={courses.length}
            prefs={prefs}
            permission={permission}
            permissions={permissions}
            scheduledCount={scheduledCount}
            nextReminderLabel={nextReminderLabel}
            testState={testState}
            onToggleReminders={handleToggleReminders}
            onLeadChange={handleLeadChange}
            onTestReminder={() => {
              void handleTestReminder();
            }}
            onOpenPermissionGuide={() => setPermissionSheetVisible(true)}
            onOpenImport={() => setWebImportVisible(true)}
            onPinWidget={() => {
              void handlePinWidget();
            }}
            onShiftStart={handleShiftStart}
            onChangeWeeks={handleChangeWeeks}
            onClearCourses={handleClearCourses}
            updateInfo={updateInfo}
            updateStatus={updateStatus}
            onCheckUpdate={() => {
              void checkUpdate(true);
            }}
            onOpenUpdate={() => {
              if (updateInfo) void openUpdate(updateInfo);
            }}
          />
        ) : null}
      </View>

      <View style={[styles.tabHolder, { paddingBottom: bottomPad }]}>
        <TabBar value={tab} onChange={setTab} />
      </View>

      <AddCourseSheet
        visible={sheetVisible}
        semester={semester}
        courses={courses}
        initial={editing}
        prefill={addPrefill}
        onClose={() => {
          setSheetVisible(false);
          setEditing(null);
          setAddPrefill(null);
        }}
        onSave={handleSaveCourse}
      />

      <SlotActionSheet
        visible={slot !== null}
        slotLabel={slot ? `周${WEEKDAY_LABELS[slot.weekday]} 第 ${slot.period} 节` : ''}
        dateLabel={slot ? describeDate(slot.date, toISODate(new Date())) : ''}
        onAddCourse={handleAddCourseFromSlot}
        onAddTodo={handleAddTodoFromSlot}
        onClose={() => setSlot(null)}
      />

      <AddTodoSheet
        visible={todoSheetVisible}
        date={todoDate}
        today={toISODate(new Date())}
        initial={editingTodo}
        onClose={closeTodoSheet}
        onSave={saveTodo}
        onDelete={editingTodo ? () => deleteTodo(editingTodo.id) : undefined}
      />

      <PermissionSheet
        visible={permissionSheetVisible}
        snapshot={permissions}
        onRequestNotifications={() => {
          void handleRequestNotifications();
        }}
        onRequestExactAlarm={() => {
          void handleRequestExactAlarm();
        }}
        onOpenBattery={() => {
          void openBatteryOptimizationSettings();
        }}
        onOpenAutoStart={() => {
          void openAutoStartSettings();
        }}
        onOpenAppSettings={() => {
          void openAppSettings();
        }}
        onClose={() => setPermissionSheetVisible(false)}
      />

      <CourseDetailSheet
        course={detail}
        semester={semester}
        onClose={() => setDetail(null)}
        onEdit={openEditCourse}
        onDelete={handleDelete}
      />

      <WebImportSheet
        visible={webImportVisible}
        semester={semester}
        onClose={() => setWebImportVisible(false)}
        onImported={handleImported}
      />

      <PinHintModal
        visible={pinHintVisible}
        accepted={pinAccepted}
        onClose={() => setPinHintVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  content: { flex: 1 },
  tabHolder: { backgroundColor: colors.surface },
  boot: {
    flex: 1,
    backgroundColor: colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bootText: { fontSize: 20, fontWeight: '700', color: colors.ink, letterSpacing: 3 },
});
