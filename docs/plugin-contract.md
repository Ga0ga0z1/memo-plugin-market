# 拓展版 208 插件开发契约

本文对应 Android 备忘录拓展版 `com.gaoyixuan.memo.ext`，versionCode 208。制作第一个插件可直接修改[文本脚本](../sdk/examples/format-text/)或[离线网页面板](../sdk/examples/private-panel/)。安装时需要拓展版宿主、自己的发布者公钥及签名发行包。

## 发行包与身份

`.memoplugin` 的前四行依次为 ASCII 文本 `MEMOPLUGIN/1`、发布者 ID、内部 ZIP 原始字节的 SHA-256 小写十六进制、对相同 ZIP 原始字节的 ECDSA P-256 / SHA-256 签名（ASN.1 DER 签名再做标准 Base64）。每行以单个 LF 结束，第四行后直接拼接 ZIP 字节。作者公钥文件为 X.509 SubjectPublicKeyInfo DER，`signerSha256` 是该 DER 的 SHA-256。市场条目记录的是**整个发行文件**的长度和 SHA-256。

SDK 的 `pack` 会按私钥填写省略的 `signerSha256`，并核对已填写的值。打包输入目录只放下表所列的一份或两份文件，均在根层。README、公钥、构建脚本和伴生 APK 放在目录外。JSON 与文本资产采用 UTF-8，主清单上限 8 KiB。以下三个字段对所有公开模板具有相同含义。

| 字段 | 取值 |
| --- | --- |
| `publisher` | 作者自己选定的稳定 ID，1–128 字符，匹配 `[a-z0-9][a-z0-9._-]*`，末尾不能是点 |
| `id` | 插件的稳定 ID，至多 128 字符，至少两个点分隔的段，每段匹配 `[a-z][a-z0-9-]*`。保留前缀为 `host.`、`memo.internal.state.` |
| `versionCode` | 正整数，以 JSON 数字表示。SDK 接受 JavaScript 安全整数。同一插件用同一发布者密钥签名并递增此值 |

## 选择模板

208 配套 SDK 的 `pack` 支持下表全部发行模板。对声明式程序和原生伴生组件，打包成功之后还要在宿主试装，检查程序语义、设备能力、授权和实际组件。Android APK 由自己的 Android 工程构建、签名和单独安装。手机创作的工作区草稿（如 `phone-draft.json`）由宿主管理，不能直接作为发布包交给 `pack`。

| 模板或格式 | 必须包含的文件 | 运行范围与授权 |
| --- | --- | --- |
| [javascript/1](../sdk/examples/format-text/) | `runtime.json`、`script.js` | 隔离文本转换和私有状态，`["PLUGIN_STATE"]` |
| [web-panel/1](../sdk/examples/private-panel/) | `runtime.json`、`index.html` | 内联离线页面和私有状态，`["PLUGIN_STATE"]` |
| [activity/1](../sdk/examples/companion-activity/) | `runtime.json` | 打开独立伴生 Activity，`[]` |
| [formula/1](../sdk/examples/formula-service/) | `runtime.json` | 向配套服务发送一次获批的 PNG 选区并取回 LaTeX，`["QUERY_NOTES"]` |
| [review/1](../sdk/examples/review-provider/) | `runtime.json`、`review.txt` | 根据评分计算下次复习间隔，`["PLUGIN_STATE"]` |
| [review-client/1](../sdk/examples/review-client/) | `runtime.json` | 使用另一已安装插件导出的复习算法，`["PLUGIN_STATE"]` |
| [quick-capture/1](../sdk/examples/quick-capture/) | `manifest.json` | 宿主内置记事动作，正好声明 `["APPEND_DIARY","OPEN_NOTE"]` |
| [memo.state-composition/1](../sdk/examples/state-composition/) | `state-composition.json`、`program.json` | 声明式表单读写插件私有状态，`PLUGIN_STATE` |
| [memo.note-query/1](../sdk/examples/note-query/) | `note-query.json`、`program.json` | 在授权范围内查询笔记，`QUERY_NOTES`。允许打开结果时另需 `OPEN_NOTE` |
| [memo.confirmed-action/1](../sdk/examples/confirmed-reminder/) | `confirmed-action.json` | 创建单次提醒，或发送一次文本模型请求。分别逐次确认 |

`runtime.json` 与快捷记事的 `manifest.json` 必须包含 `format: 1`、`protocol: 1`、`template`、`publisher`、`id`、`versionCode`、`permissions` 及打包后的 `signerSha256`。其中 `permissions` 是模板规定的精确集合，不接受额外权限或重复值。每个模板仅接受本文列出的字段。下面是可直接作为源码清单的文本插件。

```json
{
  "format": 1,
  "protocol": 1,
  "template": "javascript/1",
  "publisher": "example.author",
  "id": "example.remember",
  "versionCode": 1,
  "permissions": ["PLUGIN_STATE"]
}
```

## 文本脚本和网页面板

`script.js` 是一个严格模式同步生成器的**函数体**，最大 64 KiB。宿主把本次输入作为 `input.text`，最终结果必须恰好是 `{text: "…"}`。208 的前台运行时限为 2 秒，每次最多通过 `yield` 发出 8 次调用。可用操作为 `stateGet` 和 `statePut`。下例在用户输入文字时保存，输入空串时读取上次保存的文字。

```js
if (input.text.length > 0) {
  yield {cap: "statePut", args: {key: "last", value: input.text}};
  return {text: "已保存"};
}
const previous = yield {cap: "stateGet", args: {key: "last"}};
return {text: previous.value};
```

状态键匹配 `[a-z][a-zA-Z0-9_]{0,39}`，状态值最多 2048 个 UTF-16 代码单元。未写入的键返回空字符串。`statePut` 的生成器响应是空对象。脚本输入、输出及跨沙箱调用的每个文本字段还须满足 4096 UTF-8 字节上限。设备须提供宿主所需的 AndroidX JavaScriptEngine 沙箱特性。

`index.html` 是单个 UTF-8 文件，最大 256 KiB。将 CSS 和脚本内联，图片可用内联 data URI。页面通过 `window` 接收 `message`，其 `event.data` 为 `"memo-panel-ready"` 时，从 `event.ports[0]` 取得本次端口。通过端口传送 JSON **字符串**，每个请求使用唯一 ID，保存时须等待宿主回执。

| 操作 | 请求示例 | 成功回执示例 |
| --- | --- | --- |
| 读取 | `{"id":"r1","op":"stateGet","key":"last"}` | `{"id":"r1","ok":true,"value":"昨天的文字"}` |
| 写入 | `{"id":"w1","op":"statePut","key":"last","value":"新文字"}` | `{"id":"w1","ok":true,"value":""}` |

单条请求最多 4096 UTF-8 字节，每次打开最多受理 128 个 ID。ID 匹配 `[A-Za-z0-9_-]{1,40}`，键和值沿用上述规则。执行失败可收到 `{"id":"w1","ok":false}`。格式错误、重复 ID 或额度耗尽可导致请求被丢弃。页面应处理关闭、权限撤销及等待超时。网页端口仅开放本插件的状态读写。[完整页面与端口示例](../sdk/examples/private-panel/index.html)

## Android 伴生组件

**离开页面后继续的工作。** `activity/1` 和 `formula/1` 保持各自的前台入口和限时调用语义。新设计中的手机后台长任务由拓展版接收，在伴生进程退出后独立执行，并保存可按任务标识回读的结果。作者须采用宿主已经对其插件身份开放的适配器，发布说明标注最低支持版本。候选的 `novel.writing/1` 面向受信任的小说工作室，尚不构成 208 SDK 的公开接口。已有模板和签名清单继续沿用原字段。[后台任务投稿与验收](../CONTRIBUTING.md#手机后台任务的投稿条件)

**打开自己的界面。** 复制 [Activity 入口清单](../sdk/examples/companion-activity/runtime.json)，把 `androidPackage`、`activityClass` 和 `apkSignerSha256` 替换为实际 APK 的包名、完整类名与当前 Android 签名证书 SHA-256（64 位小写十六进制）。可运行 `apksigner verify --print-certs my-app.apk` 取得证书摘要。这里的证书属于 Android APK。发行包作者使用前述发布者密钥。示例中的全零指纹是待替换值。

```xml
<activity android:name="com.example.memo.companion.MainActivity" android:exported="true">
    <intent-filter>
        <action android:name="com.gaoyixuan.memo.ext.action.OPEN_COMPANION_V1" />
        <category android:name="android.intent.category.DEFAULT" />
    </intent-filter>
</activity>
```

在应用清单的 `<application>` 内声明组件。宿主查找已启用、可导出的确切 Activity，验证该 APK 当前唯一签名证书，然后使用带 action 和组件名的显式 Intent 启动。208 的此入口不传笔记内容、URI 授权、凭据或页内定位参数。由伴生应用维护自己的界面、资料与 Android 权限。[构建配套的示例 Android 应用](../android/example-app/README.md)

**提供公式识别服务。** `formula/1` 额外字段为 `androidPackage`、`serviceClass`（完整类名）和 `apkSignerSha256`。将 [AIDL 目录](../android/aidl/) 下的包目录原样复制到 Android 模块的 `src/main/aidl/`，在模块启用 `android.buildFeatures.aidl`。服务实现 `INativeProvider.Stub`，通过 `Service.onBind` 返回该 binder。在清单声明 `android:exported="true"` 的 Service，带 action `com.gaoyixuan.memo.ext.action.NATIVE_PLUGIN_V1` 的 intent filter。服务位于伴生 APK 自己的 UID，不使用 shared UID、isolatedProcess 或 externalService。

1. 宿主调用 `hello(1, "formula.recognize", 1, callId, reply)`。服务记录这次调用的回调，并回复 `reply.ready(1, callId, "formula.recognize", 1)`。
2. 握手完成后，宿主调用 `submit(1, callId, "image/png", payload, deadlineElapsedMs)`。payload 是用户批准的 PNG 字节，最多 48 KiB。截止时间使用 Android 单调时钟 `SystemClock.elapsedRealtime()` 的毫秒数，整次调用最多 15 秒。
3. 成功时调用 `reply.finished(1, callId, 0, latexBytes)`。输出为 1–8192 字节的严格 UTF-8 LaTeX，应包含非空白文字。控制字符仅可用换行、回车、制表符。不可用返回状态 1，不兼容返回 2。回调从服务自己的 UID 发出并回显原始 callId。
4. 处理 `cancel(1, callId)`、绑定断开和过期，结束对应工作并清理回调。导出服务应在 Binder 方法入口核对调用方身份，按调用方区分会话。协议方法是 oneway，请将较慢的识别放到工作线程。[服务接口](../android/aidl/com/gaoyixuan/memo/nativebridge/INativeProvider.aidl) · [回调接口](../android/aidl/com/gaoyixuan/memo/nativebridge/INativeReply.aidl)

## 复习与声明式模板

**复习算法。** `review.txt` 使用 ASCII、空白分词的后缀表达式。首词为 `review/1`，最终栈上只允许一个 1–36500 的整数天数。例如 `review/1 grade 3 lt 1 interval 2 mul 1 max select` 在评分低于 3 时返回 1 天，否则将上次间隔翻倍，最短为 1 天。可读变量为本次评分 `grade`（0–5）、上次间隔天数 `interval`、既往次数 `reviews`、上次评分 `previousGrade`、距上次复习天数 `elapsed`。首次复习时后四项均为零。支持十进制非负整数字面量、`true`、`false`、`add sub mul div min max lt eq select`。`select` 的栈顺序为条件、真值、假值。源码最多 4096 字节、256 步、32 个栈值。此模板给出复习日期，系统闹钟另走提醒授权。

对外提供算法时，可在 `review/1` 清单加 `"exportReview":true`。使用者以 `review-client/1` 声明 `providerId`、`providerSignerSha256`、`minProviderVersion`、`maxProviderVersion`，版本范围正整数且含两端，提供者与使用者 ID 须不同。两侧均需安装、启用并取得相应授权。

**快捷记事。** `quick-capture/1` 采用共用清单字段，文件名是 `manifest.json`。可选 `surfaceSlots` 是不重复的数组，有效项为 `HOME`、`EDITOR`、`PROJECT`、`AI_ASSISTANT`，用户可以选择相应页面的入口。

**状态表单和查询表单。** 将 `format`、`publisher`、`id`、`versionCode` 放在对应的 `state-composition.json` 或 `note-query.json`。SDK 补上 `signerSha256`。查询主清单还必须有布尔字段 `openResult`。这些主清单的 `format` 是上表中的完整字符串。动作集合和权限写入配套程序。下面这份 `program.json` 可搭配 `memo.note-query/1` 使用。

```json
{
  "format": "memo.composition-draft/1",
  "permissions": ["QUERY_NOTES"],
  "entries": [{
    "id": "find", "title": "查找笔记", "slot": "ACTION",
    "fields": [{"id":"q","label":"标题关键词","type":"TEXT"}],
    "steps": [
      {"do":"query","args":{"text":{"var":"q"},"limit":8},"as":"hits"},
      {"list":{"var":"hits"}}
    ]
  }]
}
```

`program.json` 最大 32 KiB，每个程序含 1–6 个入口，入口 ID 唯一，各有 `id`、`title`、`slot`、`fields`、`steps`。查询表单只允许 `query`，按普通笔记标题做忽略大小写的子串匹配，查询词两端会去空白，最多 2048 个 UTF-16 代码单元。结果数 `limit` 从 1 到 24。设 `openResult:true` 时宿主另行请求打开结果权限。状态表单的权限为 `["PLUGIN_STATE"]`，动作限于 `stateGet`、`statePut`。例如将上例步骤改成 `[{"do":"statePut","args":{"key":"last","value":{"var":"q"}}}]`，即可把用户输入保存到此插件私有状态。

**逐次确认动作。** `confirmed-action.json` 使用 `"format":"memo.confirmed-action/1"`、`publisher`、`id`、`versionCode`、打包后的 `signerSha256` 与一个 `action` 字符串。`"remind"` 请求 `SCHEDULE_REMINDER`，由用户指定已有待办和日期。`"ask"` 请求 `INVOKE_AI` 与 `SEND_NOTE_TO_MODEL`，发送用户本次确认的文本。表单、再次确认和实际执行由宿主提供，此发行包只含主清单。
