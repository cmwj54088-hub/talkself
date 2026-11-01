# 自言

完全离线的 Android 笔记与待办应用，以项目组织聊天式记录。无需账号，不申请联网权限。

项目记录：[当前状态与已确认事项](docs/PROJECT_STATUS.md) · [更新记录](docs/CHANGELOG.md)。

## 功能

- 记录文字、图文、图片和视频，支持全屏选择多个目标项目后统一转发，各副本可独立编辑。
- 接收其他安卓应用通过系统分享发送的文字、链接、图片和视频，预览并选择目标项目后确认保存。
- 多页手写，保留原始笔迹，可继续编辑。
- 待办支持图片、独立的截止日期与系统提醒闹钟；项目待办栏只显示未完成事项。
- 按关键词、项目、内容类型和创建日期搜索，点击结果定位原记录。
- 首页滑动切换项目、待办和设置，底栏固定。
- 导出完整 JSON 备份，包含附件、手写、模板和草稿，可在其他设备导入。

## 使用

支持 Android 8.0 及以上。同签名 APK 可覆盖升级，更新前建议导出备份。

在其他应用选择系统「分享」或「其他应用打开」，再选择「自言」。分享文字可在保存前编辑，单张／多张图片和视频可预览；确认后附件复制到应用内部，并进入完整 JSON 备份。取消不会改变已有笔记或输入草稿。连续分享会依次等待确认，未确认的分享暂存于应用内部，重新打开后仍可处理。

微信聊天：在微信选择消息后，通过可用的「Open／打开」等入口进入系统分享面板，选择「自言」。支持包含 Chat history.txt 的微信聊天 ZIP（正文及图片／视频附件）；预览时可编辑正文、选择项目，再确认保存。每份 ZIP 保存为一条可编辑文字／图文笔记，图片按正文中的文件引用插入，视频单独保存为附件。发送者和原始消息时间保留在正文；笔记创建时间为导入时间。合并发送通常保留发送者和时间，不合并按微信实际导出的正文保存。导入内容纳入完整 JSON 备份，可编辑、搜索及跨项目转发。

每次接收一个聊天 ZIP；压缩包及单附件上限 200 MB，解压总量上限 512 MB，最多 256 个 ZIP 条目，正文最多 5 万字。缺失正文／引用附件、加密或损坏 ZIP，以及文档、语音等当前不支持的附件会整批拒绝并提示，不会只保存一部分。不支持小程序卡片等私有格式，不读取账号或聊天数据库；是否提供此系统出口取决于微信版本和内容类型。已有诊断入口已移除。

数据仅保存在本机。卸载或清除应用数据会删除记录；导入备份会替换当前数据，不会合并。当前不支持云同步或加密，单附件上限 200 MB，备份导入上限 512 MB。

长按笔记打开操作菜单，通过「选择部分文字」复制局部内容；双击或手机双触文字／图文可打开全屏编辑器。待办栏展开／收起会保持底部或历史阅读位置。输入区主按钮始终可见，空内容时禁用；笔记／待办共用每个项目的一份草稿，保存待办后自动回到发送模式。模板的新建和编辑使用全屏页面。

提醒与截止日期独立：待办行、待办菜单或完整编辑页可选择提醒时间并打开系统闹钟，请在系统时钟确认响铃日期、重复和启用状态。单独保存提醒时间不会启用闹钟，完成／删除待办、清除提醒时间或导入备份也不会关闭或重建系统闹钟。备份恢复提醒时间；系统闹钟由系统时钟管理。没有可用时钟应用时会提示，待办内容仍保留。

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
python tests/check_wechat_archive.py
python tests/check_interactions.py
```

安装 Node.js 与 Playwright 后，可运行 `node tests/check_records.cjs`、`node tests/check_home_swipes.cjs` 和 `node tests/check_shares.cjs`、`node tests/check_wechat_import.cjs` 检查转发、搜索、触摸滑动及分享接收。分享测试使用打包后的界面和桥接模拟，需要先构建 APK。微信测试先运行 `python tests/check_wechat_archive.py` 生成虚构测试夹具，再运行 `node tests/check_wechat_import.cjs`。真实样本仅在显式传入 `--include-local-evidence` 时读取；本地证据和生成夹具均不提交 Git。测试可通过 `CHROME_PATH` 指定 Chrome 浏览器路径。

APK 构建后运行 `python tests/check_native_adapter.py` 检查内置资源和原生桥接。浏览器测试不替代安卓真机验证。
