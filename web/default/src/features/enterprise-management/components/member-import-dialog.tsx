import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertCircle,
  CheckCircle2,
  ClipboardPaste,
  FileUp,
  Loader2,
  Search,
  UserPlus,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import {
  bulkAddEnterpriseMembers,
  searchEnterpriseUserCandidates,
  type BulkAddResult,
  type UserCandidate,
} from '../api'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  enterpriseId: number
  onSuccess: () => void
}

export function MemberImportDialog({
  open,
  onOpenChange,
  enterpriseId,
  onSuccess,
}: Props) {
  const { t } = useTranslation()
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<BulkAddResult | null>(null)

  const reset = () => setResult(null)

  useEffect(() => {
    if (open) reset()
  }, [open])

  const submit = useCallback(
    async (identifiers: string[]) => {
      if (identifiers.length === 0) {
        toast.error('请至少提供一个标识')
        return
      }
      setSubmitting(true)
      try {
        const res = await bulkAddEnterpriseMembers(enterpriseId, identifiers)
        if (res.success && res.data) {
          const normalized = {
            ...res.data,
            added: res.data.added ?? [],
            skipped: res.data.skipped ?? [],
          }
          setResult(normalized)
          const added = normalized.added.length
          const skipped = normalized.skipped.length
          if (added > 0) {
            toast.success(`成功添加 ${added} 人${skipped ? ` · ${skipped} 人跳过` : ''}`)
            onSuccess()
          } else {
            toast.error(`没有任何人被添加 · ${skipped} 人跳过`)
          }
        } else {
          toast.error(res.message || '导入失败')
        }
      } finally {
        setSubmitting(false)
      }
    },
    [enterpriseId, onSuccess]
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            <UserPlus className='size-4' /> 添加成员
          </DialogTitle>
          <DialogDescription>
            三种方式：搜索单选添加、粘贴批量列表、上传 CSV。一个用户只能在一个企业中。
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue='search'>
          <TabsList>
            <TabsTrigger value='search'>
              <Search className='mr-1 size-3.5' /> 搜索单选
            </TabsTrigger>
            <TabsTrigger value='bulk'>
              <ClipboardPaste className='mr-1 size-3.5' /> 批量粘贴
            </TabsTrigger>
            <TabsTrigger value='csv'>
              <FileUp className='mr-1 size-3.5' /> CSV 导入
            </TabsTrigger>
          </TabsList>

          <TabsContent value='search' className='mt-4'>
            <SearchTab
              enterpriseId={enterpriseId}
              submitting={submitting}
              onSubmit={submit}
            />
          </TabsContent>
          <TabsContent value='bulk' className='mt-4'>
            <BulkPasteTab submitting={submitting} onSubmit={submit} />
          </TabsContent>
          <TabsContent value='csv' className='mt-4'>
            <CsvTab submitting={submitting} onSubmit={submit} />
          </TabsContent>
        </Tabs>

        {result && (
          <ResultPanel result={result} onClose={reset} />
        )}

        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Tab 1: 搜索单选 ────────────────────────────────────────────
function SearchTab({
  enterpriseId,
  submitting,
  onSubmit,
}: {
  enterpriseId: number
  submitting: boolean
  onSubmit: (ids: string[]) => void
}) {
  const [keyword, setKeyword] = useState('')
  const [candidates, setCandidates] = useState<UserCandidate[]>([])
  const [searching, setSearching] = useState(false)
  const [picked, setPicked] = useState<UserCandidate[]>([])

  // debounce 搜索
  useEffect(() => {
    if (!keyword.trim()) {
      setCandidates([])
      return
    }
    const t = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await searchEnterpriseUserCandidates(enterpriseId, keyword.trim())
        if (res.success) setCandidates(res.data ?? [])
      } finally {
        setSearching(false)
      }
    }, 250)
    return () => clearTimeout(t)
  }, [keyword, enterpriseId])

  const togglePick = (c: UserCandidate) => {
    if (c.already_in) return
    setPicked((prev) =>
      prev.some((p) => p.id === c.id)
        ? prev.filter((p) => p.id !== c.id)
        : [...prev, c]
    )
  }

  const handleSubmit = () => {
    if (picked.length === 0) {
      toast.error('请先选择至少一个用户')
      return
    }
    onSubmit(picked.map((p) => String(p.id)))
    setPicked([])
    setKeyword('')
  }

  return (
    <div className='space-y-3'>
      <div className='relative'>
        <Search className='absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground' />
        <Input
          placeholder='输入用户名 / 邮箱 / 显示名搜索...'
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          className='pl-9'
        />
        {searching && (
          <Loader2 className='absolute right-2.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground' />
        )}
      </div>

      {picked.length > 0 && (
        <div className='flex flex-wrap gap-1.5'>
          {picked.map((p) => (
            <Badge
              key={p.id}
              className='gap-1 bg-indigo-500/15 text-indigo-700 dark:text-indigo-400'
            >
              {p.username}
              <button
                type='button'
                onClick={() => setPicked((prev) => prev.filter((x) => x.id !== p.id))}
              >
                <X className='size-3' />
              </button>
            </Badge>
          ))}
        </div>
      )}

      <div className='max-h-72 overflow-y-auto rounded-lg border bg-muted/20'>
        {candidates.length === 0 ? (
          <div className='text-muted-foreground py-8 text-center text-xs'>
            {keyword.trim() ? '没有匹配的用户' : '输入关键词开始搜索'}
          </div>
        ) : (
          candidates.map((c) => {
            const isPicked = picked.some((p) => p.id === c.id)
            return (
              <button
                key={c.id}
                type='button'
                onClick={() => togglePick(c)}
                disabled={c.already_in}
                className={cn(
                  'flex w-full items-center justify-between gap-3 border-b px-3 py-2.5 text-left transition-colors last:border-b-0',
                  c.already_in
                    ? 'cursor-not-allowed opacity-60'
                    : isPicked
                      ? 'bg-gradient-to-r from-indigo-500/15 to-fuchsia-500/10 ring-1 ring-inset ring-indigo-500/30'
                      : 'hover:bg-muted/60'
                )}
              >
                <div className='min-w-0 flex-1'>
                  <div className='flex items-center gap-2'>
                    <span className='font-medium'>{c.username}</span>
                    <span className='text-muted-foreground text-xs'>
                      UID {c.id}
                    </span>
                  </div>
                  <div className='text-muted-foreground truncate text-xs'>
                    {c.email || c.display_name || '—'}
                  </div>
                </div>
                {c.already_in ? (
                  <Badge variant='secondary'>已在本企业</Badge>
                ) : c.other_enterprise_name ? (
                  <Badge variant='destructive' className='text-[10px]'>
                    在 "{c.other_enterprise_name}"
                  </Badge>
                ) : isPicked ? (
                  <CheckCircle2 className='size-5 text-indigo-500' />
                ) : (
                  <span className='text-muted-foreground text-xs'>点击选中</span>
                )}
              </button>
            )
          })
        )}
      </div>

      <div className='flex justify-end'>
        <Button onClick={handleSubmit} disabled={submitting || picked.length === 0}>
          {submitting ? '添加中...' : `添加选中的 ${picked.length} 人`}
        </Button>
      </div>
    </div>
  )
}

// ─── Tab 2: 粘贴批量 ────────────────────────────────────────────
function BulkPasteTab({
  submitting,
  onSubmit,
}: {
  submitting: boolean
  onSubmit: (ids: string[]) => void
}) {
  const [text, setText] = useState('')

  const identifiers = useMemo(() => {
    return text
      .split(/[\n,;\s\t]+/)
      .map((s) => s.trim())
      .filter(Boolean)
  }, [text])

  const handleSubmit = () => {
    onSubmit(identifiers)
  }

  return (
    <div className='space-y-3'>
      <div className='space-y-1.5'>
        <Label htmlFor='bulk-text'>每行一个 / 逗号分号空格也行</Label>
        <Textarea
          id='bulk-text'
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          placeholder={`混合标识都行：\nalice@example.com\nbob\n12345\ncarol@company.com`}
          className='font-mono text-sm'
        />
        <p className='text-muted-foreground text-xs'>
          支持：用户 ID（纯数字）、用户名、邮箱混合输入；
          <span className='font-medium tabular-nums'>{identifiers.length}</span> 个标识识别中
        </p>
      </div>
      <div className='flex justify-end'>
        <Button onClick={handleSubmit} disabled={submitting || identifiers.length === 0}>
          {submitting ? '导入中...' : `导入 ${identifiers.length} 人`}
        </Button>
      </div>
    </div>
  )
}

// ─── Tab 3: CSV 导入 ────────────────────────────────────────────
function CsvTab({
  submitting,
  onSubmit,
}: {
  submitting: boolean
  onSubmit: (ids: string[]) => void
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [filename, setFilename] = useState('')
  const [parsed, setParsed] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  const handleFile = (file: File) => {
    setError(null)
    setFilename(file.name)
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result || '')
      // 解析：第一行视作 header，识别 user_id/username/email 三列任一
      const lines = text.split(/\r?\n/).filter((l) => l.trim())
      if (lines.length === 0) {
        setError('文件为空')
        return
      }
      const header = lines[0].split(',').map((s) => s.trim().toLowerCase())
      const idCol = header.findIndex(
        (h) => h === 'user_id' || h === 'id' || h === 'uid'
      )
      const nameCol = header.findIndex(
        (h) => h === 'username' || h === 'name'
      )
      const emailCol = header.findIndex((h) => h === 'email')

      const items: string[] = []
      if (idCol === -1 && nameCol === -1 && emailCol === -1) {
        // 没识别到 header，把每行当作一个标识处理
        for (const line of lines) {
          const v = line.split(',')[0].trim()
          if (v) items.push(v)
        }
        setError(
          'CSV 首行未识别到 user_id/username/email 列，已把每行第一列当作标识使用'
        )
      } else {
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(',').map((s) => s.trim())
          let v = ''
          if (idCol >= 0 && cols[idCol]) v = cols[idCol]
          else if (emailCol >= 0 && cols[emailCol]) v = cols[emailCol]
          else if (nameCol >= 0 && cols[nameCol]) v = cols[nameCol]
          if (v) items.push(v)
        }
      }
      setParsed(items)
    }
    reader.onerror = () => setError('读取文件失败')
    reader.readAsText(file)
  }

  const handleSubmit = () => {
    onSubmit(parsed)
  }

  return (
    <div className='space-y-3'>
      <div
        className='rounded-lg border border-dashed bg-muted/20 p-6 text-center'
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          const f = e.dataTransfer.files?.[0]
          if (f) handleFile(f)
        }}
      >
        <FileUp className='text-muted-foreground mx-auto mb-2 size-8' />
        <p className='text-sm font-medium'>
          {filename ? filename : '拖拽 CSV 文件到这里，或'}
        </p>
        <Button
          type='button'
          variant='outline'
          size='sm'
          className='mt-2'
          onClick={() => inputRef.current?.click()}
        >
          选择文件
        </Button>
        <input
          ref={inputRef}
          type='file'
          accept='.csv,text/csv'
          className='hidden'
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) handleFile(f)
          }}
        />
        <p className='text-muted-foreground mt-2 text-[11px]'>
          推荐首行包含 <code className='font-mono'>user_id</code> /{' '}
          <code className='font-mono'>username</code> /{' '}
          <code className='font-mono'>email</code> 列任一
        </p>
      </div>

      {error && (
        <div className='flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400'>
          <AlertCircle className='size-4 shrink-0' />
          <span>{error}</span>
        </div>
      )}

      {parsed.length > 0 && (
        <div className='space-y-1.5'>
          <Label>已解析 {parsed.length} 个标识（前 20 个预览）</Label>
          <div className='max-h-32 overflow-y-auto rounded-md border bg-muted/30 p-2 font-mono text-xs'>
            {parsed.slice(0, 20).join('、')}
            {parsed.length > 20 && (
              <span className='text-muted-foreground'>... 等 {parsed.length} 个</span>
            )}
          </div>
        </div>
      )}

      <div className='flex justify-end'>
        <Button onClick={handleSubmit} disabled={submitting || parsed.length === 0}>
          {submitting ? '导入中...' : `导入 ${parsed.length} 人`}
        </Button>
      </div>
    </div>
  )
}

// ─── 结果面板 ──────────────────────────────────────────────────
function ResultPanel({
  result,
  onClose,
}: {
  result: BulkAddResult
  onClose: () => void
}) {
  return (
    <div className='space-y-2 rounded-lg border bg-muted/20 p-3'>
      <div className='flex items-center justify-between'>
        <span className='text-sm font-medium'>导入结果</span>
        <button
          type='button'
          onClick={onClose}
          className='text-muted-foreground text-xs hover:text-foreground'
        >
          关闭
        </button>
      </div>
      <div className='grid grid-cols-2 gap-3'>
        <div className='rounded-md border bg-emerald-500/5 p-3'>
          <div className='text-emerald-700 dark:text-emerald-400 text-xs font-semibold'>
            ✓ 成功添加
          </div>
          <div className='mt-1 text-2xl font-bold tabular-nums'>
            {result.added.length}
          </div>
        </div>
        <div className='rounded-md border bg-amber-500/5 p-3'>
          <div className='text-amber-700 dark:text-amber-400 text-xs font-semibold'>
            ⚠ 跳过
          </div>
          <div className='mt-1 text-2xl font-bold tabular-nums'>
            {result.skipped.length}
          </div>
        </div>
      </div>
      {result.skipped.length > 0 && (
        <details className='rounded-md border bg-background p-2 text-xs'>
          <summary className='cursor-pointer font-medium'>
            查看 {result.skipped.length} 条跳过原因
          </summary>
          <div className='mt-2 max-h-48 overflow-y-auto space-y-1'>
            {result.skipped.map((s, i) => (
              <div key={i} className='flex gap-2 border-b pb-1 last:border-b-0'>
                <code className='font-mono shrink-0 text-foreground/80'>
                  {s.identifier}
                </code>
                <span className='text-muted-foreground'>—</span>
                <span className='text-muted-foreground'>{s.reason}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
