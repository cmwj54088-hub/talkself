# 本机工具链与构建入口

核对日期：2026-11-01，Windows / PowerShell。本文件集中记录当前机器的工具位置；路径不是其他开发者必须使用的固定值。换机器先核对路径，优先复用已有工具，不重复下载。构建逻辑以 `android/build.py` 为准，应用行为见 [Android 容器说明](../android/README.md)。

## 本项目实际需要什么

自言采用 Python 直接编排 Android SDK 与 Java 工具：生成本地页面资源 → aapt2 → javac → D8 → zipalign → apksigner。使用 javac 时不需要 ECJ；未指定编译器时脚本默认使用锁定的 ECJ 3.38.0。

- 必需：Python、JDK 17+、Android SDK platform 35 / build-tools 35.0.0、原升级签名。
- 浏览器自动化检查需要：Chrome、Python／Node 版本的 Playwright；Node 本身不是 APK 打包依赖。
- adb 只用于另行授权的设备检查／安装；本文件命令不自动安装。
- 当前不使用 Gradle、NDK、Arduino 或 ESP32 工具。不要为本轮功能改造构建体系或安装这些依赖。
- 以上为开发工具；APK 运行时仍离线，不把开发环境下载与应用联网混淆。

## 当前已核实的位置

以下路径已通过文件／目录存在性检查；Java、Python、Node 另执行了版本命令。未因本次登记重新构建 APK。

| 工具 | 当前位置 | 核对结果 |
|---|---|---|
| Android SDK | `C:\Users\Admin\Desktop\手机笔记\.android-tooling\sdk` | platform 35、build-tools 35.0.0 所需文件存在 |
| Android 平台 | SDK 下 `platforms\android-35\android.jar` | 存在 |
| Android 构建工具 | SDK 下 `build-tools\35.0.0` | aapt2.exe、zipalign.exe、lib/d8.jar、lib/apksigner.jar 存在 |
| adb | SDK 下 `platform-tools\adb.exe` | 存在；未连接设备 |
| JDK | `C:\Users\Admin\AppData\Local\Programs\Microsoft\jdk-17.0.10.7-hotspot` | java / javac 在 bin；java 报告 17.0.10 |
| Python | `C:\Users\Admin\AppData\Local\Programs\Python\Python312\python.exe` | 3.12.10 |
| Node | `C:\Users\Admin\AppData\Local\Programs\nodejs\node.exe` | v22.23.2 |
| Chrome | `C:\Program Files\Google\Chrome\Application\chrome.exe` | 存在 |
| Python Playwright | `$env:TEMP\ziyan-qa-python` 下的 playwright 包 | 已通过 import；临时目录可能被清理，使用前复查 |
| Node Playwright | `C:\Users\Admin\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules` 下的 playwright 包 | 已通过 require |

## 本地打包

从真实源码目录运行。以下环境变量仅影响当前 PowerShell 会话，不改系统配置：

```powershell
Set-Location 'C:\Users\Admin\Desktop\project\talkself\ziyan-0.5.0-apk-source\source'
$env:JAVA_HOME = 'C:\Users\Admin\AppData\Local\Programs\Microsoft\jdk-17.0.10.7-hotspot'
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
$env:ANDROID_SDK_ROOT = 'C:\Users\Admin\Desktop\手机笔记\.android-tooling\sdk'
$env:ZIYAN_JAVA_COMPILER = 'javac'
Remove-Item Env:ZIYAN_ANDROID_QA -ErrorAction SilentlyContinue
python -X utf8 android/build.py
```

输出在源码根目录 `releases/`，包括版本命名 APK 与 SHA256.txt；中间产物在 `android/build/`。脚本会清理并重建自己的构建目录，不应同时运行多份构建。Android README 中的旧版本号不代表当前检出版本，实际版本取 manifest。

原签名位于 `android/signing/`，本次仅检查密钥和密码文件存在，未读取或打印内容。缺失时从已有私有升级签名备份恢复；不得重建密钥或设置 `ZIYAN_ALLOW_NEW_SIGNING=1` 给原应用升级。签名、密码、APK、源码交付 ZIP 和私人证据不提交 Git。

只有本机工具确实缺失时才考虑 `android/setup_toolchain.py`。它会下载开发依赖，不是正常构建的必要步骤；当前标准 SDK + javac 路径不需要运行它。

## 浏览器检查环境

当前测试脚本使用 `CHROME_PATH`，Python／Node 分别读取以下依赖路径：

```powershell
$env:CHROME_PATH = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
$env:PYTHONPATH = "$env:TEMP\ziyan-qa-python"
$env:NODE_PATH = 'C:\Users\Admin\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
python -X utf8 -c "from playwright.sync_api import sync_playwright; print('Python Playwright ready')"
node -e "require('playwright'); console.log('Node Playwright ready')"
```

从源码目录，在独立终端运行本地页面服务（先核对 4173 是否已被当前测试服务占用，复用可用实例，不启动重复服务）：

```powershell
python -m http.server 4173 --bind 127.0.0.1 --directory dist
```

在设置上述变量的另一终端按修改范围选择检查，例如 `python -X utf8 tests/check_v5.py`、`python -X utf8 tests/check_interactions.py`、`node tests/check_home_swipes.cjs`。APK 构建后的适配检查入口为 `python -X utf8 tests/check_native_adapter.py`。必要检查仍遵守 AGENTS.md；本文件不是要求每次跑全部测试。

依赖路径存在不代表测试通过。浏览器、模拟桥接、APK 校验、真机键盘／浏览器选择器和用户验收分别记结果。默认使用合成聊天样本，读取私人样本需要明确范围，不在日志输出私密内容。

## 本机其他工具位置（当前项目不依赖）

以下由用户提供，已于同日核实路径存在；未运行或验证整条编译链，仅供未来相关项目查找，不能据此增加本项目依赖。

| 工具 | 位置 |
|---|---|
| Android NDK r28c | `C:\Users\Admin\Desktop\project\airenote\.tools\ai-lab\android-ndk-r28c` |
| Gradle 8.7 | `C:\Users\Admin\Desktop\手机笔记\.android-tooling\gradle\gradle-8.7` |
| Gradle 启动文件 | `C:\Users\Admin\Desktop\手机笔记\.android-tooling\gradle\gradle-8.7\bin\gradle.bat` |
| Arduino IDE | `C:\Users\Admin\AppData\Local\Programs\Arduino IDE\Arduino IDE.exe` |
| Arduino 开发板与工具目录 | `E:\Arduino15` |
| ESP32 开发板包 | `E:\Arduino15\packages\esp32\hardware\esp32\3.3.10-cn` |
| ESP32S3 编译器 | `E:\Arduino15\packages\esp32\tools\esp-x32\2601-cn\bin` |

今后派发只需提示执行者阅读 `docs/TOOLCHAIN.md`；路径或工具变更在此更新，不在各对话复制维护另一份。
