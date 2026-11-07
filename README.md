# soyo-schedule

郑州大学课表 App。教室墙上的那张格子表，搬进手机里。

只做一件事：**把教务系统的课表导入手机，上课前提醒你**。没有账号、没有云端，数据只存在这台手机上。

> 专门给郑州大学的学生做的，其他地方用不了 —— 导入功能是照着郑大教务系统（兰途）的网页写的。

## 功能

- **导入课表**：打开应用内的教务网页，登录后自动抓课表，不用手抄
- **课前提醒**：本地通知，提前 5～60 分钟响铃 + 震动（不联网也能响）
- **周视图**：左右滑动换周，点课块看详情，长按直接改
- **今日**：今天还有什么课、下节课在哪、几点开始
- **桌面小组件**：今天的课放在桌面上
- **应用内更新**：启动时自动检查新版本，设置页也能手动查

## 安装

到 [Releases](https://github.com/58catmiao/soyo-schedule/releases) 下载最新的 `soyo-*.apk`，点开安装。

> 安卓会提示「未知来源应用」，允许一次即可。签名不会再变，之后的新版本直接覆盖安装，课表会留着。

## 自己编译

```bash
npm install
npx expo prebuild --platform android
cd android && ./gradlew assembleRelease
```

产物在 `android/app/build/outputs/apk/release/app-release.apk`。

> 想自己签名的话，在 `android/keystore.properties` 里填 `storeFile` / `storePassword` / `keyAlias` / `keyPassword`，没有这个文件时会退回 debug 签名。

开发调试：

```bash
npm start        # 手机上装 Expo Go，扫码
npm run web      # 浏览器里看界面（通知和小组件只有手机上有）
npx tsc --noEmit # 类型检查
npx eslint .     # 代码检查
```

## 许可

[MIT](LICENSE)

## 说明

课表来自郑大教务系统的公开网页，导入时用的是你自己的登录状态，应用不保存账号密码。

