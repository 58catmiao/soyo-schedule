import { registerRootComponent } from 'expo';
import { Platform } from 'react-native';
import { registerWidgetTaskHandler } from 'react-native-android-widget';

import App from './App';
import { widgetTaskHandler } from './src/widget/widget-task-handler';

// 桌面小组件的后台任务：Android 会在添加组件、到点刷新时拉起它。
// 必须放在 App 注册之前，否则冷启动时拉不起来。
//
// 只在 Android 上注册：这个库在 Web 下没有 registerHeadlessTask，
// 一旦调用会在模块加载阶段抛错，整页白屏（网页预览就废了）。
if (Platform.OS === 'android') {
  registerWidgetTaskHandler(widgetTaskHandler);
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
