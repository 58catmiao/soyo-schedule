import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Todo } from '../types';
import { describeDate } from '../todos';
import { colors } from '../theme';
import { safeTop } from '../safeArea';

interface Props {
  todos: Todo[];
  today: string;
  onCreate: () => void;
  onOpenTodo: (todo: Todo) => void;
  onToggleTodo: (id: string) => void;
}

function byDate(a: Todo, b: Todo): number {
  return a.date.localeCompare(b.date) || a.id.localeCompare(b.id);
}

function TodoRow({
  todo,
  today,
  onOpen,
  onToggle,
}: {
  todo: Todo;
  today: string;
  onOpen: () => void;
  onToggle: () => void;
}) {
  const overdue = !todo.done && todo.date < today;
  const when = describeDate(todo.date, today);
  const meta = overdue ? `逾期 · ${when}` : todo.note ? `${when} · ${todo.note}` : when;

  return (
    <View style={styles.row}>
      <Pressable
        onPress={onToggle}
        hitSlop={8}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: todo.done }}
        accessibilityLabel={`${todo.title}，${todo.done ? '已完成' : '未完成'}`}
        style={styles.checkHit}
      >
        <View style={[styles.checkbox, todo.done && styles.checkboxOn]}>
          {todo.done ? <Text style={styles.checkboxMark}>✓</Text> : null}
        </View>
      </Pressable>
      <Pressable onPress={onOpen} style={({ pressed }) => [styles.rowMain, pressed && styles.pressed]}>
        <Text numberOfLines={2} style={[styles.rowName, todo.done && styles.done]}>
          {todo.title}
        </Text>
        <Text numberOfLines={1} style={[styles.rowMeta, overdue && styles.overdue]}>
          {meta}
        </Text>
      </Pressable>
    </View>
  );
}

/**
 * 待办总览。
 *
 * 今日页只露今天和逾期的那几条，做完了、排到下周的都要有地方翻——
 * 这一页按「逾期 / 今天 / 之后 / 已完成」四段把所有待办摊开，新建也从这里进。
 */
export function TodosScreen({ todos, today, onCreate, onOpenTodo, onToggleTodo }: Props) {
  const topPad = safeTop();
  const pending = todos.filter((t) => !t.done);
  const overdue = pending.filter((t) => t.date < today).sort(byDate);
  const dueToday = pending.filter((t) => t.date === today).sort(byDate);
  const later = pending.filter((t) => t.date > today).sort(byDate);
  const done = todos.filter((t) => t.done).sort((a, b) => b.date.localeCompare(a.date));

  const allGroups: { title: string; items: Todo[]; tone?: 'danger' }[] = [
    { title: '逾期', items: overdue, tone: 'danger' },
    { title: '今天', items: dueToday },
    { title: '之后', items: later },
    { title: '已完成', items: done },
  ];
  const groups = allGroups.filter((group) => group.items.length > 0);

  const summary =
    pending.length === 0
      ? done.length > 0
        ? '都做完了'
        : '还没有待办'
      : `${pending.length} 件未完成${overdue.length > 0 ? ` · ${overdue.length} 件逾期` : ''}`;

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.body, { paddingTop: topPad + 10 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topRow}>
          <Text style={styles.title}>待办</Text>
          <View style={styles.spacer} />
          <Pressable onPress={onCreate} hitSlop={8} style={styles.textBtnHit}>
            <Text style={styles.textBtn}>＋ 新建</Text>
          </Pressable>
        </View>
        <Text style={styles.summary}>{summary}</Text>

        {groups.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>还没有待办</Text>
            <Text style={styles.emptyHint}>
              点右上角新建一条；在课表空白格点一下，也能直接给那一天加待办。
            </Text>
          </View>
        ) : (
          groups.map((group) => (
            <View key={group.title} style={styles.group}>
              <View style={styles.groupHead}>
                <Text style={[styles.groupTitle, group.tone === 'danger' && styles.danger]}>
                  {group.title}
                </Text>
                <Text style={styles.groupCount}>{group.items.length} 件</Text>
              </View>
              {group.items.map((todo) => (
                <TodoRow
                  key={todo.id}
                  todo={todo}
                  today={today}
                  onOpen={() => onOpenTodo(todo)}
                  onToggle={() => onToggleTodo(todo.id)}
                />
              ))}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flex: 1 },
  body: { paddingHorizontal: 16, paddingBottom: 40 },
  topRow: { flexDirection: 'row', alignItems: 'flex-end' },
  title: { fontSize: 27, fontWeight: '700', color: colors.ink, letterSpacing: -0.7 },
  spacer: { flex: 1 },
  textBtnHit: { paddingVertical: 6, paddingLeft: 12 },
  textBtn: { fontSize: 13, fontWeight: '600', color: colors.pine },
  summary: { fontSize: 12, color: colors.inkFaint, marginTop: 2, marginBottom: 8 },
  group: { marginTop: 16 },
  groupHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.ruleStrong,
  },
  groupTitle: { fontSize: 13, fontWeight: '700', color: colors.ink },
  groupCount: { fontSize: 11, color: colors.inkFaint, marginLeft: 8 },
  danger: { color: colors.danger },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.rule,
  },
  checkHit: { paddingRight: 12, paddingVertical: 6 },
  checkbox: {
    width: 21,
    height: 21,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.ruleStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: colors.pine, borderColor: colors.pine },
  checkboxMark: { fontSize: 12, fontWeight: '700', color: '#FFFFFF', lineHeight: 14 },
  rowMain: { flex: 1, paddingRight: 8 },
  rowName: { fontSize: 15, fontWeight: '600', color: colors.ink },
  rowMeta: { fontSize: 12, color: colors.inkSoft, marginTop: 2 },
  done: { color: colors.inkFaint, textDecorationLine: 'line-through' },
  overdue: { color: colors.danger },
  empty: { marginTop: 24 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  emptyHint: { marginTop: 6, fontSize: 13, lineHeight: 20, color: colors.inkSoft },
  pressed: { opacity: 0.6 },
});
