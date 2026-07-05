/**
 * 平台更新日志页面 · /changelog
 * 公开页面，无需登录
 */
import { Sparkles, Zap, ShieldCheck, Database, Crown, TrendingUp, Rocket, Wrench } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { PublicLayout } from '@/components/layout'

interface ChangelogEntry {
  date: string
  version?: string
  title: string
  type: 'feature' | 'improvement' | 'fix' | 'breaking'
  icon: typeof Sparkles
  items: string[]
  highlight?: boolean
}

const ENTRIES: ChangelogEntry[] = [
  {
    date: '2026-05-28',
    version: 'v2.11',
    title: '国产全模型分组 + GPT-5.x Codex 全系上线 + 计费稳定性升级',
    type: 'feature',
    icon: Sparkles,
    highlight: true,
    items: [
      '🇨🇳 新增「国产全模型」分组：DeepSeek-V4-Pro/Flash、Qwen3-Max/3.5-Plus/3-Coder、GLM-4.7/5/5.1、MiniMax-M2.5/M2.7、Kimi-K2.5/K2.6、混元 T1/TurboS、MiMo-V2.5 等 23+ 国产模型，按官网 6 折计费',
      '🚀 GPT-5.x Codex 全系：gpt-5.2 / gpt-5.3-codex(含 spark) / gpt-5.4(含 mini) / gpt-5.5 实时可调',
      '💰 余额不足提示优化：触发即返 HTTP 402 + 明确"账户额度不足请充值"，不再被通用 500 吞掉；客户端 agent 可正确处理',
      '🔁 上游超时自动级联：网关 504/524 类超时现在自动切到下一档渠道兜底，告别"卡死在一条慢上游"',
      '💱 充值页统一实时汇率：移除旧的"固定 ¥7"折算显示，所有充值金额按中国银行实时美金牌价（每小时刷新）',
      '🏠 首页改版：主标题改为「多档渠道，任君选择」——更直观展示价位档（特价/中端/企业）和密钥灵活搭配',
    ],
  },
  {
    date: '2026-05-13',
    version: 'v2.10',
    title: '订阅套餐 + 智能优化全面升级',
    type: 'feature',
    icon: Crown,
    highlight: true,
    items: [
      '🎯 上线 14 个订阅套餐：入门日卡 / Claude Code / GPT / 全家桶 / 企业季卡，包月省 70%',
      '🛡 SmartRelay 4 层智能优化：响应缓存 + 上下文压缩 + 上游缓存优化 + 工具响应截断',
      '💱 美金汇率自动每小时拉中国银行牌价（购汇价），告别陈旧汇率',
      '🚀 首页大改版：新增 SmartRelay 节省展示 / 订阅套餐推广 / 实时汇率呼吸卡',
    ],
  },
  {
    date: '2026-05-12',
    version: 'v2.8',
    title: '组内自动熔断 + Anthropic 原生支持',
    type: 'feature',
    icon: ShieldCheck,
    items: [
      '🔁 组内秒级失败切换：单次请求失败立即 retry 同组其他渠道（≤ 3 次）',
      '⚠️ 连续失败的渠道自动禁用，每 3 小时探测一次恢复',
      '🔌 Anthropic 原生 /v1/messages 接口完整支持，Claude Code / Cursor 即插即用',
      '🎨 API 密钥分组下拉去掉 auto 熔断选项（系统级开关已关）',
    ],
  },
  {
    date: '2026-05-11',
    version: 'v2.7',
    title: '隐藏推荐痕迹 + QR 码 + 销售加价模式',
    type: 'feature',
    icon: Sparkles,
    items: [
      '👁 推荐链接支持「隐藏推广痕迹」：/g/<code> 干净短链替代 ?aff= 暴露参数',
      '📱 QR 码生成 + PNG 下载，方便地推',
      '💼 销售加价模式：销售方在用户管理里给客户单独设倍率，按倍率结算',
    ],
  },
  {
    date: '2026-05-09',
    version: 'v2.5',
    title: '企业控制台 + 工作组三级限额',
    type: 'feature',
    icon: Crown,
    items: [
      '🏢 企业租户系统：企业 / 工作组 / 成员 三级架构',
      '💵 三层限额：每日 / 每月 / 每季 / 总额 × 企业 / 工作组 / 个人维度',
      '👥 企业成员批量导入（搜索 / 粘贴 / CSV / 导出）',
      '📋 企业管理员独立后台，看自家用量和限额',
    ],
  },
  {
    date: '2026-05-08',
    version: 'v2.4',
    title: '用户用量分析 + 自助订单管理',
    type: 'improvement',
    icon: TrendingUp,
    items: [
      '📊 用户管理新增「用量分析」：按 token / 模型 / 时间维度看每个用户消耗',
      '🧾 用户钱包页支持自助查看充值记录、获取发票（支持的支付通道）',
      '🛒 订单可自助删除（针对未完成的订单）',
    ],
  },
  {
    date: '2026-05-07',
    version: 'v2.3',
    title: '响应缓存 + 上下文压缩算法',
    type: 'feature',
    icon: Rocket,
    items: [
      '⚡ SmartRelay 智能加速服务上线：缓存命中毫秒级返回、命中不重复计费',
      '🧠 4 层智能优化：响应缓存 / 上下文压缩 / 上游缓存优化 / 工具响应截断',
      '📈 平均节省 30-50% token（依场景）',
    ],
  },
  {
    date: '2026-05-05',
    version: 'v2.2',
    title: '修复 GitHub OAuth + SMTP TLS',
    type: 'fix',
    icon: Wrench,
    items: [
      '🔧 修复 GitHub OAuth secret 配置导致的登录失败',
      '🔧 修复 SMTP 邮件发送的 TLS 证书校验问题',
      '🔧 修复 logs_pkey 序列冲突',
      '🔧 修复 smart-relay 服务 DNS 解析异常',
    ],
  },
  {
    date: '2026-05-03',
    version: 'v2.1',
    title: '初次部署 · 平台正式上线',
    type: 'feature',
    icon: Sparkles,
    items: [
      '🚀 摆渡人 apiai.xin 正式上线',
      '🎨 全新前端：React 19 + Rsbuild + Tailwind + Base UI',
      '🔑 多种登录方式：邮箱 / GitHub / 微信 / Passkey',
      '💎 30+ 上游模型聚合，统一计费',
    ],
  },
]

const TYPE_STYLES = {
  feature: 'border-emerald-500/30 bg-emerald-500/5',
  improvement: 'border-sky-500/30 bg-sky-500/5',
  fix: 'border-amber-500/30 bg-amber-500/5',
  breaking: 'border-rose-500/30 bg-rose-500/5',
}

const TYPE_LABELS = {
  feature: '🆕 新功能',
  improvement: '✨ 优化',
  fix: '🔧 修复',
  breaking: '⚠️ 破坏变更',
}

export function ChangelogPage() {
  return (
    <PublicLayout>
      <div className='mx-auto max-w-4xl px-4 py-12 sm:py-20'>
        <header className='mb-12 text-center'>
          <div className='glass-btn glass-shimmer mb-4 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-medium'>
            <Sparkles className='size-3.5 text-amber-500' />
            平台更新日志
          </div>
          <h1 className='text-[clamp(2rem,5vw,3.5rem)] font-bold leading-tight tracking-tight'>
            <span className='bg-gradient-to-r from-foreground to-foreground/60 bg-clip-text text-transparent'>
              我们一直在进步
            </span>
          </h1>
          <p className='mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-foreground/55'>
            每一次更新都是为了让你的体验更好、价格更低、稳定性更强
          </p>
        </header>

        <div className='space-y-6'>
          {ENTRIES.map((entry, idx) => {
            const Icon = entry.icon
            return (
              <article
                key={idx}
                className={`relative rounded-2xl border p-5 sm:p-6 ${TYPE_STYLES[entry.type]} ${
                  entry.highlight ? 'ring-2 ring-emerald-500/30' : ''
                }`}
              >
                <div className='mb-3 flex flex-wrap items-center gap-2'>
                  <div className='flex size-9 items-center justify-center rounded-lg bg-foreground/5'>
                    <Icon className='size-5 text-foreground/70' />
                  </div>
                  <div className='min-w-0 flex-1'>
                    <div className='flex flex-wrap items-baseline gap-2'>
                      <h2 className='text-base font-bold sm:text-lg'>
                        {entry.title}
                      </h2>
                      {entry.version && (
                        <span className='rounded bg-foreground/8 px-1.5 py-0.5 font-mono text-[11px] font-semibold'>
                          {entry.version}
                        </span>
                      )}
                    </div>
                    <div className='mt-0.5 flex items-center gap-2 text-[11px] text-foreground/45'>
                      <time>{entry.date}</time>
                      <span>·</span>
                      <span>{TYPE_LABELS[entry.type]}</span>
                    </div>
                  </div>
                </div>
                <ul className='space-y-1.5 pl-1 text-[13.5px] leading-relaxed text-foreground/75'>
                  {entry.items.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </article>
            )
          })}
        </div>

        <div className='mt-12 rounded-2xl border bg-gradient-to-br from-indigo-500/8 to-violet-500/4 p-6 text-center sm:p-8'>
          <h3 className='text-base font-bold sm:text-lg'>有功能建议？</h3>
          <p className='mt-2 text-sm text-foreground/55'>
            我们会认真考虑每一条反馈
          </p>
          <Link
            to='/feedback'
            className='mt-4 inline-flex items-center gap-1.5 rounded-xl bg-foreground px-5 py-2 text-sm font-semibold text-background hover:opacity-90 transition-opacity'
          >
            提交反馈
          </Link>
        </div>
      </div>
    </PublicLayout>
  )
}
