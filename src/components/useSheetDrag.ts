import { useMemo, useState } from 'react';
import { Animated, PanResponder } from 'react-native';

/**
 * 底部弹层「往下拖就关掉」。
 *
 * 单手拿着手机时，弹层的关闭按钮在屏幕最上面，拇指够不到；
 * 顺手往下推一把反而是最自然的方式，也是所有系统弹层的习惯。
 *
 * 只挂在顶部那条「把手」上，不接管整张卡片 —— 否则弹层里的输入框、
 * 列表滚动都会被手势抢走。
 */
export function useSheetDrag(onClose: () => void, threshold = 90) {
  // 用 useState 的惰性初始化承载 Animated.Value：
  // 它在这里是「每个弹层一个、之后永远不变」的值，不是可变引用。
  // 塞进 useRef 会在渲染期读 .current，React 19 的 lint 会直接报错。
  const [translateY] = useState(() => new Animated.Value(0));

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) =>
          gesture.dy > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderMove: (_event, gesture) => {
          if (gesture.dy > 0) translateY.setValue(gesture.dy);
        },
        onPanResponderRelease: (_event, gesture) => {
          if (gesture.dy > threshold) {
            translateY.setValue(0);
            onClose();
            return;
          }
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 6,
            speed: 18,
          }).start();
        },
        onPanResponderTerminate: () => {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 6,
            speed: 18,
          }).start();
        },
      }),
    [onClose, threshold, translateY]
  );

  return { translateY, dragHandlers: pan.panHandlers };
}
