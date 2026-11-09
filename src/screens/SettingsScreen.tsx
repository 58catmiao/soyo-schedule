import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { Semester } from '../types';
import { ReminderPrefs } from '../reminderPrefs';
import type { PermissionSnapshot } from '../permissions';
import { colors, radius } from '../theme';
import { safeTop } from '../safeArea';
import { ReminderBar } from '../components/ReminderBar';
import {
  formatLogTime,
  loadImportLog,
  shareImportLog,
  type ImportLogEntry,
} from '../importLog';
import type { UpdateInfo, UpdateStatus } from '../updater';

interface Props {
  semester: Semester;
  courseCount: number;
  prefs: ReminderPrefs;
  permission: 'granted' | 'denied' | 'unsupported' | 'unknown';
  permissions: PermissionSnapshot;
  scheduledCount: number | null;
  /** 「11 月 10 日 08:45 · 高等数学」，没有排期时为 null */
  nextReminderLabel: string | null;
  testState: 'idle' | 'sent' | 'failed';
  onToggleReminders: (enabled: boolean) => void;
  onLeadChange: (minutes: number) => void;
  onTestReminder: () => void;
  onOpenPermissionGuide: () => void;
  onOpenImport: () => void;
  onPinWidget: () => void;
  onShiftStart: (days: number) => void;
  onChangeWeeks: (delta: number) => void;
  onClearCourses: () => void;
  updateInfo: UpdateInfo | null;
  updateStatus: UpdateStatus;
  onCheckUpdate: () => void;
  onOpenUpdate: () => void;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function ActionRow({
  label,
  value,
  onPress,
  danger,
}: {
  label: string;
  value?: string;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.actionRow, pressed && styles.pressed]}
    >
      <Text style={[styles.actionLabel, danger && styles.dangerText]}>{label}</Text>
      {value ? <Text style={styles.actionValue}>{value}</Text> : null}
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

export function SettingsScreen({
  semester,
  courseCount,
  prefs,
  permission,
  permissions,
  scheduledCount,
  nextReminderLabel,
  testState,
  onToggleReminders,
  onLeadChange,
  onTestReminder,
  onOpenPermissionGuide,
  onOpenImport,
  onPinWidget,
  onShiftStart,
  onChangeWeeks,
  onClearCourses,
  updateInfo,
  updateStatus,
  onCheckUpdate,
  onOpenUpdate,
}: Props) {
  const topPad = safeTop();
  const [clearArmed, setClearArmed] = useState(false);
  /** 最近一次网页导入的诊断快照；导入页不再摆日志，都收在这里 */
  const [importLog, setImportLog] = useState<ImportLogEntry | null>(null);
  const [logNote, setLogNote] = useState('');

  const alarmOk = permissions.exactAlarm === 'granted' || permissions.exactAlarm === 'unsupported';
  const notifyOk = permissions.notifications === 'granted' || permissions.notifications === 'unsupported';
  const permissionLabel = notifyOk && alarmOk ? '都开了' : '有未开启项';

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const entry = await loadImportLog();
      if (!cancelled) setImportLog(entry);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 「再点一次」会自己失效：不设时限的话，隔很久手滑点到同一个位置也会清空。
  useEffect(() => {
    if (!clearArmed) return undefined;
    const timer = setTimeout(() => setClearArmed(false), 4000);
    return () => clearTimeout(timer);
  }, [clearArmed]);

  const handleExportLog = async () => {
    const ok = await shareImportLog(importLog);
    setLogNote(ok ? '' : '没能打开分享，换个方式再试一次。');
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.body, { paddingTop: topPad + 10 }]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>设置</Text>

      <Section title="权限">
        <ActionRow label="提醒送达" value={permissionLabel} onPress={onOpenPermissionGuide} />
        <Text style={notifyOk && alarmOk ? styles.note : styles.noteDanger}>
          {notifyOk && alarmOk
            ? '通知和精确闹钟都在。想让息屏后也准时，再进去把省电设成「不限制」。'
            : '提醒不响、不震动或不准时，多半是这里没开：通知管响不响，精确闹钟和省电管准不准时。'}
        </Text>
      </Section>

      <Section title="课前提醒">
        <ReminderBar
          enabled={prefs.enabled}
          leadMinutes={prefs.leadMinutes}
          scheduledCount={scheduledCount}
          permission={permission}
          showTitle={false}
          onToggle={onToggleReminders}
          onLeadChange={onLeadChange}
        />

        <Pressable
          onPress={onTestReminder}
          style={({ pressed }) => [styles.testBtn, pressed && styles.pressed]}
        >
          <Text style={styles.testBtnText}>发一条测试提醒</Text>
        </Pressable>
        <Text style={styles.note}>
          {testState === 'sent'
            ? '已发出：把 App 切到后台，5 秒内应该会弹出一条通知。'
            : testState === 'failed'
              ? '发不出去：多半是系统通知权限没开，或者当前是网页预览。'
              : '点一下会在 5 秒后发一条，用来确认权限和声音都正常。'}
        </Text>
        {nextReminderLabel ? (
          <View style={styles.kvRow}>
            <Text style={styles.kvLabel}>下一条</Text>
            <Text style={styles.kvValue}>{nextReminderLabel}</Text>
          </View>
        ) : prefs.enabled ? (
          <Text style={styles.noteDanger}>现在没有排上任何提醒，检查一下课表和上面的权限。</Text>
        ) : null}
      </Section>

      <Section title="学期">
        <View style={styles.kvRow}>
          <Text style={styles.kvLabel}>名称</Text>
          <Text style={styles.kvValue}>{semester.name}</Text>
        </View>
        <View style={styles.kvRow}>
          <Text style={styles.kvLabel}>第 1 周周一</Text>
          <View style={styles.kvRight}>
            <Pressable
              onPress={() => onShiftStart(-7)}
              style={({ pressed }) => [styles.stepBtn, pressed && styles.pressed]}
            >
              <Text style={styles.stepBtnText}>−7 天</Text>
            </Pressable>
            <Text style={styles.kvValue}>{semester.startDate}</Text>
            <Pressable
              onPress={() => onShiftStart(7)}
              style={({ pressed }) => [styles.stepBtn, pressed && styles.pressed]}
            >
              <Text style={styles.stepBtnText}>+7 天</Text>
            </Pressable>
          </View>
        </View>
        <View style={styles.kvRow}>
          <Text style={styles.kvLabel}>总周数</Text>
          <View style={styles.kvRight}>
            <Pressable
              onPress={() => onChangeWeeks(-1)}
              style={({ pressed }) => [styles.stepBtn, pressed && styles.pressed]}
            >
              <Text style={styles.stepBtnText}>−</Text>
            </Pressable>
            <Text style={styles.kvValue}>{semester.totalWeeks} 周</Text>
            <Pressable
              onPress={() => onChangeWeeks(1)}
              style={({ pressed }) => [styles.stepBtn, pressed && styles.pressed]}
            >
              <Text style={styles.stepBtnText}>+</Text>
            </Pressable>
          </View>
        </View>
        <Text style={styles.note}>
          改起始日会让所有课的日期跟着平移；导入课表时会按教务系统的学期覆盖这里。
        </Text>
      </Section>

      <Section title="课表">
        <ActionRow label="导入课表" value={courseCount ? `现有 ${courseCount} 门` : '还没有课'} onPress={onOpenImport} />
        <ActionRow label="放到手机桌面" value="桌面小组件" onPress={onPinWidget} />
        <Pressable
          onPress={() => {
            if (!clearArmed) {
              setClearArmed(true);
              return;
            }
            setClearArmed(false);
            onClearCourses();
          }}
          style={({ pressed }) => [
            styles.actionRow,
            pressed && styles.pressed,
            clearArmed && styles.armedRow,
          ]}
        >
          <Text style={[styles.actionLabel, styles.dangerText]}>
            {clearArmed ? '再点一次就清空全部课程' : '清空全部课程'}
          </Text>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
      </Section>

      <Section title="关于">
        <View style={styles.kvRow}>
          <Text style={styles.kvLabel}>版本</Text>
          <Text style={styles.kvValue}>soyo {Constants.expoConfig?.version ?? '—'}</Text>
        </View>

        {updateInfo ? (
          <View style={styles.updateBox}>
            <Text style={styles.updateTitle}>有新版本 {updateInfo.version}</Text>
            {updateInfo.notes ? <Text style={styles.updateNotes}>{updateInfo.notes}</Text> : null}
            <Pressable
              onPress={onOpenUpdate}
              style={({ pressed }) => [styles.updateBtn, pressed && styles.pressed]}
            >
              <Text style={styles.updateBtnText}>下载更新</Text>
            </Pressable>
            <Text style={styles.updateHint}>
              下载完点通知就能装，签名没变，课表会原样留着。
            </Text>
          </View>
        ) : (
          <ActionRow
            label="检查更新"
            value={
              updateStatus === 'checking'
                ? '正在检查…'
                : updateStatus === 'error'
                  ? '连不上，点一下重试'
                  : updateStatus === 'latest'
                    ? '已是最新'
                    : '点一下检查'
            }
            onPress={onCheckUpdate}
          />
        )}

        <ActionRow
          label="导入诊断"
          value={importLog ? formatLogTime(importLog.at) : '暂无'}
          onPress={() => void handleExportLog()}
        />
        <Text style={styles.note}>
          导入出问题时点上面这一行，把最近一次抓到的页面结构发出来，比「课表不对」这句话好查得多。
        </Text>
        {logNote ? <Text style={styles.noteDanger}>{logNote}</Text> : null}
        <Text style={styles.note}>
          课表只存在这台手机里，不上传。导入用的是学校教务系统自己的网页，soyo 不碰你的账号密码。
        </Text>
      </Section>

      <Text style={styles.signature}>
        每天该去哪，一眼就知道。
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  body: { paddingHorizontal: 16, paddingBottom: 96 },
  title: { fontSize: 27, fontWeight: '700', color: colors.ink, letterSpacing: -0.7 },
  section: {
    marginTop: 18,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.ruleStrong,
  },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: colors.ink, marginBottom: 6 },
  kvRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  kvLabel: { fontSize: 13, color: colors.inkSoft },  kvRight: { flexDirection: 'row', alignItems: 'center' },
  kvValue: { fontSize: 13, color: colors.ink, fontWeight: '600', marginHorizontal: 8 },
  stepBtn: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.ruleStrong,
  },
  stepBtnText: { fontSize: 11, color: colors.pine, fontWeight: '600' },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.rule,
  },
  actionLabel: { flex: 1, fontSize: 14, color: colors.ink },
  actionValue: { fontSize: 12, color: colors.inkFaint, marginRight: 6 },
  chevron: { fontSize: 16, color: colors.inkFaint },
  dangerText: { color: colors.danger },
  armedRow: { backgroundColor: colors.dangerSoft, marginHorizontal: -8, paddingHorizontal: 8 },
  testBtn: {
    marginTop: 12,
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.pine,
  },
  testBtnText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  note: { marginTop: 8, fontSize: 11.5, lineHeight: 17, color: colors.inkFaint },
  noteDanger: { marginTop: 6, fontSize: 11.5, lineHeight: 17, color: colors.danger },
  updateBox: {
    marginTop: 10,
    padding: 14,
    borderRadius: radius.card,
    backgroundColor: colors.pineSoft,
  },
  updateTitle: { fontSize: 14, fontWeight: '700', color: colors.pine },
  updateNotes: {
    marginTop: 6,
    fontSize: 11.5,
    lineHeight: 17,
    color: colors.inkSoft,
  },
  updateBtn: {
    marginTop: 12,
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: radius.pill,
    backgroundColor: colors.pine,
  },
  updateBtnText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  updateHint: { marginTop: 10, fontSize: 11, lineHeight: 16, color: colors.inkFaint },
  signature: {
    marginTop: 34,
    textAlign: 'center',
    fontSize: 11,
    color: colors.inkFaint,
    letterSpacing: 1,
  },
  pressed: { opacity: 0.6 },
});
