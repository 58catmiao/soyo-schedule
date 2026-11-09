/**
 * 桌面小组件的内容渲染。
 *
 * 这里跑在 Headless JS 里，不能用 React hook、不能有副作用，
 * 就是一个「读数据 → 拼 JSX」的纯函数。
 *
 * 版式参考了校园集市那张卡片：左边一块巨大的日期（第几周 + 周几），
 * 右边是「最近还有课的那一天」的课表，放不下的收成「其他 N 节课程」。
 */
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import { AppData, WEEKDAY_LABELS } from '../types';
import { PreviewGroup, PreviewItem, selectToday } from './select';

const INK = '#14181A';
const SOFT = '#5E6A64';
const FAINT = '#98A29B';
const PINE = '#17493C';

function ItemRow({ item }: { item: PreviewItem }) {
  const time =
    item.startLabel && item.endLabel
      ? `${item.startLabel}-${item.endLabel}`
      : item.startLabel || '';
  const where = item.course.location || '';
  return (
    <FlexWidget style={{ flexDirection: 'row', marginTop: 8 }}>
      <FlexWidget
        style={{
          width: 3,
          backgroundColor: item.course.color as `#${string}`,
          borderRadius: 2,
          marginRight: 9,
        }}
      />
      <FlexWidget style={{ flex: 1, flexDirection: 'column' }}>
        <TextWidget
          text={item.course.name}
          style={{ fontSize: 13, color: INK, fontWeight: '600' }}
          maxLines={1}
          truncate="END"
        />
        <TextWidget
          text={time}
          style={{ fontSize: 10.5, color: SOFT, marginTop: 1 }}
          maxLines={1}
          truncate="END"
        />
        {where ? (
          <TextWidget
            text={where}
            style={{ fontSize: 10, color: FAINT, marginTop: 1 }}
            maxLines={1}
            truncate="END"
          />
        ) : null}
      </FlexWidget>
    </FlexWidget>
  );
}

function Group({ group }: { group: PreviewGroup }) {
  return (
    <FlexWidget style={{ flex: 1, flexDirection: 'column' }}>
      <TextWidget text={group.label} style={{ fontSize: 11, color: SOFT }} maxLines={1} />
      {group.items.map((item) => (
        <ItemRow key={item.course.id} item={item} />
      ))}
      {group.hiddenCount > 0 ? (
        <TextWidget
          text={`其他 ${group.hiddenCount} 节课程`}
          style={{ fontSize: 10, color: FAINT, marginTop: 6 }}
          maxLines={1}
        />
      ) : null}
    </FlexWidget>
  );
}

/** 依据当前时间决定显示什么 */
export function renderTodayWidget(data: AppData, now: Date, heightDp: number) {
  const maxItems = heightDp >= 220 ? 3 : heightDp >= 150 ? 2 : 1;
  const { week, inRange, weekday, remaining, hasCourses, groups } = selectToday(data, now);

  const todayCount = remaining.length;
  const dayNumber = now.getDate();

  const group = groups[0];

  const leftSummary = !hasCourses
    ? '还没导入课表'
    : !inRange
      ? '现在不是上课周'
      : todayCount > 0
        ? `今天 ${todayCount} 节课`
        : '今天没有课程';

  return (
    <FlexWidget
      // 整张卡片点一下打开 soyo。原来根节点没有 clickAction，
      // 用户点上去完全没反应（1.9.2 反馈最多的那条）。
      clickAction="OPEN_APP"
      accessibilityLabel="打开 soyo"
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: '#FFFFFF',
        borderRadius: 20,
        padding: 14,
        flexDirection: 'row',
      }}
    >
      {/* 左：巨大的日期 */}
      <FlexWidget
        style={{
          width: 74,
          flexDirection: 'column',
          justifyContent: 'flex-start',
          paddingRight: 8,
        }}
      >
        <FlexWidget style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
          <TextWidget
            text={String(dayNumber)}
            style={{ fontSize: 34, color: INK, fontWeight: '700' }}
            maxLines={1}
          />
          <FlexWidget style={{ flexDirection: 'column', marginLeft: 6, paddingBottom: 3 }}>
            <TextWidget
              text={inRange ? `${week}周` : '假期'}
              style={{ fontSize: 10, color: PINE, fontWeight: '700' }}
              maxLines={1}
            />
            <TextWidget
              text={`周${WEEKDAY_LABELS[weekday]}`}
              style={{ fontSize: 10, color: SOFT, marginTop: 2 }}
              maxLines={1}
            />
          </FlexWidget>
        </FlexWidget>
        <TextWidget
          text={leftSummary}
          style={{ fontSize: 10, color: FAINT, marginTop: 6 }}
          maxLines={1}
          truncate="END"
        />
      </FlexWidget>

      {/* 右：最近还有课的那一天 */}
      {group ? (
        <Group group={{ ...group, items: group.items.slice(0, maxItems) }} />
      ) : (
        <FlexWidget style={{ flex: 1, flexDirection: 'column', justifyContent: 'center' }}>
          <TextWidget
            text={hasCourses ? '接下来一周没课' : '打开 soyo 导入一下'}
            style={{ fontSize: 12, color: SOFT }}
            maxLines={2}
          />
        </FlexWidget>
      )}
    </FlexWidget>
  );
}
