/**
 * 桌面小组件的刷新与「添加到桌面」。
 *
 * react-native-android-widget 在非 Android 平台会退化成空实现（内部按
 * Platform.OS 判断），所以这里可以放心直接 import，网页版调用不会炸。
 */
import { Platform } from 'react-native';
import { requestPinWidget, requestWidgetUpdate } from 'react-native-android-widget';
import { AppData } from '../types';
import { renderTodayWidget } from './render-widget';
import { WIDGET_NAME } from './name';

let warnedMissing = false;

/** 课表一变就推给桌面上所有同名组件 */
export async function refreshTodayWidget(data: AppData): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await requestWidgetUpdate({
      widgetName: WIDGET_NAME,
      renderWidget: (info) => renderTodayWidget(data, new Date(), info.height),
      widgetNotFound: () => {
        warnedMissing = true;
      },
    });
  } catch {
    // 桌面没有组件时不必打扰用户
  }
}

/** 拉起系统的「添加组件」确认框；返回是否被 launcher 接受 */
export async function pinTodayWidget(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    return await requestPinWidget({ widgetName: WIDGET_NAME });
  } catch {
    return false;
  }
}

export function widgetMissing(): boolean {
  return warnedMissing;
}
