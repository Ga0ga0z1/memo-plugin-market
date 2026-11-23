# 备忘录插件 SDK

用 Node.js 22.19 或更新版本即可从源码生成拓展版 208 可导入的 `.memoplugin`。SDK 只依赖 Node 内置模块。下面的命令均从市场仓库根目录运行。

## 第一次打包

先运行 SDK 测试，在仓库旁边新建一个自己的工作目录，再复制[网页面板示例](examples/private-panel/)。以下命令适用于 PowerShell。

```powershell
node --test sdk/memo-plugin.test.mjs
mkdir ../memo-plugin-demo
Copy-Item sdk/examples/private-panel ../memo-plugin-demo/panel -Recurse
node sdk/memo-plugin.mjs keygen ../memo-plugin-demo/publisher.pem ../memo-plugin-demo/publisher.der
node sdk/memo-plugin.mjs pack ../memo-plugin-demo/panel ../memo-plugin-demo/publisher.pem ../memo-plugin-demo/panel.memoplugin
node sdk/memo-plugin.mjs verify ../memo-plugin-demo/panel.memoplugin ../memo-plugin-demo/publisher.der
```

`keygen` 输出公钥的 SHA-256 指纹。保管好 `publisher.pem`，开发、重装宿主或升级 SDK 时均可继续使用同一把私钥。分发时只提供 `publisher.der`、指纹和插件包。`pack` 会把公钥指纹填入包内清单，再打印整个发行文件的 SHA-256。`verify` 输出的 `assetSha256` 应与该值一致。输出文件须使用新路径，例如第二版可叫 `panel-v2.memoplugin`。

把 `publisher.der` 和 `panel.memoplugin` 传到手机。以下步骤针对上述原样示例。

1. 打开拓展版的「设置 → 插件管理与授权 → 发布者与市场来源」。在「发布者 ID」填入 `example.author`，选择 P-256 公钥文件 `publisher.der`。核对弹窗指纹与 `keygen` 输出后确认。
2. 返回「导入与管理」，点「选择插件文件」并选中 `panel.memoplugin`。核对发布者、版本和申请的插件私有状态权限，确认安装。在「插件动作与授权」勾选插件私有状态，点「启用所选授权」。
3. 从首页「更多页面 → 插件」打开面板，输入一行文字，点「保存」。看到「已保存」后退出并重新打开，应读回刚才的文字。

开发自己的插件时，在示例副本中把 `publisher` 和 `id` 改成自己的稳定标识。对应地，在手机上填自己的发布者 ID。每次发布更新时增加 `versionCode`、保留私钥、重新打包，并使用新输出文件名。包的输入目录只放模板所需的一份或两份文件。把说明、密钥、APK 和输出包留在该目录之外。

## 按用途选择示例

| 想实现的功能 | 示例 | 试运行前要准备什么 |
| --- | --- | --- |
| 清理文本行首和首尾空白 | [文本脚本](examples/format-text/) | 在支持隔离 JavaScript 的设备运行动作 |
| 用自己的 HTML 界面保存文字 | [离线网页面板](examples/private-panel/) | 安装、授予插件私有状态权限并启用 |
| 由宿主显示一键记事 | [快捷记事](examples/quick-capture/) | 审阅日记追加和笔记打开权限 |
| 用原生表单保存私有状态 | [声明式表单](examples/state-composition/) | 授予私有状态权限，在动作表单输入文字 |
| 查询笔记标题 | [笔记查询](examples/note-query/) | 选择允许查询的资料库；示例只列出结果 |
| 逐次确认待办提醒 | [一次提醒](examples/confirmed-reminder/) | 提供已有待办和日期，审阅本次操作 |
| 计算下次复习间隔 | [复习提供者](examples/review-provider/) | 示例按历史复习次数加一计算间隔，并声明可导出该能力 |
| 调用另一个插件的复习算法 | [复习消费者](examples/review-client/) | 把 `providerSignerSha256` 的占位值换成实际提供者公钥指纹，核对 `providerId` 和版本范围，安装、授权并启用两端 |
| 打开 Android 界面 | [伴生 Activity 清单](examples/companion-activity/) | 构建并安装[伴生示例 App](../android/example-app/)，清单填写实际包名、Activity 类名和该 APK 的签名证书 SHA-256 |
| 识别选区内的公式 | [公式服务清单](examples/formula-service/) | 在独立 APK 中实现 [AIDL 接口](../android/aidl/)，把清单中的组件名、包名及全零证书指纹替换成实际值 |

各模板的输入、返回值、文件限制、权限与 Android 接口见[宿主开发契约](../docs/plugin-contract.md)。`pack` 检查发行结构并签名，`verify` 检查外层摘要和签名。安装时宿主还会验证内部清单、程序和本机权限；设备试运行才能验证 UI、服务、授权和更新效果。

## 命令速查

| 命令（省略 `node sdk/memo-plugin.mjs`） | 用途 |
| --- | --- |
| `keygen PRIVATE.pem PUBLIC.der` | 生成发布者密钥对并打印公钥指纹 |
| `pack DIR PRIVATE.pem OUT.memoplugin` | 将输入目录组装并签名，打印文件摘要 |
| `verify FILE PUBLIC.der` | 使用选定公钥核对文件内的签名和 ZIP 摘要 |
| `review-asset FILE PUBLIC.der OWNER/REPO ASSET_ID TITLE` | 离线审阅 SDK 生成的文件，核对包内外身份并输出清单与候选目录条目；资产 ID、仓库名需要另行取证 |
| `review-github OWNER/REPO TAG FILE PUBLIC.der TITLE` | 下载指定公开正式 Release 的固定资产，核对 GitHub 资产 ID、大小、摘要与作者签名 |
| `sign-catalog JSON MARKET_PRIVATE.pem OUT.memocatalog` | 市场维护者用自己的目录密钥对原始 JSON 字节签名 |

发布后如何向市场投稿、核对作者公钥以及目录收录现状，见[投稿指南](../CONTRIBUTING.md)。签名目录的字段见[目录 Schema](community-catalog.schema.json)。

原生伴生 APK 由单独的 `node sdk/review-companion.mjs BUILD_TOOLS APK ANDROID_PACKAGE APK_SIGNER_SHA256` 检查。包名和 Android 签名指纹取自已验签的插件清单；命令调用 Android Build Tools 验证 APK，并输出该文件的摘要、权限和桌面入口，供发布审核与设备验收对照。宿主接管后台工作的材料要求见[投稿条件](../CONTRIBUTING.md#手机后台任务的投稿条件)。

## 常见问题

- **提示 `EEXIST`**　CLI 保护已有密钥和输出文件。保留原私钥，给新发行包选择另一个文件名。
- **提示输入文件与模板不符**　打包参数应指向示例的最内层目录，例如 `sdk/examples/private-panel`。网页面板目录里应只有 `runtime.json` 和 `index.html`。
- **公钥或签名不匹配**　对照 `verify` 的 `signerSha256` 和手机保存的作者指纹。Android 模板的 `apkSignerSha256` 来自伴生 APK 的证书，`providerSignerSha256` 来自所依赖插件的发布者公钥。
- **能验签，但运行时没有预期结果**　在「插件动作与授权」查看插件是否已启用及当前范围。网页面板要在宿主内打开，Activity 或公式服务要先安装和清单匹配的 APK，复习消费者要先配置提供者。
