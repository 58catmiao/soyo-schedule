import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppData, Course } from './src/types';
import { addDays, parseISODate, toISODate, weekOfDate } from './src/schedule';
import { makeInitialSemester } from './src/seed';
import { loadData, saveData } from './src/storage';
import { DEFAULT_PREFS, ReminderPrefs, loadPrefs, savePrefs } from './src/reminderPrefs';
import {
  DEFAULT_REMINDER_OPTIONS,
  buildReminders,
  clampLead,
  reminderSignature,
} from './src/reminders';
import {
  cancelAllReminders,
  ensurePermission,
  isNotificationSupported,
  scheduleReminders,
  sendTestReminder,
} from './src/notifications';
import { colors, radius } from './src/theme';
import { AddCourseSheet } from './src/components/AddCourseSheet';
import { CourseDetailSheet } from './src/components/CourseDetailSheet';
import WebImportSheet from './src/components/WebImportSheet';
import { TabBar, Tab } from './src/components/TabBar';
import { WeekScreen } from './src/screens/WeekScreen';
import { TodayScreen } from './src/screens/TodayScreen';
import { CoursesScreen } from './src/screens/CoursesScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { pinTodayWidget, refreshTodayWidget } from './src/widget/refresh';
import { safeBottom } from './src/safeArea';
import Constants from 'expo-constants';
import {
  AUTO_CHECK_INTERVAL_MS,
  UpdateInfo,
  UpdateStatus,
  fetchLatestRelease,
  openUpdate,
  readLastCheck,
  writeLastCheck,
} from './src/updater';

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
  const [permission, setPermission] = useState<
    'granted' | 'denied' | 'unsupported' | 'unknown'
  >(isNotificationSupported() ? 'unknown' : 'unsupported');
  const [scheduledCount, setScheduledCount] = useState<number | null>(null);
  const [testState, setTestState] = useState<'idle' | 'sent' | 'failed'>('idle');
  /** launcher 不支持「一键添加」时，改用一页手把手说明 */
  const [pinHintVisible, setPinHintVisible] = useState(false);
  /** 「放到桌面」的请求有没有被 launcher 接走 —— true 也只代表请求发出去了，不代表真加上了 */
  const [pinAccepted, setPinAccepted] = useState(false);
  /**
   * 「现在」只给今日页用。
   *
   * 早先是常驻的 30 秒定时器：每跳一次都重渲染整棵树，而周视图同时挂着三张课表。
   * 现在只有停在今日页时才走表，切过去的那一刻也先取一次最新时间。
   */
  const [now, setNow] = useState(() => new Date());

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

  useEffect(() => {
    if (!dirtyRef.current || !data) return;
    dirtyRef.current = false;
    void saveData(data);
  }, [data]);

  /**
   * 回到前台时叫醒一次：排期窗口只有 7 天，连续一周不开 App，
   * 下周的课就一条提醒都没有。顺手也重读一次权限——
   * 用户去系统设置里开了通知、再切回来，状态才会跟着变。
   */
  const [resumeTick, setResumeTick] = useState(0);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setResumeTick((n) => n + 1);
    });
    return () => sub.remove();
  }, []);

  /**
   * 课表或提醒设置一变就重排通知。
   *
   * 只在原生端真做（网页版没有通知通道）。排期指纹没变的就不重复打扰系统。
   */
  const lastSignature = useRef<string>('');
  useEffect(() => {
    if (!data) return;
    let cancelled = false;

    (async () => {
      if (!prefs.enabled) {
        await cancelAllReminders();
        lastSignature.current = '';
        if (!cancelled) setScheduledCount(0);
        return;
      }

      const state = await ensurePermission();
      if (cancelled) return;
      setPermission(state);
      if (state !== 'granted') {
        if (!cancelled) setScheduledCount(null);
        return;
      }

      const reminders = buildReminders(data.courses, data.semester, new Date(), {
        ...DEFAULT_REMINDER_OPTIONS,
        leadMinutes: prefs.leadMinutes,
      });
      const signature = reminderSignature(reminders);
      if (signature === lastSignature.current) return;

      // 指纹要等真的排上了再记：先记账再排的话，一旦失败就再也不会重试，
      // 用户看着「已排 30 条」，其实一条都没进系统。
      try {
        const count = await scheduleReminders(reminders);
        lastSignature.current = signature;
        if (!cancelled) setScheduledCount(count);
      } catch {
        lastSignature.current = '';
        if (!cancelled) setScheduledCount(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [data, prefs.enabled, prefs.leadMinutes, resumeTick]);

  /** 课表一变就顺手把桌面小组件刷一遍（桌面上没放组件时什么都不会发生） */
  useEffect(() => {
    if (!data) return;
    void refreshTodayWidget(data);
  }, [data]);

  /**
   * 应用内更新：启动时最多每 6 小时查一次 GitHub 上的最新 release，
   * 设置页也能手动点。只提示 + 打开下载地址，装包交给系统。
   */
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>('idle');

  const runUpdateCheck = useCallback(async (manual: boolean) => {
    const current = Constants.expoConfig?.version ?? '0.0.0';
    if (!manual) {
      const last = await readLastCheck();
      if (Date.now() - last < AUTO_CHECK_INTERVAL_MS) return;
    }
    setUpdateStatus('checking');
    try {
      const info = await fetchLatestRelease(current);
      await writeLastCheck(Date.now());
      setUpdateInfo(info);
      setUpdateStatus(info ? 'available' : 'latest');
    } catch {
      setUpdateStatus('error');
    }
  }, []);

  useEffect(() => {
    void runUpdateCheck(false);
  }, [runUpdateCheck]);

  const handleToggleReminders = (enabled: boolean) => {
    const next = { ...prefs, enabled };
    setPrefs(next);
    void savePrefs(next);
  };

  const handleLeadChange = (minutes: number) => {
    const next = { ...prefs, leadMinutes: clampLead(minutes) };
    setPrefs(next);
    void savePrefs(next);
    lastSignature.current = '';
  };

  const handleTestReminder = async () => {
    const ok = await sendTestReminder(5);
    setTestState(ok ? 'sent' : 'failed');
    setTimeout(() => setTestState('idle'), 10_000);
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
    setSheetVisible(true);
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
    lastSignature.current = '';
  };

  const handleImported = (nextSemester: AppData['semester'], nextCourses: Course[]) => {
    commit(() => ({ semester: nextSemester, courses: nextCourses }));
    setWeek(clampWeek(weekOfDate(new Date(), nextSemester), nextSemester.totalWeeks));
    setWebImportVisible(false);
    // 课表整个换了，通知要重排
    lastSignature.current = '';
  };

  const handleShiftStart = (days: number) => {
    commit((prev) => ({
      ...prev,
      semester: {
        ...prev.semester,
        startDate: toISODate(addDays(parseISODate(prev.semester.startDate), days)),
      },
    }));
    lastSignature.current = '';
  };

  const handleChangeWeeks = (delta: number) => {
    commit((prev) => ({
      ...prev,
      semester: {
        ...prev.semester,
        totalWeeks: Math.min(30, Math.max(1, prev.semester.totalWeeks + delta)),
      },
    }));
    lastSignature.current = '';
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
            onWeekChange={(w) => setWeek(Math.min(Math.max(1, w), totalWeeks))}
            onPressCourse={(c) => setDetail(c)}
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
            onPressCourse={(c) => setDetail(c)}
            onOpenWeek={() => setTab('week')}
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
            scheduledCount={scheduledCount}
            testState={testState}
            onToggleReminders={handleToggleReminders}
            onLeadChange={handleLeadChange}
            onTestReminder={() => {
              void handleTestReminder();
            }}
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
              void runUpdateCheck(true);
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
        onClose={() => {
          setSheetVisible(false);
          setEditing(null);
        }}
        onSave={handleSaveCourse}
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

      <Modal
        visible={pinHintVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPinHintVisible(false)}
      >
        <Pressable style={styles.pinBackdrop} onPress={() => setPinHintVisible(false)}>
          <Pressable style={styles.pinCard} onPress={() => undefined}>
            <Text style={styles.pinTitle}>把课表放到桌面</Text>
            <Text style={styles.pinBody}>
              {pinAccepted
                ? '已经请系统添加了。桌面上如果弹出了确认框，点「添加」就好；要是没动静（不少国产桌面会直接忽略这个请求），手动加一次：'
                : '这个手机的桌面不支持 App 直接弹「添加」框，手动加一次就好：'}
            </Text>
            <Text style={styles.pinStep}>1. 回到桌面，长按空白处</Text>
            <Text style={styles.pinStep}>2. 选「添加小部件 / 桌面小组件」</Text>
            <Text style={styles.pinStep}>3. 找到「soyo」，选「soyo 今日课表」拖到桌面</Text>
            <Text style={styles.pinNote}>
              放好之后不用管它：只要课表有变化、或者你打开一次 soyo，组件就会自己刷新。
            </Text>
            <Pressable
              onPress={() => setPinHintVisible(false)}
              style={({ pressed }) => [styles.pinBtn, pressed && styles.pressed]}
            >
              <Text style={styles.pinBtnText}>知道了</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
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
  pressed: { opacity: 0.7 },
  pinBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(17,20,28,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  pinCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.surface,
    borderRadius: radius.sheet,
    padding: 20,
  },
  pinTitle: { fontSize: 17, fontWeight: '700', color: colors.ink },
  pinBody: { marginTop: 8, fontSize: 13, lineHeight: 20, color: colors.inkSoft },
  pinStep: { marginTop: 8, fontSize: 13, lineHeight: 20, color: colors.ink },
  pinNote: { marginTop: 12, fontSize: 12, lineHeight: 18, color: colors.inkFaint },
  pinBtn: {
    marginTop: 16,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.pine,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinBtnText: { fontSize: 15, fontWeight: '600', color: '#FFFFFF' },
});
