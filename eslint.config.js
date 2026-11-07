// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // 只审自己写的源码：.tmp 是脚本编出来的 bundle，android/ 是 prebuild 产物，
    // 把生成物一起扫进来会淹没真正的问题（171 条里大部头都是它）。
    ignores: ['dist/*', '.tmp/*', '.expo/*', 'android/*', 'ios/*', 'assets/*', 'scripts/*'],
  },
  {
    // expo-notifications 的 Android* 常量是 `export *` 串出来的，
    // ESLint 的 import 解析器穿不透这层，而 tsc 是过的——这条规则在这儿只会误报。
    files: ['src/notifications.ts'],
    rules: { 'import/namespace': 'off' },
  },
  {
    rules: {
      // 「prop 变了就把派生 state 对齐」是这个项目里到处都是的正常写法
      //（弹层打开时复位、切换表单时回填），React 文档也认这一种，只是会多一次渲染。
      'react-hooks/set-state-in-effect': 'off',
    },
  },
]);
