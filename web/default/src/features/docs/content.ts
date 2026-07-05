// 平台文档原始内容（按 section 拆分）
// 改文档只动这一份文件 —— 不要直接改 page 组件

import {
  Rocket,
  Sparkles,
  KeyRound,
  Cpu,
  CreditCard,
  Terminal,
  Plug,
  Building2,
  AlertTriangle,
  MessageCircle,
  Scale,
  Layers,
  ShieldCheck,
  RefreshCw,
  Crown,
  type LucideIcon,
} from 'lucide-react'

export type DocCategory = 'getting-started' | 'reference' | 'operations'

export interface DocSection {
  id: string
  title: string
  blurb: string
  icon: LucideIcon
  category: DocCategory
  minutes: number
  body: string
}

export const CATEGORY_META: Record<
  DocCategory,
  { label: string; description: string }
> = {
  'getting-started': {
    label: '入门',
    description: '5 分钟跑通',
  },
  reference: {
    label: '参考',
    description: 'API、模型、客户端',
  },
  operations: {
    label: '运营',
    description: '企业 / 错误码 / 反馈',
  },
}

const BASE = 'https://zhuanzhuan.pw'

export const DOC_SECTIONS: DocSection[] = [
  {
    id: 'quick-start',
    title: '快速上手',
    blurb: '一分钟拿到第一次调用',
    icon: Rocket,
    category: 'getting-started',
    minutes: 1,
    body: `## 一分钟接入

\`\`\`bash
curl ${BASE}/v1/chat/completions \\
  -H "Authorization: Bearer sk-xxxxxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-5",
    "messages": [{"role": "user", "content": "你好"}]
  }'
\`\`\`

## 三步开通

1. **注册账号** — 邮箱或微信扫码均可，进 [注册页](/sign-up)
2. **创建 API 密钥** — 在 [密钥管理](/keys) 点 "新建"，拿到 \`sk-\` 开头的密钥
3. **替换 base URL 为 \`${BASE}/v1\`** — 完全兼容 OpenAI / Anthropic / Gemini 原生 SDK

## 支持的 SDK 协议

| SDK 类型 | 配置方式 |
|---|---|
| OpenAI Python / Node | \`base_url = "${BASE}/v1"\` |
| Anthropic Claude Code / Cursor | \`ANTHROPIC_BASE_URL=${BASE}\` |
| Google Gemini | 域名替换为 \`${BASE}\` |
| LangChain / LiteLLM | 按 OpenAI 兼容协议配置 |
| Cherry Studio | OpenAI 兼容供应商，API Host = \`${BASE}\` |
`,
  },
  {
    id: 'platform-features',
    title: '平台特色',
    blurb: 'SmartRelay 自研优化层让你比官方还便宜',
    icon: Sparkles,
    category: 'getting-started',
    minutes: 3,
    body: `## 我们做了什么不一样的？

**摆渡人** 不是简单的请求转发，自研 **SmartRelay 优化层** 在请求路径上做了四件事：

### 1. 响应缓存
完全相同的请求直接命中本地缓存，**0 延迟、0 费用**。多端共享同一个 prompt 的场景特别有效。

### 2. 上下文压缩
长对话历史经过摘要压缩，关键信息保留、节省 token。压缩本身的成本由平台承担。

### 3. 上游缓存断点注入
自动在 \`Tools → System → 历史边界\` 4 个最优位置插入 \`cache_control\`，最大化 Claude / OpenAI 官方缓存命中率。**比你自己手写还激进**。

### 4. 工具响应截断
工具响应超过 25K token 自动截断 —— 按 Anthropic 工程团队推荐值。防止 context rot 拖累后续生成质量。

## 节省效果可视化

- **个人节省数据** → [用量日志](/usage-logs/common) 顶部 "SmartRelay 智能优化为你节省" 卡片
- **全平台节省数据** → 首页落地页 "已为客户累计节省" 横幅，每分钟刷新

## 高可用调度

多密钥负载均衡 + 速率受限自动避让 + 故障秒级切换，对用户完全透明。
`,
  },
  {
    id: 'authentication',
    title: '认证 & 密钥',
    blurb: '密钥粒度的额度、模型白名单、IP 限制',
    icon: KeyRound,
    category: 'getting-started',
    minutes: 2,
    body: `## API 密钥

进 [密钥管理](/keys) 页面，每个密钥都能单独设置：

| 维度 | 说明 |
|---|---|
| **额度** | 给某个密钥设上限，用完即停 |
| **过期时间** | 永不过期 / 1小时 / 1天 / 1月 / 自定义 |
| **分组绑定** | 让密钥固定走某个分组（如 "星期四-Claude特价"） |
| **模型白名单** | 限制该密钥能调用的模型范围 |
| **IP 白名单** | 支持 CIDR 表达式，配合 nginx/CDN 使用 |
| **Auto 分组** | 启用后失败自动切换到下一个分组 |
| **批量创建** | 一次创建多把密钥用于团队分发 |

## 请求头

\`\`\`http
Authorization: Bearer sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Content-Type: application/json
\`\`\`

## 强制指定分组

如需让请求只走某分组：

\`\`\`http
X-Force-Group: 星期四-Claude特价
\`\`\`

或 URL 查询参数：

\`\`\`text
${BASE}/v1/chat/completions?group=星期四-Claude特价
\`\`\`
`,
  },
  {
    id: 'models',
    title: '模型 & 价格',
    blurb: '500+ 模型，4 大主流厂商 + 国内模型',
    icon: Cpu,
    category: 'reference',
    minutes: 3,
    body: `## 支持的模型

打开 [模型广场](/pricing) 查看完整列表 + 实时倍率。主要分类：

### OpenAI 系列
\`gpt-5\` / \`gpt-5-mini\` / \`gpt-5-codex\` / \`gpt-4o\` / \`gpt-image-2\` / \`o3\` / \`o4-mini\`

### Anthropic Claude 系列
\`claude-opus-4.7\` / \`claude-sonnet-4.6\` / \`claude-haiku-4.5\` / \`claude-opus-4-7-thinking\`

### Google Gemini
\`gemini-3-pro-preview\` / \`gemini-2.5-pro\` / \`gemini-2.5-flash\` / \`gemini-3-pro-image-preview\`（绘画）

### 国内模型
DeepSeek / 智谱 GLM / MiniMax / 月之暗面 Kimi / 阿里 Qwen

### 图像生成
\`gpt-image-2\` / \`flux-1.1-pro\` / \`nano-banana\` / \`grok-imagine\`

## 价格计算公式

\`\`\`text
费用 = ModelRatio × CompletionRatio × tokens × $2/1M × 分组倍率
\`\`\`

- **ModelRatio** — 模型基础倍率（\`gpt-5\` 是 0.625，\`claude-opus-4.7\` 是 2.5）
- **CompletionRatio** — output 与 input token 的价格比（OpenAI 通常 4×）
- **分组倍率** — default = 1.0，特价分组 < 1.0 是折扣
- **缓存命中、压缩节省的 token 不计费**

## 计费维度

| 模式 | 说明 |
|---|---|
| **额度计费**（quota） | 充值进余额，按 quota 单位扣减（500,000 = $1） |
| **订阅计费** | 月卡 / 季卡，时间内无限调用（受公平使用条款） |
`,
  },
  {
    id: 'compare',
    title: '全网比价',
    blurb: '56 家中转站实时价格、稳定性、久经考验候选',
    icon: Scale,
    category: 'reference',
    minutes: 2,
    body: `## 我们在哪里？

[**打开比价页**](/bijia.html)（登录后可见）

平台收录了全网 **56 家**主流 AI API 中转站的实时价格倍率，**与我们自己价格做对比**，让你清楚知道：

- 哪家便宜，便宜多少（百分比）
- 哪家稳定（连续 5 天价格不变 / 22 天前还在运营）
- 哪家有风险（极低价、不验证邮箱、域名飘忽）

## 三层稳定性评级

| 标签 | 含义 |
|---|---|
| 📜 **久经考验** | 22 天前的旧快照里就有这个站，今天仍能探测到——商业运营超过 3 周 |
| 🏆 **N 天稳定** | 价格连续 N 天没有变动（N ≥ 5）——背后供给链路稳定 |
| ⚠ **风险** | 不验证邮箱、无 Turnstile、价格 < 官方 30%——薅羊毛/灰产倾向 |

## 数据来源

- 每天自动探测收录站点的公开价格接口，数据每日刷新
- 死站连续挂 ≥2 天自动隐藏，无需人工维护

## 想做我们的上游？

如果你是中转站运营方，希望被收录或推荐，请通过[反馈页](/feedback)联系我们。
`,
  },
  {
    id: 'subscription',
    title: '订阅套餐',
    blurb: '包月套餐：固定预算，比按 Token 计费便宜 70%',
    icon: Crown,
    category: 'getting-started',
    minutes: 2,
    body: `## 为什么选订阅套餐？

按 Token 计费：用多少付多少，**预算难控**。
订阅套餐：固定月费，**N 百万 Tokens 任你用**，超出按 default 组继续扣余额（不会断流）。

## 8 大热门套餐

| 套餐 | 价格 | 上限 | 包含模型 | 适合 |
|---|---|---|---|---|
| 入门体验周卡 | ¥9.9/周 | 5M | haiku-4-5 / 4o-mini / 5-mini | 新人尝鲜 |
| Claude Code Lite 月卡 | ¥58/月 | 20M | claude-haiku-4-5 | Claude 轻度 |
| **Claude Code 标准月卡** 🔥 | ¥168/月 | 30M | haiku-4-5 + sonnet-4-6 | **Claude 主力** |
| Claude Code 旗舰月卡 | ¥388/月 | 30M | sonnet-4-6 + opus-4-7 | Claude 重度 |
| GPT 标准月卡 | ¥168/月 | 50M | gpt-5 / 4o / 4.1 | GPT 主力 |
| Codex 编程月卡 | ¥248/月 | 80M | gpt-5 / gpt-5.5 | 代码生成 |
| **AI 全家桶月卡** ⭐ | ¥298/月 | 30M | 全模型 | **综合用户** |
| 企业旗舰季卡 | ¥1998/季 | 100M/月 | opus-4-7 / gpt-5 / sonnet-4-6 | 团队/企业 |

## 怎么买

打开[钱包页](/console/wallet)，下拉到「订阅套餐」区域，选好后扫码支付。
首页也能直接看到所有套餐预览。

## 价格对比

以 30M tokens 用量为例：
- **default 组按 Token 算**：约 ¥500-800（视模型）
- **Claude Code 标准月卡 ¥168**：节省 60-75%

包月还含**优先服务**：失败自动重试、专属上游池、客服优先响应。
`,
  },
  {
    id: 'groups',
    title: '分组路由',
    blurb: '一个模型多个价位档，按预算自由切换',
    icon: Layers,
    category: 'reference',
    minutes: 2,
    body: `## 分组是什么？

同一个模型在平台上提供**多个价位档**（分组）：便宜的档性价比高，贵的档稳定性强。API key 绑定哪个分组，请求就走哪个档。

## 不知道选哪个？

→ 直接用 **\`default\`** 通用组（推荐新手）
- 自动路由稳定渠道，挂掉一条秒切下一条
- 覆盖所有热门模型

## 怎么看每个分组的价格？

打开 [模型广场](/pricing)：选中任意模型，即可看到它在各个分组下的**实时倍率与折算价**，按预算挑选即可。

## 自动熔断机制

每个分组内多条渠道，系统自动管理可用性：

1. **单次请求重试**：请求失败 → 立即同组 retry 到其他渠道（最多 3 次，客户无感知）
2. **自动禁用故障渠道**：连续失败 → 状态变 \`auto-disabled\`，不再被路由
3. **3 小时自动恢复探测**：每 180 分钟 ping 一次禁用渠道，恢复就重启用

## 怎么切换分组

打开 API 密钥编辑弹窗 → 选「分组」下拉 → 选目标组 → 保存。
新分组立即生效，**不需要重新生成 key**。
`,
  },
  {
    id: 'anthropic-api',
    title: 'Anthropic 原生接口',
    blurb: 'Claude Code / Cursor / Cherry Studio 即插即用',
    icon: Sparkles,
    category: 'reference',
    minutes: 2,
    body: `## 完整支持 Anthropic API 格式

直接用 Anthropic 官方 SDK，**只改 base_url**：

\`\`\`python
from anthropic import Anthropic

client = Anthropic(
    base_url="https://zhuanzhuan.pw",
    api_key="sk-你的key"
)

response = client.messages.create(
    model="claude-opus-4-7",
    max_tokens=1024,
    messages=[{"role": "user", "content": "hello"}]
)
\`\`\`

## 支持的端点

| 端点 | 用途 |
|---|---|
| \`POST /v1/messages\` | Anthropic 原生 Messages API |
| \`POST /v1/chat/completions\` | OpenAI 兼容（也能跑 Claude）|

## 支持的鉴权头

两种都识别：

\`\`\`bash
# Anthropic 原生风格
curl https://zhuanzhuan.pw/v1/messages \\
  -H "x-api-key: sk-xxxxxx" \\
  -H "anthropic-version: 2023-06-01" \\
  -H "content-type: application/json"

# OpenAI 兼容风格
curl https://zhuanzhuan.pw/v1/messages \\
  -H "Authorization: Bearer sk-xxxxxx" \\
  -H "content-type: application/json"
\`\`\`

## 客户端工具

- **Claude Code CLI**：环境变量 \`ANTHROPIC_BASE_URL=https://zhuanzhuan.pw\`
- **Cursor / Cline**：API 设置里改 base URL
- **Cherry Studio / AionUI**：从首页一键导入配置

详见[聊天客户端集成](/doc#chat)。
`,
  },
  {
    id: 'smartrelay',
    title: 'SmartRelay 智能优化',
    blurb: '会话粘滞 + 缓存断点注入 + 上下文压缩 · 平均省 30-50% Token',
    icon: ShieldCheck,
    category: 'reference',
    minutes: 3,
    body: `## SmartRelay 智能优化引擎

SmartRelay 在每次请求路径上**自动运行、用户无感**，围绕两大核心——**缓存命中率最大化** 与 **会话上下文压缩**——让你的每一分预算更耐用。

## 一、缓存命中率技术

### 1. 会话粘滞路由（Session Affinity）— 核心壁垒
多轮对话中，平台把**同一会话的后续请求，始终路由到同一上游节点**，使上游 Prompt Cache 在整段会话里**持续保持热缓存、连续命中**。

> 多数中转 / 聚合服务采用轮询或负载均衡，每一轮请求都可能落到不同节点，导致缓存反复失效、命中率极低。SmartRelay 的会话粘滞让你的缓存**不被打散**——这是我们缓存命中率显著领先同行的根本原因。

### 2. 缓存断点智能注入（Auto Cache Breakpoint）
自动在最优稳定前缀边界（\`System\` 提示词、\`Tools\` 工具定义）插入 \`cache_control\` 缓存标记。即使你的客户端**没有手动开启缓存**，也能吃满官方 Prompt Caching——缓存命中部分最高省 **90%**。比手动配置更稳、更激进。

### 3. 响应缓存（Response Cache）
完全相同的请求直接命中本地缓存，**零延迟、零费用**。适合高频固定 prompt、模板化问答、多端共享同一 prompt 的场景。

## 二、会话压缩技术

### 4. 上下文压缩（Context Compaction）
针对 Claude Code / Cursor / Codex 这类**超长多轮 Agent 会话**，对历史上下文智能压缩：保留关键信息、削减冗余 token，让长会话不会越跑越贵。

### 5. 工具响应截断（Tool Output Artifact）
工具调用返回超长时自动截断为引用，避免每轮都把大段工具输出反复塞进上下文——按业界 Agent 工程最佳实践。

## 省下的不计费

通过以上缓存与压缩节省下来的 token，**全部不计入你的账单**。命中率越高、会话越长，省得越多——尤其适合 Claude Code 这类高缓存、长上下文的真实工程场景。

## 怎么看自己的优化效果

控制台 → 用量日志 → 顶部「**SmartRelay 节省**」卡片，展示你近 30 天节省的 Tokens / 估算价值 / 缓存命中数等指标。首页也会展示全站累计节省数据，每分钟自动刷新。
`,
  },
  {
    id: 'exchange-rate',
    title: '汇率自动同步',
    blurb: '每小时自动拉真实 USD→CNY，杜绝陈旧汇率',
    icon: RefreshCw,
    category: 'reference',
    minutes: 1,
    body: `## 实时汇率显示

首页 Hero 区下方 + 控制台 Overview 顶部有一个**呼吸灯汇率卡**，显示当前 USD→CNY 实时汇率。

## 自动同步频率

- 系统每小时自动拉一次实时汇率
- 数据源：[open.er-api.com](https://open.er-api.com)（免费 + 实时）
- 兜底：备用源 exchangerate-api.com / fawazahmed currency-api

## 卡片内容

- **当前汇率**：¥X.XXXX / $1
- **趋势**：↗ 涨 / ↘ 跌（相比上次刷新）
- **倒计时**：距离下次刷新还有 hh:mm:ss
- **数据源**：链接到原始 API

## 用途

- **客户查询**：自己充值时心里有数
- **平台对账**：部分上游按美金结算，实时汇率让月底对账更准
- **报价透明**：所有 ¥ 价格都按实时汇率换算，没隐藏溢价
`,
  },
  {
    id: 'image-video-models',
    title: '图像 / 视频模型',
    blurb: '按次 + 按分辨率 + 按 token 三种计费模式都支持',
    icon: Sparkles,
    category: 'reference',
    minutes: 2,
    body: `## 支持的图像 / 视频模型

### 图像生成

| 模型 | 厂商 | 计费方式 |
|---|---|---|
| **gpt-image-2** | OpenAI | 按次（$0.04/张）|
| **gpt-image-1** | OpenAI | 按次 |
| **nano-banana** | Google | 按次 + token（3 档分辨率）|
| **banana-2** (各种变体) | Google | 按次 |
| **grok-imagine-image** | xAI | 按次（$0.03/张）|
| **gemini-2.5-flash-image** | Google | 按 token |
| **gemini-3-pro-image-preview** | Google | 按 token |

### 视频生成

| 模型 | 厂商 | 计费方式 | 备注 |
|---|---|---|---|
| **veo** | Google | 按次 | 单价较高，谨慎使用 |
| **sora-image** | OpenAI（间接） | 按次 | 通过部分上游间接支持 |

## 计费模式说明

new-api 用三种字段表达不同计费方式：

1. **按次** (model_price > 0)：
   - 一次请求 = 一张图片，扣 model_price USD
   - 不分输入输出 token
   - 适合：图像生成（一张一价）

2. **按 token** (model_ratio > 0)：
   - 输入 token × model_ratio × group_ratio × $2/M
   - 输出 token × model_ratio × completion_ratio × group_ratio × $2/M
   - 适合：文本模型 + 部分混合模态模型（如 Gemini Image）

3. **按分辨率**（部分模型）：
   - new-api 通过 \`other.image_ratio\` 字段支持
   - 1024×1024 = 标准, 2048×2048 = 4 倍单价

## 怎么调用图像生成

\`\`\`python
from openai import OpenAI
client = OpenAI(
    api_key="sk-xxx",
    base_url="https://zhuanzhuan.pw/v1"
)
resp = client.images.generate(
    model="gpt-image-2",
    prompt="a red panda riding a unicycle in space",
    n=1,
    size="1024x1024"
)
print(resp.data[0].url)
\`\`\`

## 价格透明

所有按次模型在定价页 \`/pricing\` 显示「¥X.XX / 请求」，不会按 token 误算。
所有按 token 模型显示 \`¥X.XX / 1M 输入 · ¥Y.YY / 1M 输出\`。

## 文生视频（特别提示）

veo 等视频模型单次成本可能 ¥10-100，建议先用 1M+ 的 token 量级套餐用户尝试。后台已对 veo 设置了渠道级单价告警。
`,
  },
  {
    id: 'recharge',
    title: '充值 & 订单',
    blurb: '多通道支付，订单可自助删除',
    icon: CreditCard,
    category: 'reference',
    minutes: 2,
    body: `## 充值方式

进入 [钱包](/wallet) 页面，目前支持：

- **支付宝 / 微信** — 易支付通道，即时到账
- **Stripe** — 海外信用卡
- **Creem / Waffo** — 备用通道
- **激活码兑换** — 输入管理员提供的 redemption code

## 订单管理

在钱包页"账单历史"里：

| 状态 | 含义 | 是否可删除 |
|---|---|---|
| **待支付** | 订单创建但未付款 | ✅ 可删除 |
| **失败** | 支付通道返回失败 | ✅ 可删除 |
| **过期** | 订单超时自动失效 | ✅ 可删除 |
| **已成功** | 已到账，审计保留 | ❌ 不可删除 |

## 自动续费

订阅计划支持自动续费。可在 [订阅页面](/subscriptions) 手动关闭或修改下次扣款时间。
`,
  },
  {
    id: 'api-reference',
    title: 'API 接口参考',
    blurb: 'OpenAI / Anthropic / Gemini 三套原生协议',
    icon: Terminal,
    category: 'reference',
    minutes: 4,
    body: `## OpenAI 兼容协议

100% 兼容 OpenAI 官方 API：

| 接口 | 端点 |
|---|---|
| Chat Completions | \`POST ${BASE}/v1/chat/completions\` |
| Embeddings | \`POST ${BASE}/v1/embeddings\` |
| Images | \`POST ${BASE}/v1/images/generations\` |
| Audio TTS | \`POST ${BASE}/v1/audio/speech\` |
| Audio STT | \`POST ${BASE}/v1/audio/transcriptions\` |
| Files | \`POST ${BASE}/v1/files\` |
| Models | \`GET  ${BASE}/v1/models\` |
| Responses API | \`POST ${BASE}/v1/responses\` |

## Anthropic Claude 原生协议

Cursor、Claude Code、Cline 等工具能直接用：

\`\`\`bash
export ANTHROPIC_BASE_URL=${BASE}
export ANTHROPIC_API_KEY=sk-xxxxxxxx

claude
\`\`\`

## Gemini 原生协议

\`\`\`bash
export GEMINI_API_KEY=sk-xxxxxxxx

curl ${BASE}/v1beta/models/gemini-2.5-flash:generateContent \\
  -H "x-goog-api-key: $GEMINI_API_KEY" \\
  -d '{"contents":[{"parts":[{"text":"hello"}]}]}'
\`\`\`

## 流式响应（SSE）

所有 chat 端点支持 \`"stream": true\`，按 OpenAI SSE 协议返回 \`data: {chunk}\\n\\n\`。
`,
  },
  {
    id: 'integrations',
    title: '客户端接入',
    blurb: 'VSCode / Cursor / Claude Code / Cherry Studio 等 10+ 客户端',
    icon: Plug,
    category: 'reference',
    minutes: 5,
    body: `## 常见客户端配置

### Cherry Studio
设置 → AI 服务商 → 新建 OpenAI 兼容：
- API Key: \`sk-xxxxxxxx\`
- API Host: \`${BASE}\`

### Cursor
\`Cmd+Shift+P\` → \`Cursor Settings\` → \`Models\`：
- API Key: \`sk-xxxxxxxx\`
- Override OpenAI Base URL: \`${BASE}/v1\`

### VSCode（推荐 Cline 扩展 · 等同 Claude Code 体验）

VSCode 本身没有内置 AI 助手，需要装扩展。**最接近 Claude Code 体验的是 Cline**（原名 Claude Dev），免费开源、支持自定义 API。

**第 1 步：安装扩展**
1. 打开 VSCode → 左侧栏点扩展图标（或按 \`Ctrl+Shift+X\` / Mac \`Cmd+Shift+X\`）
2. 搜索 \`Cline\` → 点 Install
3. 装完后左侧栏会多一个机器人图标，点开

**第 2 步：配置 API**
1. 在 Cline 面板右上角点 ⚙ 齿轮（Settings）
2. \`API Provider\` 下拉选 **\`OpenAI Compatible\`**
3. 填两个字段：
   - **\`Base URL\`**: \`${BASE}/v1\`
   - **\`API Key\`**: \`sk-xxxxxxxx\`（从我们站后台的 API 密钥页复制）
4. \`Model ID\` 填想用的模型名，比如：
   - \`claude-sonnet-4-6\`（推荐日常）
   - \`claude-opus-4-7\`（最强推理 · 贵）
   - \`claude-haiku-4-5\`（最便宜快速）
   - \`gpt-5.4\` / \`gpt-5.5\` / \`deepseek-v4-pro\` 任选
5. 点 \`Done\` 保存

**第 3 步：开用**
- 在 Cline 输入框打需求（中英文都行），它会自动读你的项目代码、提议改动、执行命令。
- 改动前会弹窗让你确认（Approve / Reject），不会偷偷改文件。

**Roo Code（Cline 的进阶分叉）**
扩展商店搜 \`Roo Code\`，安装后配置完全一样（OpenAI Compatible + Base URL + Key + Model）。多了多模型协作、自定义模式等功能。

**Continue.dev（备选 · 适合纯补全场景）**
1. 装 \`Continue\` 扩展
2. 点左下角的设置图标 → \`Open Config File\`
3. 在 \`models\` 数组里加：
\`\`\`yaml
- name: My Claude
  provider: openai
  model: claude-sonnet-4-6
  apiBase: ${BASE}/v1
  apiKey: sk-xxxxxxxx
\`\`\`
4. 保存即生效，\`Ctrl+L\` / \`Cmd+L\` 唤起对话框。

---

### Claude Code CLI（Anthropic 官方）
\`\`\`bash
export ANTHROPIC_BASE_URL=${BASE}
export ANTHROPIC_API_KEY=sk-xxxxxxxx
claude
\`\`\`

### LobeChat
设置 → 语言模型 → OpenAI：
- API Key: \`sk-xxxxxxxx\`
- API 代理地址: \`${BASE}/v1\`

### Open WebUI / LibreChat
按 OpenAI Compatible 配置，base URL 设为 \`${BASE}/v1\`。

### LangChain / LiteLLM
\`\`\`python
from openai import OpenAI
client = OpenAI(api_key="sk-xxxx", base_url="${BASE}/v1")
\`\`\`
`,
  },
  {
    id: 'enterprise',
    title: '企业控制台',
    blurb: '多企业 · 工作组 · 三层硬/软限额',
    icon: Building2,
    category: 'operations',
    minutes: 4,
    body: `## 多租户企业管理

| 角色 | 权限 |
|---|---|
| **平台管理员** | 创建/删除任意企业，添加/移除任意用户，指派企业管理员 |
| **销售身份**（is_sales=true） | 仅能创建企业 |
| **企业管理员**（每企业 1 个） | 管理自己企业的成员、工作组、限额 |
| **企业成员** | 享受企业级额度、统一计费 |

## 工作组

每个企业里可以创建多个工作组（例：后端组、AI 实验组）。**一个员工只在一个工作组**。

## 三层限额规则

任一超额都会拦截请求：

| 作用范围 | 周期 | 维度 | 类型 |
|---|---|---|---|
| 企业总额 | 日/月/季/总 | quota 额度 | 硬限制 / 软告警 |
| 工作组 | 日/月/季/总 | quota 额度 | 硬限制 / 软告警 |
| 单个成员 | 日/月/季/总 | quota 额度 | 硬限制 / 软告警 |

- **硬限制** — 超额请求直接 403 拒绝
- **软告警** — 仅记录，请求继续放行
- 周期边界自动清零：日（UTC+8 零点）/ 月（1 号）/ 季（1、4、7、10 月 1 号）

进入 [企业管理](/enterprise-management) 页面操作。
`,
  },
  {
    id: 'errors',
    title: '错误码',
    blurb: '常见错误码 + 调试指引',
    icon: AlertTriangle,
    category: 'operations',
    minutes: 3,
    body: `## 常见错误码

| HTTP | message 关键词 | 原因 / 处置 |
|---|---|---|
| 401 | Invalid token / Unauthorized | API 密钥无效或已删除 → 去 [密钥管理](/keys) 检查 |
| 402 | You've used up your points | 上游账号点数耗尽（平台侧问题，会自动避让） |
| 403 | 用户额度不足 | 充值或开订阅 |
| 403 | 订阅额度不足或未配置订阅 | 该模型需要订阅计费，当前无活跃订阅 |
| 403 | 已达到企业/工作组额度上限 | 联系企业管理员调高限额 |
| 403 | 无可用 channel | 该模型在你所在分组无可用渠道 |
| 429 | rate limit | 请求过快或上游限流，几秒后重试 |
| 500 | upstream error | 上游故障，平台自动切换渠道重试 |
| 503 | service unavailable | 全局保护性返回（极少出现） |

## 调试

每次响应里都有 \`request_id\` 字段。把它发给客服或在 [用量日志](/usage-logs/common) 搜索，可以定位到那次请求与上游错误的完整链路。
`,
  },
  {
    id: 'support',
    title: '联系 & 反馈',
    blurb: '邮件、微信、公告',
    icon: MessageCircle,
    category: 'operations',
    minutes: 1,
    body: `## 反馈渠道

- **站内消息** — 进 [个人中心](/profile) 查看公告与系统通知
- **邮件** — \`noreply@zhuanzhuan.pw\`（自动通知发送邮箱，不会被读取回复）
- **客服微信** — 扫码加微信公众号 "靶机狂魔"

## 公告与变更

模型上下线、价格调整、维护时间会在站内公告 + 公众号同步推送。**建议绑定邮箱接收紧急通知**。

## 服务条款

- [用户协议](/user-agreement)
- [隐私政策](/privacy-policy)
`,
  },
]
