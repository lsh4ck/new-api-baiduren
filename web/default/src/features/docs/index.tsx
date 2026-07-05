import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Clock,
  ListTree,
  Search,
  Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { PublicLayout } from '@/components/layout'
import { DOC_SECTIONS, CATEGORY_META, type DocSection } from './content'
import { DocMarkdown, extractToc } from './doc-markdown'

const FIRST = DOC_SECTIONS[0]?.id ?? ''

export function DocsPage() {
  const [active, setActive] = useState<string>(FIRST)
  const [query, setQuery] = useState('')
  const contentRef = useRef<HTMLDivElement | null>(null)

  // Hash sync
  useEffect(() => {
    const sync = () => {
      const hash = window.location.hash.replace(/^#/, '')
      const sectionId = hash.split('/')[0]
      if (sectionId && DOC_SECTIONS.some((s) => s.id === sectionId)) {
        setActive(sectionId)
      }
    }
    sync()
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])

  const section = useMemo<DocSection>(
    () => DOC_SECTIONS.find((s) => s.id === active) ?? DOC_SECTIONS[0],
    [active]
  )

  const idx = DOC_SECTIONS.findIndex((s) => s.id === active)
  const prev = idx > 0 ? DOC_SECTIONS[idx - 1] : null
  const next = idx >= 0 && idx < DOC_SECTIONS.length - 1 ? DOC_SECTIONS[idx + 1] : null

  const toc = useMemo(() => extractToc(section.body), [section.body])

  const filtered = useMemo(() => {
    if (!query.trim()) return DOC_SECTIONS
    const q = query.toLowerCase()
    return DOC_SECTIONS.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.blurb.toLowerCase().includes(q) ||
        s.body.toLowerCase().includes(q)
    )
  }, [query])

  const goTo = (id: string) => {
    setActive(id)
    window.location.hash = id
    contentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // 按 category 分组的侧栏
  const grouped = useMemo(() => {
    const out: Record<string, DocSection[]> = {}
    for (const s of filtered) {
      if (!out[s.category]) out[s.category] = []
      out[s.category].push(s)
    }
    return out
  }, [filtered])

  return (
    <PublicLayout>
      {/* Hero */}
      <section className='relative overflow-hidden border-b'>
        <div
          aria-hidden
          className='pointer-events-none absolute inset-0 -z-10 overflow-hidden'
        >
          <div className='absolute -top-24 left-[10%] h-[42vw] w-[42vw] max-h-[520px] max-w-[520px] rounded-full bg-indigo-500/[0.18] blur-3xl dark:bg-indigo-500/[0.10]' />
          <div className='absolute top-[10%] right-[5%] h-[36vw] w-[36vw] max-h-[420px] max-w-[420px] rounded-full bg-fuchsia-500/[0.15] blur-3xl dark:bg-fuchsia-500/[0.08]' />
          <div className='absolute inset-0 bg-[radial-gradient(rgba(0,0,0,0.045)_1px,transparent_1px)] dark:bg-[radial-gradient(rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:32px_32px] [mask-image:radial-gradient(ellipse_80%_60%_at_50%_30%,black,transparent)]' />
        </div>
        <div className='mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8'>
          <div className='flex flex-col items-start gap-4'>
            <div className='inline-flex items-center gap-2 rounded-full border bg-background/70 px-3 py-1 text-[11px] font-medium text-foreground/70 backdrop-blur'>
              <Sparkles className='size-3 text-indigo-500' />
              摆渡人 · 接入文档
            </div>
            <h1 className='text-[clamp(1.9rem,3.6vw,2.8rem)] font-bold leading-tight tracking-tight text-foreground'>
              一份让你 10 分钟跑通的{' '}
              <span className='bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-orange-500 bg-clip-text text-transparent'>
                完整接入文档
              </span>
            </h1>
            <p className='max-w-2xl text-[15px] text-foreground/55'>
              500+ 模型 · OpenAI / Anthropic / Gemini 三套原生协议 · 自研 SmartRelay 优化层
              · 企业级限额管控
            </p>
            <div className='mt-2 flex flex-wrap gap-2'>
              <Button onClick={() => goTo('quick-start')}>
                快速上手 <ArrowRight className='ml-1 size-4' />
              </Button>
              <Button variant='outline' onClick={() => goTo('api-reference')}>
                查看 API 参考
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Body：三栏布局 */}
      <div className='mx-auto flex max-w-7xl gap-8 px-4 py-8 sm:px-6 lg:gap-10 lg:px-8'>
        {/* 左：章节导航 */}
        <aside className='hidden w-60 shrink-0 lg:block'>
          <div className='sticky top-24 space-y-4'>
            <div className='relative'>
              <Search className='absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground' />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder='搜索章节...'
                className='w-full rounded-md border bg-background py-1.5 pl-8 pr-2 text-sm placeholder:text-muted-foreground/70 focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/20'
              />
            </div>

            {Object.entries(grouped).map(([cat, items]) => {
              const meta = CATEGORY_META[cat as keyof typeof CATEGORY_META]
              return (
                <div key={cat}>
                  <div className='mb-1.5 flex items-center gap-2 px-1.5'>
                    <span className='text-[10px] font-bold uppercase tracking-[0.12em] text-foreground/70'>
                      {meta?.label || cat}
                    </span>
                    <span className='text-[10px] text-muted-foreground/60'>
                      {meta?.description}
                    </span>
                  </div>
                  <nav className='space-y-0.5'>
                    {items.map((s) => {
                      const isActive = s.id === active
                      const Icon = s.icon
                      const num = DOC_SECTIONS.indexOf(s) + 1
                      return (
                        <button
                          key={s.id}
                          onClick={() => goTo(s.id)}
                          className={cn(
                            'group flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[13px] transition-colors',
                            isActive
                              ? 'bg-gradient-to-r from-indigo-500/10 to-fuchsia-500/5 font-semibold text-foreground'
                              : 'text-foreground/70 hover:bg-muted/60 hover:text-foreground'
                          )}
                        >
                          <div
                            className={cn(
                              'flex size-6 shrink-0 items-center justify-center rounded-md border text-[10px] font-bold',
                              isActive
                                ? 'border-transparent bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white'
                                : 'border-border/60 bg-background text-muted-foreground'
                            )}
                          >
                            {String(num).padStart(2, '0')}
                          </div>
                          <Icon
                            className={cn(
                              'size-3.5 shrink-0',
                              isActive
                                ? 'text-indigo-500'
                                : 'text-muted-foreground/70'
                            )}
                          />
                          <span className='truncate'>{s.title}</span>
                        </button>
                      )
                    })}
                  </nav>
                </div>
              )
            })}

            {filtered.length === 0 && (
              <div className='rounded-lg border border-dashed bg-muted/20 p-4 text-center text-xs text-muted-foreground'>
                没有匹配的章节
              </div>
            )}
          </div>
        </aside>

        {/* 中：内容 */}
        <main ref={contentRef} className='min-w-0 flex-1'>
          {/* 移动端章节选择器 */}
          <div className='mb-6 flex items-center gap-2 lg:hidden'>
            <select
              className='w-full rounded-md border bg-background px-3 py-2 text-sm'
              value={active}
              onChange={(e) => goTo(e.target.value)}
            >
              {DOC_SECTIONS.map((s, i) => (
                <option key={s.id} value={s.id}>
                  {String(i + 1).padStart(2, '0')} · {s.title}
                </option>
              ))}
            </select>
          </div>

          {/* 章节头 */}
          <div className='mb-6 rounded-2xl border bg-gradient-to-br from-background to-muted/20 p-6 sm:p-7'>
            <div className='flex items-start gap-4'>
              <div className='flex size-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white shadow-md shadow-indigo-500/25'>
                <section.icon className='size-6' />
              </div>
              <div className='min-w-0 flex-1'>
                <div className='mb-1.5 flex items-center gap-2 text-[11px] font-medium text-muted-foreground'>
                  <span>
                    第 {String(idx + 1).padStart(2, '0')} / {String(DOC_SECTIONS.length).padStart(2, '0')} 节
                  </span>
                  <span aria-hidden>·</span>
                  <Clock className='size-3' />
                  <span>{section.minutes} 分钟阅读</span>
                </div>
                <h1 className='text-2xl font-bold tracking-tight sm:text-3xl'>
                  {section.title}
                </h1>
                <p className='text-muted-foreground mt-1.5 text-[14px]'>
                  {section.blurb}
                </p>
              </div>
            </div>
          </div>

          {/* 正文 */}
          <DocMarkdown>{section.body}</DocMarkdown>

          {/* 上一节/下一节 */}
          <div className='mt-12 grid gap-3 border-t pt-6 sm:grid-cols-2'>
            {prev ? (
              <button
                onClick={() => goTo(prev.id)}
                className='group flex flex-col items-start gap-1 rounded-xl border bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-muted/40'
              >
                <span className='inline-flex items-center gap-1 text-[11px] text-muted-foreground'>
                  <ArrowLeft className='size-3' /> 上一节
                </span>
                <span className='font-semibold'>{prev.title}</span>
                <span className='text-muted-foreground line-clamp-1 text-xs'>
                  {prev.blurb}
                </span>
              </button>
            ) : (
              <div />
            )}
            {next ? (
              <button
                onClick={() => goTo(next.id)}
                className='group flex flex-col items-end gap-1 rounded-xl border bg-card p-4 text-right transition-colors hover:border-primary/40 hover:bg-muted/40 sm:items-end'
              >
                <span className='inline-flex items-center gap-1 text-[11px] text-muted-foreground'>
                  下一节 <ArrowRight className='size-3' />
                </span>
                <span className='font-semibold'>{next.title}</span>
                <span className='text-muted-foreground line-clamp-1 text-xs'>
                  {next.blurb}
                </span>
              </button>
            ) : (
              <div />
            )}
          </div>
        </main>

        {/* 右：章内 TOC（大屏） */}
        <aside className='hidden w-52 shrink-0 xl:block'>
          <div className='sticky top-24 space-y-3'>
            <div className='flex items-center gap-2 px-1 text-[10px] font-bold uppercase tracking-[0.12em] text-foreground/70'>
              <ListTree className='size-3' />
              本节目录
            </div>
            {toc.length === 0 ? (
              <p className='text-muted-foreground/70 px-1 text-xs'>无子章节</p>
            ) : (
              <ul className='space-y-1 border-l border-border/60 pl-3 text-[13px]'>
                {toc.map((t) => (
                  <li key={t.id}>
                    <a
                      href={`#${t.id}`}
                      className='block py-1 text-foreground/70 transition-colors hover:text-foreground'
                    >
                      {t.title}
                    </a>
                  </li>
                ))}
              </ul>
            )}
            <div className='rounded-lg border bg-gradient-to-br from-indigo-500/5 to-fuchsia-500/5 p-3 text-xs'>
              <div className='mb-1 flex items-center gap-1.5 font-semibold'>
                <BookOpen className='size-3.5 text-indigo-500' />
                提示
              </div>
              <p className='text-muted-foreground leading-relaxed'>
                文档随平台更新。把页面收藏，每次接入新模型前先翻一遍。
              </p>
            </div>
          </div>
        </aside>
      </div>
    </PublicLayout>
  )
}

// 修正 — 移除占位符 i_，简化逻辑
