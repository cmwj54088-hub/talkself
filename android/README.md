# Android container · 0.6.0

包名 `local.ziyan.notes`，versionCode 6，最低 API 26，目标 API 35。没有 INTERNET、RECORD_AUDIO、相机或共享存储权限。系统自动备份关闭，用户通过完整 JSON 备份迁移。

MainActivity 原生读取 APK 内的单文档 HTML，再用稳定 HTTPS 应用来源载入。这个来源不进行 DNS 或网络连接，用于保持本地数据库归属。CSP 阻止外部连接、框架和对象；资源拦截也会拒绝额外地址。

WebView 界面负责业务和 IndexedDB；原生容器负责系统栏／键盘避让、返回键、相机临时授权、系统文件选择、剪贴板和系统文件保存。Android 8 及以上各 CPU 架构共用一个 APK，没有应用自带原生动态库。系统 WebView 需支持现代 JavaScript。

导出时先把内容按 192KB 二进制块写入应用临时文件，系统选定保存位置后再流式复制；取消／失败清理临时数据并返回状态。CameraProvider 只开放随机命名的临时 JPEG，不暴露数据库和笔记目录。

构建 `python3 android/build.py`，用 Android platform 35 / build-tools 35.0.0 和 JDK 17+。默认使用锁定的 ECJ 3.38.0；设置 `ZIYAN_JAVA_COMPILER=javac` 可使用 JDK 自带编译器，输出 Java 8 字节码。设置 `ANDROID_SDK_ROOT` 可复用标准 SDK 安装。0.6.0 已在 Windows 使用 JDK 17.0.10 与现有 SDK 成功打包。`setup_toolchain.py` 按 `toolchain-lock.json` 校验开发依赖。运行时不依赖这些工具或在线服务。官方 SDK 的许可和系统依赖适用于开发工具。

升级签名不在普通源码目录中；从交付包的 `private/upgrade-signing.zip` 解压至项目根目录后得到 android/signing。脚本默认拒绝在密钥缺失时悄悄生成新密钥；仅全新独立应用可显式设置 `ZIYAN_ALLOW_NEW_SIGNING=1`。签名密码由文件传给工具，不应打印。

`ZIYAN_ANDROID_QA=1` 仅生成内部诊断 APK，普通交付构建始终关闭调试。请先读项目根目录的 AGENTS.md、README.md、REQUIREMENTS.md。
