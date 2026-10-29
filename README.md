# 自言

完全离线的 Android 笔记与待办应用，以项目组织聊天式记录。无需账号，不申请联网权限。

## 功能

- 记录文字、图文、图片和视频，支持跨项目转发。
- 接收其他安卓应用通过系统分享发送的文字、链接、图片和视频，预览并选择目标项目后确认保存。
- 多页手写，保留原始笔迹，可继续编辑。
- 待办支持图片和截止日期；项目待办栏只显示未完成事项。
- 按关键词、项目、内容类型和创建日期搜索，点击结果定位原记录。
- 首页滑动切换项目、待办和设置，底栏固定。
- 导出完整 JSON 备份，包含附件、手写、模板和草稿，可在其他设备导入。

## 使用

支持 Android 8.0 及以上。同签名 APK 可覆盖升级，更新前建议导出备份。

在其他应用选择系统「分享」或「其他应用打开」，再选择「自言」。分享文字可在保存前编辑，单张／多张图片和视频可预览；确认后附件复制到应用内部，并进入完整 JSON 备份。取消不会改变已有笔记或输入草稿。连续分享会依次等待确认，未确认的分享暂存于应用内部，重新打开后仍可处理。

微信、QQ 是否显示此入口取决于它们提供的系统分享能力；不支持聊天记录合集、小程序卡片等私有格式，不读取账号或聊天数据库。仅支持文字、链接、图片和视频；「其他应用打开」接收系统授权的 content URI，文字文件按 UTF-8 读取。

数据仅保存在本机。卸载或清除应用数据会删除记录；导入备份会替换当前数据，不会合并。当前不支持云同步或加密，单附件上限 200 MB，备份导入上限 512 MB。

## 本地预览

```sh
python -m http.server 4173 --bind 127.0.0.1 --directory dist
```

在浏览器打开 `http://127.0.0.1:4173`。前端源文件位于 `dist/`，Android 容器源码位于 `android/app/src/`。

## 构建 APK

需要 Python 3.10+、JDK 17+、Android SDK Platform 35 和 Build Tools 35.0.0。

```powershell
$env:ANDROID_SDK_ROOT='C:\Android\Sdk'
$env:ZIYAN_JAVA_COMPILER='javac'
python -X utf8 android/build.py
```

将 SDK 路径替换为实际目录，安装包输出到 `releases/`。发布签名不随仓库提供；覆盖升级必须沿用原签名。独立构建及 Linux 环境说明见 [Android 构建说明](android/README.md)。

## 测试

启动本地预览服务后，安装 `dev-requirements.txt` 中的依赖，运行：

```sh
python tests/check_v5.py
python tests/check_v5_edges.py
```

安装 Node.js 与 Playwright 后，可运行 `node tests/check_records.cjs`、`node tests/check_home_swipes.cjs` 和 `node tests/check_shares.cjs` 检查转发、搜索、触摸滑动及分享接收。分享测试使用打包后的界面和桥接模拟，需要先构建 APK。测试可通过 `CHROME_PATH` 指定 Chrome 浏览器路径。

APK 构建后运行 `python tests/check_native_adapter.py` 检查内置资源和原生桥接。浏览器测试不替代安卓真机验证。
