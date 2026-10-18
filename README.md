# dsh-cost-slip

> DSH（DeepSeek Harness）插件：在输入框底部显示当前会话的估算费用（人民币），点击打开，显示费用明细和账号余额。

![截图展示](https://raw.githubusercontent.com/pktheme/dsh-cost-slip/main/docs/Screenshot.png)

## 功能

- **独立胶囊**：在输入框底部统计行里，和「会话统计」「Token 用量」并排；收据图标 + `费用 ¥0.44`，hover 底色和圆角与原生一致。
- **费用明细**：点开胶囊，按「缓存命中 / 未缓存输入 / 输出」列出 token 数与金额，标题右侧是合计。
- **账号余额**：明细下方显示当前登录账号的「充值余额」「赠金余额」；打开弹窗时刷新读一次，之后每 10 秒刷新。
- **按条计价**：每条回复用当时的模型和峰谷价单独计算，中途换模型、跨高峰都保持准确。
- **窄窗口自适应**：窗口变窄或打开右侧边栏时，胶囊文字像原生统计项一样省略号截断。

## 安装

基于 DSH `0.2.1-rc.2` 开发，更低版本安装使用尚未测试。

```bash
dsh plugin add dsh-cost-slip
```

（`dsh` 未全局安装时：`npx --yes @deepseek-ai/dsh plugin --profile web add dsh-cost-slip`）

安装后重启 `dsh web` 生效。

桌面版：插件 → 添加插件 → 安装第三方插件，填 `dsh-cost-slip`，启用后重启 DSH。

首次安装需要联网：宿主端依赖 `zod`，由 pnpm/npm 自动安装。

## 怎么算的

按**每条** `assistant/message`（以及失败重试的 `assistant/attempt`）单独计价：

1. 取这条回复的 `usage`：未命中输入 `inputTokens`、缓存命中 `cacheReadTokens`、缓存写入 `cacheWriteTokens`、输出 `outputTokens`。
2. 取这条回复的模型（`message.source.model`，缺失时用最近一次 `request/header`）和完成时间 `event.time`。
3. 用 `lib/pricing.js` 的价目表计算，单位换算成微元后累加。

**缓存写入按未命中单价计。** 价格来源：[DeepSeek 官方定价](https://api-docs.deepseek.com/zh-cn/quick_start/pricing)

## 隐私

- 只通过 DSH 宿主接口读取会话的 token 用量与事件，不抓包、不联网。
- 余额通过宿主提供的账号接口读取，仅用于显示。
- 不上报任何数据，不写入额外文件。

## 已知边界

- **估算值**：不是官方账单；赠送额度、优惠、失败请求的计费细节以 DeepSeek 账单为准。
- **子智能体**：subagent 跑在独立会话里，主会话的费用不含它们的消耗。
- **旧事件**：只对带 provider usage 的回复计费；没有 usage 的旧事件会跳过。
- **兼容性**：依赖 DSH 的 `sessionProjections` 和 `composer.dock` 插槽；DSH 大版本升级后若改名，插件需要跟着改。

## 开发

```bash
git clone https://github.com/pktheme/dsh-cost-slip.git
cd dsh-cost-slip
dsh plugin --profile web add "$PWD"
```

- `lib/index.js`：宿主端会话投影，按条累计费用。
- `lib/client.js`：胶囊与弹窗 UI。
- `lib/pricing.js`：价目表与峰谷判断，调价只改这里。
- `locale/*.json`：插件名与简介。

协议：MIT。

## 图标

插件页图标 `icon.svg` 与界面里的收据图标均为作者本人绘制。

---

非官方插件，与 DeepSeek 官方无隶属关系。
