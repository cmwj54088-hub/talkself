# Android container · 0.12.0

本机 SDK、JDK、测试依赖路径与 PowerShell 构建命令统一见 [工具链说明](../docs/TOOLCHAIN.md)。

包名 `local.ziyan.notes`，versionCode 15，最低 API 26，目标 API 35。没有 INTERNET、RECORD_AUDIO、相机或共享存储权限。系统自动备份关闭，用户通过完整 JSON 备份迁移。

MainActivity 原生读取 APK 内的单文档 HTML，再用稳定 HTTPS 应用来源载入。这个来源不进行 DNS 或网络连接，用于保持本地数据库归属。CSP 阻止外部连接、框架和对象；资源拦截也会拒绝额外地址。

MainActivity 使用 singleTask 接收冷启动和已运行时的 SEND、SEND_MULTIPLE 分享，以及 content URI 的 VIEW 打开入口。声明 content URI 的通用文件类型以及文字／图片／视频／ZIP；文档文件按不透明附件保留。ShareInbox 在后台线程把临时 URI 流式复制到应用私有 files/share-inbox/，按单附件 200 MB 校验，全部读取成功才发布暂存元数据；失败清理本批次，不创建记录。未确认内容保留到确认或取消，重启可恢复；未完成复制的旧目录在一天后清理。

前端通过 192 KB 分块桥接读取暂存文件，独立弹窗预览、编辑文字并选择项目。确认时在同一个 IndexedDB 事务内写入文字、全部附件、项目时间和接收标记，成功后才清理暂存文件；接收标记防止保存后异常退出造成重复。附件进入原有 media 存储和版本 3 完整备份，无需保留来源 URI 授权。预览期间不替换项目输入框或编辑器草稿。

WebView 界面负责业务和 IndexedDB；原生容器负责系统栏／键盘避让、返回键、相机临时授权、系统文件选择、剪贴板和系统文件保存。Android 8 及以上各 CPU 架构共用一个 APK，没有应用自带原生动态库。系统 WebView 需支持现代 JavaScript。

导出时先把内容按 192KB 二进制块写入应用临时文件，系统选定保存位置后再流式复制；取消／失败清理临时数据并返回状态。CameraProvider 只开放随机命名的临时 JPEG，不暴露数据库和笔记目录。

构建 `python3 android/build.py`，用 Android platform 35 / build-tools 35.0.0 和 JDK 17+。默认使用锁定的 ECJ 3.38.0；设置 `ZIYAN_JAVA_COMPILER=javac` 可使用 JDK 自带编译器，输出 Java 8 字节码。设置 `ANDROID_SDK_ROOT` 可复用标准 SDK 安装。0.7.1 已在 Windows 使用 JDK 17.0.10 与现有 SDK 成功打包。`setup_toolchain.py` 按 `toolchain-lock.json` 校验开发依赖。运行时不依赖这些工具或在线服务。官方 SDK 的许可和系统依赖适用于开发工具。

升级签名不在普通源码目录中；从交付包的 `private/upgrade-signing.zip` 解压至项目根目录后得到 android/signing。脚本默认拒绝在密钥缺失时悄悄生成新密钥；仅全新独立应用可显式设置 `ZIYAN_ALLOW_NEW_SIGNING=1`。签名密码由文件传给工具，不应打印。

`ZIYAN_ANDROID_QA=1` 仅生成内部诊断 APK，普通交付构建始终关闭调试。请先读项目根目录的 AGENTS.md、README.md、REQUIREMENTS.md。

WechatArchive 使用 JDK／Android 内置 ZipFile 解析微信导出的明文聊天 ZIP，不引入运行时依赖。先复制授权 URI 到私有暂存，再验证条目路径、重复名称、CRC、UTF-8 文本、正文和媒体引用，限制单包／附件 200 MB、解压合计 512 MB、256 个条目和 8MB UTF-8 正文。输出使用应用生成的数字文件名，不按 ZIP 内路径落盘。未知附件以 application/octet-stream 保留；损坏、加密或缺失引用内容的聊天 ZIP 整批拒绝。每次接收一个 ZIP；拒绝 ZIP 和其他 URI 混合分享。

解析成功后正文暂存在 transcript.txt，pending 元数据只传大小，readText 用 192KB 二进制块传输；前端 TextDecoder 流式处理跨块 UTF-8，逐条解析时分批交还事件循环。前端根据合并／逐条格式保存原消息，姓名／时间独立存入 origin（缺失为 null），图片保留 richtext 内联引用，视频以同条消息的 attachments 保存。单次最多 20000 条，单条 200 万字；按原消息边界分页，不按五万字切段。无法识别的结构需确认原文回退。原消息、附件、项目和接收标记沿用既有 stores 原子事务；数据库版本 2、备份版本 3，新增字段有校验并兼容旧备份。编辑后引用失联整批拒绝。系统编解码能力决定媒体能否播放。诊断 Activity、设置按钮和桥接保持移除。

提醒闹钟通过 MainActivity 的 setTaskAlarm 桥接调用系统 ACTION_SET_ALARM，传入小时、分钟和最多 200 字的待办标签，EXTRA_SKIP_UI=false。仅声明 com.android.alarm.permission.SET_ALARM，无网络、通知或精确闹钟调度权限。直接启动系统 Intent 并捕获缺少时钟／安全限制，不读取系统闹钟状态。提醒时间单独存入既有 tasks/drafts；JSON 版本仍为 3、数据库版本仍为 2。系统确认后的闹钟独立于待办生命周期，备份只迁移时间偏好，不会自动创建闹钟。接口依据 [Android AlarmClock](https://developer.android.com/reference/android/provider/AlarmClock)。

## 0.10.0 应用内日期提醒

versionCode 12。TaskReminders 使用 AlarmManager.setExactAndAllowWhileIdle 与本地通知；POST_NOTIFICATIONS、SCHEDULE_EXACT_ALARM 和 RECEIVE_BOOT_COMPLETED 已按用户本轮授权加入，无 INTERNET。仅用户主动启用时进入授权，未授权不声称已预约。已提交 tasks 的启用记录镜像至原生私有偏好；删除、完成、清除后取消，重启和时间／时区变化恢复未来预约，不重放已过期提醒。系统时钟入口仍独立。通知渠道、静音、勿扰及厂商后台限制可能影响声音，真机尚未验收。


## 0.11.0 消息流与编辑

versionCode 14，保持原包名、签名及既有提醒权限。待办消息气泡派生自 tasks，不复制数据；跨项目转发写入独立 tasks 与媒体，默认未完成、不启用提醒。普通消息／待办展开均复用全屏笔记编辑器，图片与共用草稿往返保留。原生复制有 20 万字单次 IPC 限制，超长记录可选部分或导出。浏览器短视口检查不能替代安卓 IME 和真机微信分享／提醒验证。


## 0.12.0 文件卡片与嵌套聊天

versionCode 15。WechatArchive 对普通文件映射已知 MIME、未知格式回退，不解析 Office/PDF 或嵌套 ZIP 文件。正文中四空格缩进的 Chat History 卡片解析为 children，JSON 仍为 v3／DB schema 2，所有后代媒体和来源字段受验证与原子事务保护。

AttachmentProvider 非 exported，只提供随机 token 对应的一份 payload。finishOpen 分块暂存并创建只读 content URI，ACTION_VIEW 选择器排除本应用，仅临时读授权，无写权限／共享存储权限。未知 MIME 用外部应用通用选择器；无适用外部应用会返回明确失败。临时打开文件总量 512MB、7 天清理，不删除数据库原件。仅新增 provider 和类型查询／分享过滤，不增加权限。

通用卡片的字节与桥接可在浏览器模拟验证；真正的第三方文档应用、文件权限授予、IME、传感器及厂商系统行为仍需安卓真机验收。
