# 备忘录拓展版插件市场

这里提供已发布的插件，以及为 Android 备忘录拓展版 **208（0.5.1-ext）** 开发插件所需的命令行工具、协议和示例。现有插件和对应公钥可在 [Releases](https://github.com/Ga0ga0z1/memo-plugin-market/releases) 下载。

准备开发需要联网、缓存或定时生成内容的插件时，可先看[以 GitHub 榜单日报为例的开发答疑](docs/daily-report.md)。其中列出 208 宿主能力、测试包获取情况、模型与运行资源归属，以及三张实际界面截图。

新稿若需要在手机熄屏后继续执行，先核对已发布拓展版提供的后台适配器、支持的插件身份和版本。前台页面及短操作沿用现有模板。投稿时可按[后台任务投稿条件](CONTRIBUTING.md#手机后台任务的投稿条件)准备试装记录。

## 可安装的小说插件

| 插件 | 用途 | 下载与安装 |
| --- | --- | --- |
| 小说工作室 | 管理书架、设定和大纲，创作、审改并对照阅读双语稿 | [工作室 1.0](https://github.com/Ga0ga0z1/memo-plugin-market/releases/tag/novel-studio-v1) · 需同时安装伴生 APK 和签名插件入口 |
| 双语选段阅读 | 对照阅读手动输入的中英文选段，保存书签 | [双语阅读 v1](https://github.com/Ga0ga0z1/memo-plugin-market/releases/tag/reader-v1) · 使用宿主的脚本运行环境 |

## 做出第一个插件

用随手记面板走一遍开发流程。它在插件自己的空间保存一段文字，适合检验安装、授权和重启后读取。电脑需要 Git 和 **Node.js 22.19 或更新版本**；SDK 直接使用 Node 内置模块，无需安装 npm 依赖。手机试装需要已安装拓展版 208 的 Android 设备或模拟器（Android 14 及以上）。

在空目录下运行以下命令。生成的密钥和安装包会写入与仓库并列的 `memo-plugin-work` 文件夹。

```sh
git clone https://github.com/Ga0ga0z1/memo-plugin-market.git
cd memo-plugin-market
node --test sdk/memo-plugin.test.mjs
mkdir ../memo-plugin-work
node sdk/memo-plugin.mjs keygen ../memo-plugin-work/publisher.pem ../memo-plugin-work/publisher.der
node sdk/memo-plugin.mjs pack sdk/examples/private-panel ../memo-plugin-work/publisher.pem ../memo-plugin-work/panel-v1.memoplugin
node sdk/memo-plugin.mjs verify ../memo-plugin-work/panel-v1.memoplugin ../memo-plugin-work/publisher.der
```

`keygen` 输出公钥指纹。验签成功后，输出中的 `signerSha256` 应与该指纹相同，`assetSha256` 是整个安装包的 SHA-256。保管好私钥 `publisher.pem`，后续版本继续用它签名。传到手机的文件只有 **`publisher.der` 和 `panel-v1.memoplugin`**。

1. 打开拓展版「设置 → 插件管理与授权 → 发布者与市场来源」。在「添加可信发布者」填 `example.author`，选择 DER 公钥，核对指纹后确认。
2. 返回「插件设置 → 导入与管理 → 选择插件文件」，选中 `panel-v1.memoplugin` 并确认安装。在「插件动作与授权」勾选面板的私有状态权限，点「启用所选授权」。
3. 从首页「更多页面 → 插件」打开网页面板，写入一段测试文字并点「保存」。看到「已保存」后退出并重启应用，再打开面板，应能读回同一段文字。

开发自己的插件时，将一个示例目录复制到自己的项目，修改清单里的 `publisher` 和 `id`，再编辑内容。更新插件时保持这两个标识及签名公钥稳定，提高 `versionCode`，用新输出文件名重新打包。

## 按功能选示例

| 想做的功能 | 从哪里开始 | 首先修改 |
| --- | --- | --- |
| 笔记文本处理 | [文本格式化](sdk/examples/format-text/) | `script.js` 接收 `input.text`，返回带 `text` 的对象 |
| 带交互并保存私有数据的页面 | [离线随手记面板](sdk/examples/private-panel/) | `index.html`，含表单、保存和重读 |
| 向日记追加记录、打开对应笔记 | [一键记事](sdk/examples/quick-capture/) | `manifest.json` 声明宿主提供的动作 |
| 打开独立 Android 页面 | [可构建的 Android 应用](android/example-app/) · [插件清单](sdk/examples/companion-activity/) | Android 包名、Activity 全名、伴生 APK 的签名证书指纹 |
| 接入原生公式识别服务 | [Android 组件协议](docs/plugin-contract.md) · [AIDL 接口](android/aidl/) | Service 全名、AIDL 实现、签名证书指纹 |

关于清单字段、权限、运行限制和包格式，见[插件协议](docs/plugin-contract.md)。所有 SDK 命令、目录格式和维护者工具见 [SDK 手册](sdk/README.md)。

## 第一次试装遇到问题

| 现象 | 检查方法 |
| --- | --- |
| 打包提示文件数量或模板不匹配 | 将清单和所选模板要求的资源放在单独目录。把 README、密钥、旧安装包留在目录外。 |
| 提示输出文件已存在 | `keygen` 和 `pack` 都会保护已有文件。沿用原密钥，给下一次打包换一个输出文件名。 |
| 电脑验签成功，手机仍要求信任发布者 | 核对手机上填写的发布者 ID 与清单中的 `publisher` 相同，再比较手机显示的指纹和 `signerSha256`。 |
| 安装成功但首页找不到面板 | 在「插件动作与授权」确认已启用并授予私有状态权限，再打开首页「更多页面 → 插件」。 |

## 发布到市场

在自己的 GitHub 仓库发布签名包和公钥，保留对应源码 tag 与构建步骤。按[投稿指南](CONTRIBUTING.md)提交固定版本、权限和试装结果；指南分别说明当前收录流程和 208 签名目录的用途。作者可以在投稿前完成本地开发、验签和手机试装。
