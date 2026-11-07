import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * 顶部安全区高度（状态栏 / 刘海 / 挖孔）。
 *
 * 想要的是真实 insets（`react-native-safe-area-context` 的 useSafeAreaInsets），
 * 但那条库带新架构 codegen，出 Android 包时 ninja 建目录失败：
 *   ninja: error: mkdir(...CMakeFiles/react_codegen_safeareacontext.dir/E_/dsh_workfile/soyo/
 *   node_modules/react-native-safe-area-context/...): No such file or directory
 * CMake 会把源文件的绝对路径镜像进 obj 目录，整条 288 字符，超过 ninja 认的 260；
 * 项目落在 E:\dsh_workfile\soyo 这条根上躲不开（换 subst / junction 都会解析回真路径）。
 * 所以这里仍然用常量：Android 的状态栏高度由原生侧算好给过来，iOS 没有刘海时也是 44。
 */
const statusBarHeight =
  Platform.OS === 'android' ? (Constants.statusBarHeight ?? 24) : Platform.OS === 'ios' ? 44 : 0;

export function safeTop(): number {
  return statusBarHeight;
}

/** 底部手势条 / 三键导航：TabBar 需要自己让开这一段 */
export function safeBottom(): number {
  return Platform.OS === 'ios' ? 20 : Platform.OS === 'android' ? 10 : 0;
}
