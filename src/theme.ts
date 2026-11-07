/**
 * 视觉 token。
 *
 * 方向：把课表当成一本随身的日程纸 —— 底色是冷的纸色，文字是墨色，
 * 界面本身尽量无色，**彩色只留给课程**，这样课表一眼就有层次。
 * 主行动色用深松绿（郑大那种沉一点的绿），不用满大街的科技蓝。
 */
export const colors = {
  /** 纸底：冷调、略偏绿灰，避免奶油色那种「模板感」 */
  paper: '#F1F3EF',
  surface: '#FFFFFF',
  /** 细分隔线 */
  rule: '#DFE4DE',
  ruleStrong: '#C7CEC7',
  ink: '#14181A',
  inkSoft: '#5E6A64',
  inkFaint: '#98A29B',
  /** 主行动色 */
  pine: '#17493C',
  pineSoft: '#E2EDE7',
  danger: '#B8383B',
  /** 危险色的淡底：只用来垫提示块，不直接上字 */
  dangerSoft: '#FBEDEC',

  // ↓ 兼容旧代码的别名（早期组件直接用这些名字）
  bg: '#F1F3EF',
  border: '#DFE4DE',
  borderStrong: '#C7CEC7',
  text: '#14181A',
  textSecondary: '#5E6A64',
  textTertiary: '#98A29B',
  accent: '#17493C',
  accentSoft: '#E2EDE7',
} as const;

/** 圆角：课块 9、弹层 18，其它一律 999（胶囊）或 0（分隔线） */
export const radius = {
  block: 9,
  card: 14,
  sheet: 18,
  pill: 999,
} as const;

/** 课块底色：淡而可辨，压在纸底上都能认出是哪门课 */
export const coursePalette: string[] = [
  '#D8E4F7',
  '#F8D9DD',
  '#D3EDD8',
  '#FAEDC2',
  '#E4DAF7',
  '#FADFC9',
  '#CFEDEC',
  '#E6E1D3',
];

/**
 * 课块的淡色在白底上几乎看不见，所以细色条要压深一点才立得住。
 * 做法是把课程色朝墨色混 42%，保留色相、把它变成能当强调线用的颜色。
 */
export function courseAccent(hex: string): string {
  const value = hex.replace('#', '');
  const mix = (channel: string, base: number) =>
    Math.round(parseInt(channel, 16) * 0.58 + base * 0.42);
  const r = mix(value.slice(0, 2), 0x14);
  const g = mix(value.slice(2, 4), 0x18);
  const b = mix(value.slice(4, 6), 0x1a);
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
