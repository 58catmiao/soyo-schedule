import { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { LEAD_CHOICES, MAX_LEAD_MINUTES, describeLead, clampLead } from '../reminders';
import { colors } from '../theme';

interface Props {
  enabled: boolean;
  leadMinutes: number;
  /** 系统里实际排上的条数；null 表示还没算出来 */
  scheduledCount: number | null;
  /** granted / denied / unsupported */
  permission: 'granted' | 'denied' | 'unsupported' | 'unknown';
  /** 外面已经有「课前提醒」这个段落标题时，别再重复一遍 */
  showTitle?: boolean;
  onToggle: (enabled: boolean) => void;
  onLeadChange: (minutes: number) => void;
}

export function ReminderBar({
  enabled,
  leadMinutes,
  scheduledCount,
  permission,
  showTitle = true,
  onToggle,
  onLeadChange,
}: Props) {
  const supported = permission !== 'unsupported';
  const [draft, setDraft] = useState(String(leadMinutes));

  // 外面改了提前量（点胶囊、从存储读回来）就把输入框同步过去
  useEffect(() => {
    setDraft(String(leadMinutes));
  }, [leadMinutes]);

  const commitDraft = () => {
    const next = clampLead(Number(draft));
    setDraft(String(next));
    if (next !== leadMinutes) onLeadChange(next);
  };

  const status = (() => {
    if (!supported) return '网页版收不到通知，装到手机上才会响';
    if (permission === 'denied') return '系统通知权限被拒，需要去设置里允许';
    if (!enabled) return `开启后每节课${describeLead(leadMinutes)}提醒`;
    if (scheduledCount === null) return '正在排期…';
    if (scheduledCount === 0) return '近 7 天没有待提醒的课';
    return `已排 ${scheduledCount} 条 · 打开 App 会自动重排`;
  })();

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <View style={styles.left}>
          {showTitle ? <Text style={styles.title}>课前提醒</Text> : null}
          <Text style={styles.status}>{status}</Text>
        </View>
        <Switch
          value={enabled}
          onValueChange={onToggle}
          disabled={!supported}
          trackColor={{ true: colors.accent, false: colors.borderStrong }}
          thumbColor="#FFFFFF"
        />
      </View>

      {/* 权限被拒不只是一句话：直接给一条能走的路，比让用户自己去翻设置强 */}
      {permission === 'denied' ? (
        <Pressable
          onPress={() => {
            void Linking.openSettings();
          }}
          style={({ pressed }) => [styles.openSettings, pressed && styles.pressed]}
        >
          <Text style={styles.openSettingsText}>去系统设置里打开通知</Text>
        </Pressable>
      ) : null}

      {enabled && supported ? (
        <View>
          <View style={styles.chips}>
            {LEAD_CHOICES.map((minutes) => {
              const active = minutes === leadMinutes;
              return (
                <Pressable
                  key={minutes}
                  onPress={() => onLeadChange(minutes)}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {minutes} 分钟
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.customRow}>
            <Text style={styles.customLabel}>自定义：每节课</Text>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              onBlur={commitDraft}
              onSubmitEditing={commitDraft}
              keyboardType="number-pad"
              maxLength={3}
              style={styles.customInput}
              placeholder="15"
              placeholderTextColor={colors.textTertiary}
            />
            <Text style={styles.customLabel}>分钟前提醒（0 = 上课时，最多 {MAX_LEAD_MINUTES}）</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {},
  row: { flexDirection: 'row', alignItems: 'center' },
  left: { flex: 1, paddingRight: 10 },
  title: { fontSize: 14, color: colors.ink, fontWeight: '600' },
  status: { fontSize: 11, color: colors.inkFaint, marginTop: 3, lineHeight: 16 },
  chips: { flexDirection: 'row', marginTop: 10, gap: 6, flexWrap: 'wrap' },
  openSettings: {
    marginTop: 10,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.ruleStrong,
    backgroundColor: colors.surface,
  },
  openSettingsText: { fontSize: 12, color: colors.ink, fontWeight: '600' },
  pressed: { opacity: 0.7 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.ruleStrong,
  },
  chipActive: { backgroundColor: colors.pineSoft, borderColor: colors.pine },
  chipText: { fontSize: 12, color: colors.inkSoft },
  chipTextActive: { color: colors.pine, fontWeight: '700' },
  customRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 6, flexWrap: 'wrap' },
  customLabel: { fontSize: 12, color: colors.inkSoft },
  customInput: {
    minWidth: 48,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.ruleStrong,
    backgroundColor: colors.surface,
    color: colors.ink,
    fontSize: 13,
    textAlign: 'center',
  },
});
