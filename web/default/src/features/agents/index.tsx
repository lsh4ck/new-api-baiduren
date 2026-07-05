import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import {
  Search,
  Star,
  Terminal,
  Cpu,
  Zap,
  Copy,
  Check,
  X,
  Sparkles,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { getAgents } from './api'
import { AGENT_CATEGORIES, FAVORITES_STORAGE_KEY } from './constants'
import { resolveAgentIcon } from './lib/icon'
import type { Agent } from './types'

function loadFavorites(): string[] {
  try {
    const raw = localStorage.getItem(FAVORITES_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

export function AgentMarketplace() {
  const navigate = useNavigate()
  const { copyToClipboard } = useCopyToClipboard()
  const [activeCat, setActiveCat] = useState<string>('全部')
  const [search, setSearch] = useState('')
  const [favorites, setFavorites] = useState<string[]>(() => loadFavorites())
  const [selected, setSelected] = useState<Agent | null>(null)
  const [mounted, setMounted] = useState(false)
  const [copiedPrompt, setCopiedPrompt] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 20)
    return () => clearTimeout(t)
  }, [])

  const { data: agents = [], isLoading } = useQuery({
    queryKey: ['agents-marketplace'],
    queryFn: getAgents,
  })

  const toggleFavorite = (id: string) => {
    setFavorites((prev) => {
      const next = prev.includes(id)
        ? prev.filter((x) => x !== id)
        : [...prev, id]
      localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }

  const tabs = useMemo(
    () => ['全部', ...AGENT_CATEGORIES, '收藏'],
    []
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return agents.filter((a) => {
      const catOk =
        activeCat === '全部'
          ? true
          : activeCat === '收藏'
            ? favorites.includes(a.id)
            : a.category === activeCat
      if (!catOk) return false
      if (!q) return true
      return (
        a.name.toLowerCase().includes(q) ||
        a.code.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q) ||
        a.tags.some((t) => t.toLowerCase().includes(q))
      )
    })
  }, [agents, activeCat, search, favorites])

  const handleUse = (agent: Agent) => {
    navigate({
      to: '/playground',
      search: {
        agentModel: agent.model,
        agentPrompt: agent.system_prompt,
        agentName: agent.name,
      },
    })
  }

  return (
    <div className='relative flex h-full min-h-0 flex-col overflow-hidden'>
      {/* ambient glow */}
      <div className='pointer-events-none absolute -top-32 left-1/4 h-72 w-72 rounded-full bg-emerald-500/10 blur-3xl' />
      <div className='pointer-events-none absolute -top-24 right-1/5 h-64 w-64 rounded-full bg-teal-400/10 blur-3xl' />

      {/* header */}
      <div className='relative border-b border-white/[0.06] px-6 py-5'>
        <div className='flex items-center gap-2.5'>
          <span className='flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-400/30 bg-emerald-400/10 text-emerald-300'>
            <Terminal className='h-4 w-4' />
          </span>
          <div>
            <h1 className='text-lg font-semibold tracking-tight text-foreground'>
              智能体超市
            </h1>
            <p className='font-mono text-[11px] text-foreground/40'>
              选一个智能体 · 带预设直连对话 · {agents.length} agents online
            </p>
          </div>
        </div>
      </div>

      {/* controls */}
      <div className='relative flex flex-col gap-3 px-6 pt-4'>
        <div className='relative max-w-md'>
          <Search className='pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/30' />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder='搜索智能体、代号或标签…'
            className='w-full rounded-lg border border-white/10 bg-white/[0.03] py-2 pl-9 pr-3 font-mono text-sm text-foreground placeholder:text-foreground/30 outline-none transition-colors focus:border-emerald-400/40 focus:bg-white/[0.05]'
          />
        </div>
        <div className='flex flex-wrap gap-1.5'>
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveCat(tab)}
              className={cn(
                'rounded-md border px-3 py-1.5 font-mono text-xs transition-all',
                activeCat === tab
                  ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300'
                  : 'border-white/[0.06] bg-transparent text-foreground/50 hover:border-white/15 hover:text-foreground/80'
              )}
            >
              {tab === '收藏' ? '★ 收藏' : tab}
            </button>
          ))}
        </div>
      </div>

      {/* grid */}
      <div className='relative min-h-0 flex-1 overflow-y-auto px-6 py-4'>
        {isLoading ? (
          <div className='flex h-40 items-center justify-center font-mono text-sm text-foreground/40'>
            <Cpu className='mr-2 h-4 w-4 animate-pulse' /> loading agents…
          </div>
        ) : filtered.length === 0 ? (
          <div className='flex h-40 items-center justify-center font-mono text-sm text-foreground/40'>
            没有匹配的智能体
          </div>
        ) : (
          <div className='grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3'>
            {filtered.map((agent, i) => {
              const Icon = resolveAgentIcon(agent.icon)
              const fav = favorites.includes(agent.id)
              const isSel = selected?.id === agent.id
              return (
                <button
                  key={agent.id}
                  onClick={() => setSelected(agent)}
                  style={{ transitionDelay: mounted ? `${Math.min(i * 40, 400)}ms` : '0ms' }}
                  className={cn(
                    'group relative flex flex-col rounded-xl border p-4 text-left transition-all duration-500',
                    mounted
                      ? 'translate-y-0 opacity-100'
                      : 'translate-y-2 opacity-0',
                    isSel
                      ? 'border-emerald-400/50 bg-emerald-400/[0.06]'
                      : 'border-white/[0.07] bg-white/[0.02] hover:-translate-y-0.5 hover:border-emerald-400/30 hover:bg-white/[0.04] hover:shadow-[0_0_30px_-8px_rgba(16,185,129,0.35)]'
                  )}
                >
                  <div className='flex items-start justify-between'>
                    <span className='flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-emerald-300 transition-colors group-hover:border-emerald-400/30 group-hover:bg-emerald-400/10'>
                      <Icon className='h-5 w-5' />
                    </span>
                    <span
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleFavorite(agent.id)
                      }}
                      className={cn(
                        'cursor-pointer rounded-md p-1 transition-colors',
                        fav
                          ? 'text-amber-300'
                          : 'text-foreground/25 hover:text-foreground/60'
                      )}
                    >
                      <Star className={cn('h-4 w-4', fav && 'fill-amber-300')} />
                    </span>
                  </div>
                  <div className='mt-3 flex items-center gap-2'>
                    <span className='font-mono text-[10px] tracking-wider text-emerald-400/70'>
                      {agent.code}
                    </span>
                    <span className='rounded border border-white/10 px-1.5 py-0.5 font-mono text-[10px] text-foreground/40'>
                      {agent.category}
                    </span>
                  </div>
                  <h3 className='mt-1 text-[15px] font-semibold text-foreground'>
                    {agent.name}
                  </h3>
                  <p className='mt-1 line-clamp-2 text-xs leading-relaxed text-foreground/50'>
                    {agent.description}
                  </p>
                  <div className='mt-3 flex flex-wrap gap-1'>
                    {agent.tags.slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className='rounded bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-foreground/45'
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* detail slide-out */}
      {selected && (
        <AgentDetailPanel
          agent={selected}
          fav={favorites.includes(selected.id)}
          onToggleFav={() => toggleFavorite(selected.id)}
          onClose={() => setSelected(null)}
          onUse={() => handleUse(selected)}
          copiedPrompt={copiedPrompt}
          onCopyPrompt={() => {
            copyToClipboard(selected.system_prompt)
            setCopiedPrompt(true)
            toast.success('已复制预设提示词')
            setTimeout(() => setCopiedPrompt(false), 1500)
          }}
        />
      )}
    </div>
  )
}

function AgentDetailPanel({
  agent,
  fav,
  onToggleFav,
  onClose,
  onUse,
  copiedPrompt,
  onCopyPrompt,
}: {
  agent: Agent
  fav: boolean
  onToggleFav: () => void
  onClose: () => void
  onUse: () => void
  copiedPrompt: boolean
  onCopyPrompt: () => void
}) {
  const Icon = resolveAgentIcon(agent.icon)
  return (
    <>
      <div
        className='fixed inset-0 z-40 bg-black/40 backdrop-blur-sm animate-in fade-in'
        onClick={onClose}
      />
      <div className='fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-white/10 bg-[#0b0d0f]/95 shadow-2xl backdrop-blur-xl animate-in slide-in-from-right duration-300'>
        {/* head */}
        <div className='flex items-start justify-between border-b border-white/[0.06] p-5'>
          <div className='flex items-start gap-3'>
            <span className='flex h-11 w-11 items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-400/10 text-emerald-300'>
              <Icon className='h-5 w-5' />
            </span>
            <div>
              <div className='flex items-center gap-2'>
                <span className='font-mono text-[10px] tracking-wider text-emerald-400/70'>
                  {agent.code}
                </span>
                <span className='rounded border border-white/10 px-1.5 py-0.5 font-mono text-[10px] text-foreground/40'>
                  {agent.category}
                </span>
              </div>
              <h2 className='mt-0.5 text-base font-semibold text-foreground'>
                {agent.name}
              </h2>
            </div>
          </div>
          <div className='flex items-center gap-1'>
            <button
              onClick={onToggleFav}
              className={cn(
                'rounded-md p-1.5 transition-colors',
                fav ? 'text-amber-300' : 'text-foreground/30 hover:text-foreground/70'
              )}
            >
              <Star className={cn('h-4 w-4', fav && 'fill-amber-300')} />
            </button>
            <button
              onClick={onClose}
              className='rounded-md p-1.5 text-foreground/40 transition-colors hover:text-foreground/80'
            >
              <X className='h-4 w-4' />
            </button>
          </div>
        </div>

        {/* body */}
        <div className='min-h-0 flex-1 space-y-5 overflow-y-auto p-5'>
          <p className='text-sm leading-relaxed text-foreground/70'>
            {agent.description}
          </p>

          <div className='flex flex-wrap gap-1.5'>
            {agent.tags.map((tag) => (
              <span
                key={tag}
                className='rounded-md bg-white/[0.04] px-2 py-0.5 text-xs text-foreground/50'
              >
                {tag}
              </span>
            ))}
          </div>

          <div className='grid grid-cols-2 gap-3'>
            <div className='rounded-lg border border-white/[0.06] bg-white/[0.02] p-3'>
              <div className='flex items-center gap-1.5 text-[11px] text-foreground/40'>
                <Cpu className='h-3.5 w-3.5' /> 模型
              </div>
              <div className='mt-1 truncate font-mono text-xs text-emerald-300'>
                {agent.model}
              </div>
            </div>
            <div className='rounded-lg border border-white/[0.06] bg-white/[0.02] p-3'>
              <div className='flex items-center gap-1.5 text-[11px] text-foreground/40'>
                <Zap className='h-3.5 w-3.5' /> 分组
              </div>
              <div className='mt-1 truncate font-mono text-xs text-foreground/70'>
                {agent.group || '自动分组'}
              </div>
            </div>
          </div>

          {agent.tips && agent.tips.length > 0 && (
            <div className='rounded-lg border border-emerald-400/15 bg-emerald-400/[0.04] p-3.5'>
              <div className='flex items-center gap-1.5 text-xs font-medium text-emerald-300'>
                <Sparkles className='h-3.5 w-3.5' /> 怎么用效果更好
              </div>
              <ul className='mt-2 space-y-1.5'>
                {agent.tips.map((tip, i) => (
                  <li
                    key={i}
                    className='flex gap-2 text-xs leading-relaxed text-foreground/60'
                  >
                    <span className='text-emerald-400/60'>·</span>
                    {tip}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <div className='mb-1.5 flex items-center justify-between'>
              <span className='font-mono text-[11px] text-foreground/40'>
                system_prompt
              </span>
              <button
                onClick={onCopyPrompt}
                className='flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-foreground/40 transition-colors hover:text-foreground/70'
              >
                {copiedPrompt ? (
                  <Check className='h-3 w-3 text-emerald-400' />
                ) : (
                  <Copy className='h-3 w-3' />
                )}
                {copiedPrompt ? '已复制' : '复制'}
              </button>
            </div>
            <pre className='max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg border border-white/[0.06] bg-black/30 p-3 font-mono text-[11px] leading-relaxed text-foreground/55'>
              {agent.system_prompt}
            </pre>
          </div>
        </div>

        {/* footer */}
        <div className='border-t border-white/[0.06] p-4'>
          <button
            onClick={onUse}
            className='flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 py-2.5 text-sm font-semibold text-black transition-opacity hover:opacity-90'
          >
            <Terminal className='h-4 w-4' /> 立即使用
          </button>
        </div>
      </div>
    </>
  )
}
