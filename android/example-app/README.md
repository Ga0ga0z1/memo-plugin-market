# Android 伴生 Activity 示例

这个独立 Android 工程可与 SDK 的 `activity/1` 示例配套使用。用户从拓展版 208 的插件入口打开它时，会看到「已打开伴生示例」。应用只使用 Android 平台的 Activity 和 TextView，未申请权限。[配套插件清单](../../sdk/examples/companion-activity/runtime.json)

## 构建 APK

安装 JDK 17 或 21、Gradle 8.14.3 以及 Android SDK 的 Platform 36 和 Build Tools 36.0.0。将 `JAVA_HOME` 和 `ANDROID_HOME` 指向各自安装目录。以下命令从本目录运行，首次构建需要访问 Google Maven 和 Maven Central。[Gradle 下载](https://gradle.org/releases/) · [Android SDK 工具](https://developer.android.com/tools)

```sh
gradle :app:assembleDebug
```

输出文件为 `app/build/outputs/apk/debug/app-debug.apk`。调试构建会使用本机 Android 开发环境的调试证书。公开发行时，用自己的 Android 发行签名生成 APK，再从**最终交付的 APK**读取证书指纹。

## 将证书指纹写入插件

Windows PowerShell 可用以下命令检查 APK 签名并显示证书指纹。

```powershell
$apk = 'app/build/outputs/apk/debug/app-debug.apk'
& "$env:ANDROID_HOME/build-tools/36.0.0/apksigner.bat" verify --print-certs $apk
```

macOS 和 Linux 使用对应的可执行文件。

```sh
"$ANDROID_HOME/build-tools/36.0.0/apksigner" verify --print-certs app/build/outputs/apk/debug/app-debug.apk
```

1. 把 [companion-activity](../../sdk/examples/companion-activity) 目录复制到自己的插件仓库。在 `runtime.json` 中用 `Signer #1 certificate SHA-256 digest` 行的 64 位小写十六进制值替换 `apkSignerSha256` 的全部零。208 版宿主要求 APK 具有单一当前签名者。[apksigner 文档](https://developer.android.com/tools/apksigner)
2. 保持 `androidPackage` 为 `com.example.memo.companion`、`activityClass` 为 `com.example.memo.companion.MainActivity`。派生新应用时，为它选择自己的包名，同步更新 Android 工程和插件清单。Activity 须启用、导出，通过 `com.gaoyixuan.memo.ext.action.OPEN_COMPANION_V1` 和 `android.intent.category.DEFAULT` 供宿主发现。[Manifest](app/src/main/AndroidManifest.xml)
3. 改好发布者 ID 和插件 ID 后，用自己的**插件发布者密钥**打包和验签。SDK 会计算插件的 `signerSha256`。Android 签名证书和插件发布者公钥各自用于验证对应的文件。[SDK 打包指南](../../sdk/README.md)

## 在手机上打开

在安装了拓展版 208 的设备上先安装上面检查过的伴生 APK。然后在「插件管理与授权」中核对并信任作者公钥、导入签名的 `.memoplugin`、启用插件。从首页「更多页面 → 插件」进入对应入口即可看到示例文字，系统返回键会回到宿主。若提示安装配套 APK 或签名不符，请重新核对实际安装的包名、Activity、签名证书，以及用该指纹签出的插件版本。[插件试装说明](../../CONTRIBUTING.md)
