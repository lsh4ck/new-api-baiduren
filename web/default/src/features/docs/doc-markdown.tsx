import { useState, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Link as RouterLink } from '@tanstack/react-router'
import { Check, Copy, Link2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DocMarkdownProps {
  children: string
  className?: string
}

function slugify(s: string): string {
  return String(s || '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w一-鿿-]/g, '')
}

function getText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(getText).join('')
  // @ts-expect-error 兼容 react children
  if (node && typeof node === 'object' && 'props' in node)
    // @ts-expect-error
    return getText(node.props.children)
  return ''
}

function CodeBlock({
  className,
  children,
}: {
  className?: string
  children?: ReactNode
}) {
  const [copied, setCopied] = useState(false)
  const lang = className?.replace(/^language-/, '') || ''
  const code = getText(children).replace(/\n$/, '')

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      // ignore
    }
  }

  return (
    <div className='group relative my-5 overflow-hidden rounded-xl border bg-zinc-950 text-zinc-50 shadow-sm dark:border-zinc-800'>
      <div className='flex items-center justify-between border-b border-zinc-800 bg-zinc-900/80 px-3 py-1.5'>
        <span className='font-mono text-[11px] uppercase tracking-wider text-zinc-400'>
          {lang || 'shell'}
        </span>
        <button
          type='button'
          onClick={handleCopy}
          className='flex items-center gap-1 rounded px-2 py-1 text-[11px] text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-zinc-50'
        >
          {copied ? (
            <>
              <Check className='size-3' /> 已复制
            </>
          ) : (
            <>
              <Copy className='size-3' /> 复制
            </>
          )}
        </button>
      </div>
      <pre className='m-0 overflow-x-auto p-4 font-mono text-[13px] leading-relaxed'>
        <code className={className}>{code}</code>
      </pre>
    </div>
  )
}

function HeadingAnchor({
  level,
  children,
}: {
  level: 2 | 3
  children?: ReactNode
}) {
  const text = getText(children)
  const id = slugify(text)
  const Tag = (`h${level}` as unknown) as 'h2' | 'h3'
  return (
    <Tag
      id={id}
      className={cn(
        'group/heading scroll-mt-24 font-semibold tracking-tight',
        level === 2
          ? 'mt-10 mb-3 flex items-center gap-2 border-b pb-2 text-xl'
          : 'mt-6 mb-2 flex items-center gap-2 text-lg'
      )}
    >
      {level === 2 && (
        <span
          aria-hidden
          className='h-5 w-1 rounded-full bg-gradient-to-b from-indigo-500 to-fuchsia-500'
        />
      )}
      <span>{children}</span>
      <a
        href={`#${id}`}
        aria-label='Anchor link'
        className='text-muted-foreground/40 opacity-0 transition-opacity hover:text-foreground group-hover/heading:opacity-100'
        onClick={(e) => {
          e.preventDefault()
          const url = new URL(window.location.href)
          url.hash = id
          window.history.replaceState(null, '', url.toString())
          navigator.clipboard?.writeText(url.toString()).catch(() => {})
        }}
      >
        <Link2 className='size-4' />
      </a>
    </Tag>
  )
}

export function DocMarkdown({ children, className }: DocMarkdownProps) {
  return (
    <div
      className={cn(
        'doc-markdown max-w-none text-[15px] leading-relaxed text-foreground/90',
        className
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className='mb-3 text-3xl font-bold tracking-tight'>
              {children}
            </h1>
          ),
          h2: ({ children }) => <HeadingAnchor level={2}>{children}</HeadingAnchor>,
          h3: ({ children }) => <HeadingAnchor level={3}>{children}</HeadingAnchor>,
          p: ({ children }) => (
            <p className='my-3 leading-7 text-foreground/80'>{children}</p>
          ),
          ul: ({ children }) => (
            <ul className='my-3 ml-5 list-disc space-y-1.5 marker:text-muted-foreground'>
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className='my-3 ml-5 list-decimal space-y-1.5 marker:font-semibold marker:text-indigo-500'>
              {children}
            </ol>
          ),
          li: ({ children }) => <li className='pl-1'>{children}</li>,
          a: ({ href, children }) => {
            const isInternal = href && href.startsWith('/')
            if (isInternal) {
              return (
                <RouterLink
                  to={href!}
                  className='font-medium text-primary underline decoration-primary/40 underline-offset-4 hover:decoration-primary'
                >
                  {children}
                </RouterLink>
              )
            }
            return (
              <a
                href={href}
                target='_blank'
                rel='noopener noreferrer'
                className='font-medium text-primary underline decoration-primary/40 underline-offset-4 hover:decoration-primary'
              >
                {children}
              </a>
            )
          },
          code: ({ className, children, ...props }: {
            className?: string
            children?: ReactNode
            inline?: boolean
          }) => {
            const isInline = !className
            if (isInline) {
              return (
                <code
                  className='rounded bg-muted px-1.5 py-0.5 font-mono text-[0.875em] text-foreground/90'
                  {...props}
                >
                  {children}
                </code>
              )
            }
            return <code className={className}>{children}</code>
          },
          pre: ({ children }) => {
            // children should be a single <code> element
            const codeEl = Array.isArray(children) ? children[0] : children
            // @ts-expect-error - extract className+children
            const cls = codeEl?.props?.className as string | undefined
            // @ts-expect-error
            const inner = codeEl?.props?.children as ReactNode
            return <CodeBlock className={cls}>{inner}</CodeBlock>
          },
          table: ({ children }) => (
            <div className='my-5 overflow-x-auto rounded-xl border'>
              <table className='w-full border-collapse text-sm'>{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className='bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground'>
              {children}
            </thead>
          ),
          tbody: ({ children }) => (
            <tbody className='divide-y divide-border'>{children}</tbody>
          ),
          tr: ({ children }) => (
            <tr className='transition-colors hover:bg-muted/30'>{children}</tr>
          ),
          th: ({ children }) => (
            <th className='px-3 py-2.5 font-semibold'>{children}</th>
          ),
          td: ({ children }) => (
            <td className='px-3 py-2.5 align-top'>{children}</td>
          ),
          blockquote: ({ children }) => (
            <blockquote className='my-4 rounded-r-lg border-l-4 border-indigo-500/60 bg-indigo-500/5 px-4 py-2 text-foreground/85'>
              {children}
            </blockquote>
          ),
          hr: () => <hr className='my-8 border-border/60' />,
          strong: ({ children }) => (
            <strong className='font-semibold text-foreground'>{children}</strong>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}

/** 从 markdown 文本提取 H2 形成章节内 TOC */
export function extractToc(md: string): { id: string; title: string }[] {
  const out: { id: string; title: string }[] = []
  const re = /^##\s+(.+?)\s*$/gm
  let m: RegExpExecArray | null
  while ((m = re.exec(md))) {
    const title = m[1].trim()
    out.push({ id: slugify(title), title })
  }
  return out
}
