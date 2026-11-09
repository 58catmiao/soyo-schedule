import { Animated, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { PermissionSnapshot } from '../permissions';
import { colors } from '../theme';
import { useSheetDrag } from './useSheetDrag';

interface Props {
  visible: boolean;
  snapshot: PermissionSnapshot;
  onRequestNotifications: () => void;
  onRequestExactAlarm: () => void;
  onOpenBattery: () => void;
  onOpenAutoStart: () => void;
  onOpenAppSettings: () => void;
  onClose: () => void;
}

type Tone = 'ok' | 'warn' | 'muted';

function statusOf(value: string): { text: string; tone: Tone } {
  if (value === 'granted') return { text: '已开启', tone: 'ok' };
  if (value === 'unsupported') return { text: '系统不需要', tone: 'muted' };
  if (value === 'unknown') return { text: '待确认', tone: 'muted' };
  return { text: '未开启', tone: 'warn' };
}

/**
 * 权限引导面板。
 *
 * 之前 soyo 从不主动要权限：通知、精确闹钟全靠系统默认，用户看到的就是
 * 「测试提醒不发」「30 分钟那条不响」。这里把四个开关摆在一页，
 * 每个都说清楚「不开会怎样」，而不是只丢一个系统弹窗。
 */
export function PermissionSheet({
  visible,
  snapshot,
  onRequestNotifications,
  onRequestExactAlarm,
  onOpenBattery,
  onOpenAutoStart,
  onOpenAppSettings,
  onClose,
}: Props) {
  const { translateY, dragHandlers } = useSheetDrag(onClose);
  const notify = statusOf(snapshot.notifications);
  const alarm = statusOf(snapshot.exactAlarm);

  // 全部齐了就把标题换成结论，免得用户以为还有事要做
  const allReady = notify.tone !== 'warn' && alarm.tone !== 'warn';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.fill}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
          <View style={styles.dragArea} {...dragHandlers}>
            <View style={styles.handle} />
          </View>
          <View style={styles.header}>
            <Text style={styles.title}>{allReady ? '权限都齐了' : '把权限补齐'}</Text>
            <Text style={styles.subtitle}>
              {allReady
                ? '还想更稳，就把电池优化设成「不限制」。'
                : '不补的话，课前提醒可能不响、不准时，桌面小组件也可能加不上。'}
            </Text>
          </View>

          <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            <View style={styles.item}>
              <View style={styles.itemHead}>
                <Text style={styles.itemTitle}>通知权限</Text>
                <Text style={[styles.status, styles[notify.tone]]}>{notify.text}</Text>
              </View>
              <Text style={styles.itemHint}>没有它，测试提醒和课前提醒都不会出现，也不会有震动。</Text>
              {notify.tone === 'warn' ? (
                <View style={styles.btnRow}>
                  <Pressable
                    onPress={onRequestNotifications}
                    style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
                  >
                    <Text style={styles.primaryText}>允许通知</Text>
                  </Pressable>
                  <Pressable
                    onPress={onOpenAppSettings}
                    style={({ pressed }) => [styles.ghostBtn, pressed && styles.pressed]}
                  >
                    <Text style={styles.ghostText}>去系统设置</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>

            <View style={styles.item}>
              <View style={styles.itemHead}>
                <Text style={styles.itemTitle}>精确闹钟</Text>
                <Text style={[styles.status, styles[alarm.tone]]}>{alarm.text}</Text>
              </View>
              <Text style={styles.itemHint}>
                Android 12 起，不准的闹钟会被系统攒着一起发。上课前 30 分钟那条最容易因此迟到或漏掉。
              </Text>
              {alarm.tone === 'warn' ? (
                <View style={styles.btnRow}>
                  <Pressable
                    onPress={onRequestExactAlarm}
                    style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
                  >
                    <Text style={styles.primaryText}>去允许</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>

            <View style={styles.item}>
              <View style={styles.itemHead}>
                <Text style={styles.itemTitle}>电池优化</Text>
                <Text style={[styles.status, styles.muted]}>建议关闭</Text>
              </View>
              <Text style={styles.itemHint}>
                小米 / 华为把后台省电打开后，会在息屏时把提醒往后推。把 soyo 设成「不限制」最稳。
              </Text>
              <View style={styles.btnRow}>
                <Pressable
                  onPress={onOpenBattery}
                  style={({ pressed }) => [styles.ghostBtn, pressed && styles.pressed]}
                >
                  <Text style={styles.ghostText}>去设置</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.item}>
              <View style={styles.itemHead}>
                <Text style={styles.itemTitle}>自启动 / 后台运行</Text>
                <Text style={[styles.status, styles.muted]}>按机型</Text>
              </View>
              <Text style={styles.itemHint}>
                小米要单独允许「自启动」，否则重启手机后提醒可能不再排。
              </Text>
              <View style={styles.btnRow}>
                <Pressable
                  onPress={onOpenAutoStart}
                  style={({ pressed }) => [styles.ghostBtn, pressed && styles.pressed]}
                >
                  <Text style={styles.ghostText}>去设置</Text>
                </Pressable>
              </View>
            </View>

            <Pressable
              onPress={onClose}
              style={({ pressed }) => [styles.doneBtn, pressed && styles.pressed]}
            >
              <Text style={styles.doneText}>{allReady ? '完成' : '我知道了'}</Text>
            </Pressable>
          </ScrollView>
        </Animated.View>
      </View>
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
    maxHeight: '86%',
    paddingBottom: 10,
  },
  dragArea: { paddingBottom: 8 },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
    marginTop: 8,
  },
  header: { paddingHorizontal: 18, paddingBottom: 4 },
  title: { fontSize: 18, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: 12.5, color: colors.textSecondary, marginTop: 6, lineHeight: 18 },
  body: { paddingHorizontal: 18, paddingBottom: 26, paddingTop: 8 },
  item: {
    marginTop: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: colors.bg,
  },
  itemHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  itemTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  status: { fontSize: 12, fontWeight: '600' },
  ok: { color: colors.pine },
  warn: { color: colors.danger },
  muted: { color: colors.textTertiary },
  itemHint: { fontSize: 12, color: colors.textSecondary, marginTop: 6, lineHeight: 17 },
  btnRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  primaryBtn: {
    flex: 1,
    height: 38,
    borderRadius: 10,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { fontSize: 13.5, fontWeight: '600', color: '#FFFFFF' },
  ghostBtn: {
    flex: 1,
    height: 38,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostText: { fontSize: 13.5, color: colors.text },
  doneBtn: {
    marginTop: 18,
    height: 46,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneText: { fontSize: 15, fontWeight: '600', color: colors.text },
  pressed: { opacity: 0.7 },
});
