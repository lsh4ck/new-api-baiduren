// 摆渡人 · https://apiai.xin —— 后台「智能管理」AI copilot 前端(移动端友好)。
import { useEffect, useRef, useState } from 'react'
import { Send, Loader2, Settings2, Bot, User as UserIcon, Database } from 'lucide-react'
import { api } from '@/lib/api'

type Msg = { role: 'user' | 'assistant'; content: string; tools?: string[] }

const SUGGESTIONS = [
  '今天到现在总消费和总充值各是多少？',
  '今天消费最高的前 5 个用户是谁，各多少钱？',
  '现在有多少启用中的渠道？按分组统计',
  '最近 24 小时有多少错误请求，主要是哪些渠道？',
]

export function SmartAdmin() {
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [showCfg, setShowCfg] = useState(false)
  const [cfg, setCfg] = useState({ SmartAdminKey: '', SmartAdminBaseUrl: '', SmartAdminModel: 'claude-sonnet-4-6' })
  const [savingCfg, setSavingCfg] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const send = async (text: string) => {
    const q = text.trim()
    if (!q || loading) return
    const next = [...messages, { role: 'user' as const, content: q }]
    setMessages(next)
    setInput('')
    setLoading(true)
    try {
      const res = await api.post(
        '/api/smart-admin/chat',
        { messages: next.map((m) => ({ role: m.role, content: m.content })) },
        { skipErrorHandler: true } as Record<string, unknown>
      )
      const d = res.data
      if (d?.success) {
        setMessages([
          ...next,
          { role: 'assistant', content: d.reply || '(无内容)', tools: d.tool_calls },
        ])
      } else {
        setMessages([...next, { role: 'assistant', content: '⚠️ ' + (d?.message || '出错了') }])
      }
    } catch (e) {
      setMessages([...next, { role: 'assistant', content: '⚠️ 请求失败：' + String(e) }])
    } finally {
      setLoading(false)
    }
  }

  const saveCfg = async () => {
    setSavingCfg(true)
    try {
      for (const [k, v] of Object.entries(cfg)) {
        if (v !== '')
          await api.put(
            '/api/option/',
            { key: k, value: v },
            { skipErrorHandler: true } as Record<string, unknown>
          )
      }
      setShowCfg(false)
    } finally {
      setSavingCfg(false)
    }
  }

  return (
    <div className='mx-auto flex h-full max-w-3xl flex-col'>
      {/* header */}
      <div className='flex items-center justify-between border-b border-border px-4 py-3'>
        <div className='flex items-center gap-2'>
          <span className='flex size-8 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-500'>
            <Bot className='size-5' />
          </span>
          <div>
            <div className='text-sm font-semibold'>智能管理</div>
            <div className='text-[11px] text-muted-foreground'>用自然语言查账单 / 分组 / 渠道，Claude 直接算给你</div>
          </div>
        </div>
        <button
          onClick={() => setShowCfg((s) => !s)}
          className='rounded-md p-2 text-muted-foreground hover:bg-muted'
          title='配置 Claude key'
        >
          <Settings2 className='size-4' />
        </button>
      </div>

      {/* config */}
      {showCfg && (
        <div className='space-y-2 border-b border-border bg-muted/30 px-4 py-3 text-xs'>
          <p className='text-muted-foreground'>用你自己开的 Claude key（一个有 claude 权限的令牌即可）。</p>
          <input
            className='w-full rounded-md border border-border bg-background px-2.5 py-1.5'
            placeholder='SmartAdminKey (sk-...)'
            value={cfg.SmartAdminKey}
            onChange={(e) => setCfg({ ...cfg, SmartAdminKey: e.target.value })}
          />
          <div className='flex gap-2'>
            <input
              className='flex-1 rounded-md border border-border bg-background px-2.5 py-1.5'
              placeholder='Base URL(默认 https://apiai.xin/v1)'
              value={cfg.SmartAdminBaseUrl}
              onChange={(e) => setCfg({ ...cfg, SmartAdminBaseUrl: e.target.value })}
            />
            <input
              className='w-40 rounded-md border border-border bg-background px-2.5 py-1.5'
              placeholder='模型'
              value={cfg.SmartAdminModel}
              onChange={(e) => setCfg({ ...cfg, SmartAdminModel: e.target.value })}
            />
          </div>
          <button
            onClick={saveCfg}
            disabled={savingCfg}
            className='rounded-md bg-emerald-500 px-3 py-1.5 font-medium text-white hover:bg-emerald-600 disabled:opacity-50'
          >
            {savingCfg ? '保存中…' : '保存配置'}
          </button>
        </div>
      )}

      {/* messages */}
      <div className='flex-1 space-y-4 overflow-y-auto px-4 py-4'>
        {messages.length === 0 && (
          <div className='mt-6 space-y-3'>
            <p className='text-center text-sm text-muted-foreground'>问点什么，比如：</p>
            <div className='grid gap-2'>
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className='rounded-lg border border-border bg-card px-3 py-2.5 text-left text-[13px] hover:border-emerald-500/40 hover:bg-emerald-500/5'
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex gap-2.5 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <span
              className={`flex size-7 shrink-0 items-center justify-center rounded-full ${
                m.role === 'user' ? 'bg-sky-500/15 text-sky-500' : 'bg-emerald-500/15 text-emerald-500'
              }`}
            >
              {m.role === 'user' ? <UserIcon className='size-4' /> : <Bot className='size-4' />}
            </span>
            <div
              className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-relaxed whitespace-pre-wrap ${
                m.role === 'user' ? 'bg-sky-500 text-white' : 'bg-muted'
              }`}
            >
              {m.content}
              {m.tools && m.tools.length > 0 && (
                <details className='mt-2 text-[11px] opacity-70'>
                  <summary className='flex cursor-pointer items-center gap-1'>
                    <Database className='size-3' /> 查询了 {m.tools.length} 条 SQL
                  </summary>
                  <div className='mt-1 space-y-1'>
                    {m.tools.map((t, j) => (
                      <pre key={j} className='overflow-x-auto rounded bg-background/50 p-1.5 font-mono'>
                        {t}
                      </pre>
                    ))}
                  </div>
                </details>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className='flex gap-2.5'>
            <span className='flex size-7 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-500'>
              <Bot className='size-4' />
            </span>
            <div className='flex items-center gap-2 rounded-2xl bg-muted px-3.5 py-2.5 text-[13px] text-muted-foreground'>
              <Loader2 className='size-3.5 animate-spin' /> 查数据、算账中…
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* input */}
      <div className='border-t border-border p-3'>
        <div className='flex items-end gap-2'>
          <textarea
            className='max-h-32 min-h-[42px] flex-1 resize-none rounded-xl border border-border bg-background px-3.5 py-2.5 text-[14px] outline-none focus:border-emerald-500/50'
            placeholder='问问今天的账、分组、渠道…（Enter 发送）'
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send(input)
              }
            }}
          />
          <button
            onClick={() => send(input)}
            disabled={loading || !input.trim()}
            className='flex size-[42px] shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-40'
          >
            <Send className='size-4' />
          </button>
        </div>
      </div>
    </div>
  )
}
