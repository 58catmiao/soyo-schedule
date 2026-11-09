import { Modal, Pressable, StyleSheet, Text } from 'react-native';
import { colors, radius } from '../theme';

interface Props {
  visible: boolean;
  /** 「放到桌面」的请求有没有被 launcher 接走（true 也不代表真加上了） */
  accepted: boolean;
  onClose: () => void;
}

export function PinHintModal({ visible, accepted, onClose }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => undefined}>
          <Text style={styles.title}>把课表放到桌面</Text>
          <Text style={styles.body}>
            {accepted
              ? '已经请系统添加了。桌面上如果弹出了确认框，点「添加」就好；要是没动静（不少国产桌面会直接忽略这个请求），手动加一次：'
              : '这个手机的桌面不支持 App 直接弹「添加」框，手动加一次就好：'}
          </Text>
          <Text style={styles.step}>1. 回到桌面，长按空白处</Text>
          <Text style={styles.step}>2. 选「添加小部件 / 桌面小组件」</Text>
          <Text style={styles.step}>3. 找到「soyo」，选「soyo 今日课表」拖到桌面</Text>
          <Text style={styles.note}>
            放好之后不用管它：只要课表有变化、或者你打开一次 soyo，组件就会自己刷新。
          </Text>
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [styles.button, pressed && styles.pressed]}
          >
            <Text style={styles.buttonText}>知道了</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.7 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(17,20,28,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.surface,
    borderRadius: radius.sheet,
    padding: 20,
  },
  title: { fontSize: 17, fontWeight: '700', color: colors.ink },
  body: { marginTop: 8, fontSize: 13, lineHeight: 20, color: colors.inkSoft },
  step: { marginTop: 8, fontSize: 13, lineHeight: 20, color: colors.ink },
  note: { marginTop: 12, fontSize: 12, lineHeight: 18, color: colors.inkFaint },
  button: {
    marginTop: 16,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.pine,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { fontSize: 15, fontWeight: '600', color: '#FFFFFF' },
});
