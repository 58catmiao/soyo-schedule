import React from 'react';
import { WebView } from 'react-native-webview';

export interface WebViewHostProps {
  source: string;
  injectedJavaScriptBeforeContentLoaded?: string;
  onMessage?: (data: string) => void;
  onLoadProgress?: (progress: number) => void;
  onLoadEnd?: () => void;
  /** 页面打不开（断网 / DNS / 证书）。给上层分类提示用。 */
  onError?: (description: string) => void;
  /** HTTP 层失败（4xx/5xx），学校门户常见的是登录态失效。 */
  onHttpError?: (status: number, url: string) => void;
  /** 拿到底层 WebView 句柄，用来 injectJavaScript（诊断时用）。 */
  webRef?: React.MutableRefObject<any>;
  style?: object;
}

/**
 * 原生端的网页容器。
 * web 端另有 WebViewHost.web.tsx 顶替（react-native-webview 没有 web 实现）。
 */
export default function WebViewHost({
  source,
  injectedJavaScriptBeforeContentLoaded,
  onMessage,
  onLoadProgress,
  onLoadEnd,
  onError,
  onHttpError,
  webRef,
  style,
}: WebViewHostProps) {
  return (
    <WebView
      ref={webRef}
      style={style}
      source={{ uri: source }}
      injectedJavaScriptBeforeContentLoaded={injectedJavaScriptBeforeContentLoaded}
      onMessage={(event) => onMessage?.(event.nativeEvent.data)}
      onLoadProgress={(event) => onLoadProgress?.(event.nativeEvent.progress)}
      onLoadEnd={onLoadEnd}
      onError={(event) => onError?.(event.nativeEvent.description)}
      onHttpError={(event) => onHttpError?.(event.nativeEvent.statusCode, event.nativeEvent.url)}
      javaScriptEnabled
      domStorageEnabled
      sharedCookiesEnabled
      thirdPartyCookiesEnabled
      setSupportMultipleWindows={false}
      startInLoadingState={false}
      allowsBackForwardNavigationGestures
    />
  );
}
