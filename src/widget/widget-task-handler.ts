/**
 * 桌面小组件的任务入口。
 *
 * Android 在「添加组件 / 到点刷新 / 点击」时会拉起这个 Headless JS 任务，
 * 我们在这里读本地课表、拼好 RemoteViews 交给 renderWidget。
 * 注意：它不是普通的 React 组件，不能有 hook。
 */
import { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { loadData } from '../storage';
import { makeInitialSemester } from '../seed';
import { renderTodayWidget } from './render-widget';

export { WIDGET_NAME } from './name';

export async function widgetTaskHandler(props: WidgetTaskHandlerProps): Promise<void> {
  const { widgetAction, widgetInfo, renderWidget } = props;

  if (widgetAction === 'WIDGET_DELETED') {
    return;
  }

  try {
    const data = (await loadData()) ?? {
      semester: makeInitialSemester(),
      courses: [],
    };
    renderWidget(renderTodayWidget(data, new Date(), widgetInfo.height));
  } catch {
    // 读不出来也要给个能看的空态，别让组件变成一片空白
    renderWidget(
      renderTodayWidget(
        { semester: makeInitialSemester(), courses: [] },
        new Date(),
        widgetInfo.height
      )
    );
  }
}
