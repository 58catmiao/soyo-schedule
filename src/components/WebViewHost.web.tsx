import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors } from '../theme';

export interface WebViewHostProps {
  source: string;
  injectedJavaScriptBeforeContentLoaded?: string;
  onMessage?: (data: string) => void;
  onLoadProgress?: (progress: number) => void;
  onLoadEnd?: () => void;
  onError?: (description: string) => void;
  onHttpError?: (status: number, url: string) => void;
  webRef?: React.MutableRefObject<unknown>;
  style?: object;
}

/**
 * 网页版的替身：浏览器里没有内嵌 WebView 能力，
 * 而且学校门户有跨域限制，直接在网页里跑也没意义。
 */
export default function WebViewHost(_props: WebViewHostProps) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>网页导入只能在手机上用</Text>
      <Text style={styles.body}>
        浏览器里嵌不了学校门户。打开手机上的 soyo，用「导入课表 → 网页导入」就能走这条路。
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    backgroundColor: colors.bg,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  body: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
