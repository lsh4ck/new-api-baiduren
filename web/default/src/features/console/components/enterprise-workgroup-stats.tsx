import { useEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Users, RefreshCw, Layers, Plus, Pencil, Trash2, UserPlus, UserMinus,
  ShieldAlert, Shield, Settings2,
} from 'lucide-react'
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import { enterpriseApi, type WorkgroupStat, type WorkGroup, type Member } from '../enterprise-api'

// ─── helpers ────────────────────────────────────────────────────
function pctColor(pct: number) {
  if (pct >= 100) return 'text-red-600 dark:text-red-400'
  if (pct >= 90) return 'text-orange-500'
  if (pct >= 80) return 'text-amber-500'
  return 'text-emerald-600 dark:text-emerald-400'
}
function progressClass(pct: number) {
  if (pct >= 100) return '[&>div]:bg-red-500'
  if (pct >= 90) return '[&>div]:bg-orange-500'
  if (pct >= 80) return '[&>div]:bg-amber-500'
  return ''
}

// ─── Create / Edit workgroup dialog ─────────────────────────────
function WorkgroupDialog({
  existing,
  onDone,
}: {
  existing?: WorkGroup
  onDone: () => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(existing?.name || '')
  const [desc, setDesc] = useState(existing?.description || '')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!name.trim()) { toast.error(t('Name required')); return }
    setSaving(true)
    try {
      const res = existing
        ? await enterpriseApi.updateWorkgroup(existing.id, { name, description: desc })
        : await enterpriseApi.createWorkgroup({ name, description: desc })
      if (res.success) {
        toast.success(existing ? t('Updated') : t('Created'))
        setOpen(false)
        onDone()
      } else {
        toast.error(res.message || t('Operation failed'))
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {existing ? (
          <Button variant='ghost' size='icon' className='size-7'>
            <Pencil className='size-3.5' />
          </Button>
        ) : (
          <Button size='sm' variant='outline'>
            <Plus className='mr-1 size-4' />
            {t('New Workgroup')}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existing ? t('Edit Workgroup') : t('New Workgroup')}</DialogTitle>
        </DialogHeader>
        <div className='space-y-4 py-2'>
          <div>
            <Label>{t('Name')}</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder={t('Engineering')} />
          </div>
          <div>
            <Label>{t('Description')} ({t('optional')})</Label>
            <Input value={desc} onChange={e => setDesc(e.target.value)} placeholder={t('Backend team')} />
          </div>
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={() => setOpen(false)}>{t('Cancel')}</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? t('Saving...') : t('Save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Set workgroup limit dialog ──────────────────────────────────
function WorkgroupLimitDialog({ wg, stat, onDone }: { wg: WorkGroup; stat?: WorkgroupStat; onDone: () => void }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [budget, setBudget] = useState(stat?.max_usd?.toString() || '')
  const [enforceHard, setEnforceHard] = useState(false)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await enterpriseApi.setWorkgroupLimit(wg.id, {
        budget_usd: parseFloat(budget) || 0,
        enforce_hard: enforceHard,
      })
      if (res.success) {
        toast.success(t('Limit saved'))
        setOpen(false)
        onDone()
      } else {
        toast.error(res.message || t('Operation failed'))
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant='ghost' size='icon' className='size-7' title={t('Set Budget Limit')}>
          <Settings2 className='size-3.5' />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('工作组预算限额')} — {wg.name}</DialogTitle>
        </DialogHeader>
        <div className='space-y-4 py-2'>
          <div>
            <Label>{t('Monthly Budget')} (USD $)</Label>
            <Input
              type='number'
              value={budget}
              onChange={e => setBudget(e.target.value)}
              placeholder='0 = 无限制'
            />
            <p className='text-muted-foreground mt-1 text-xs'>{t('设为 0 表示移除限额')}</p>
          </div>
          <div className='flex items-center justify-between rounded-lg border p-3'>
            <div>
              <p className='text-sm font-medium'>{t('硬限制（超额直接拦截）')}</p>
              <p className='text-muted-foreground text-xs'>{t('关闭则仅发告警邮件，不阻止请求')}</p>
            </div>
            <Switch checked={enforceHard} onCheckedChange={setEnforceHard} />
          </div>
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={() => setOpen(false)}>{t('Cancel')}</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? t('Saving...') : t('Save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Assign member dialog ────────────────────────────────────────
function AssignMemberDialog({ wg, allMembers, onDone }: { wg: WorkGroup; allMembers: Member[]; onDone: () => void }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [selectedId, setSelectedId] = useState('')
  const [wgMembers, setWgMembers] = useState<Member[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      enterpriseApi.listWorkgroupMembers(wg.id).then(res => {
        if (res.success) setWgMembers(res.data || [])
      })
    }
  }, [open, wg.id])

  const assignedIds = new Set(wgMembers.map(m => m.id))
  const unassigned = allMembers.filter(m => !assignedIds.has(m.id))

  const handleAssign = async () => {
    if (!selectedId) return
    setSaving(true)
    try {
      const res = await enterpriseApi.assignWorkgroupMember(wg.id, parseInt(selectedId))
      if (res.success) {
        toast.success(t('Member assigned'))
        setSelectedId('')
        // Refresh wg members
        enterpriseApi.listWorkgroupMembers(wg.id).then(res => {
          if (res.success) setWgMembers(res.data || [])
        })
        onDone()
      } else {
        toast.error(res.message || t('Operation failed'))
      }
    } finally {
      setSaving(false)
    }
  }

  const handleRemove = async (userId: number) => {
    const res = await enterpriseApi.removeWorkgroupMember(wg.id, userId)
    if (res.success) {
      setWgMembers(prev => prev.filter(m => m.id !== userId))
      toast.success(t('Member removed'))
      onDone()
    } else {
      toast.error(res.message || t('Operation failed'))
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant='ghost' size='icon' className='size-7' title={t('Manage Members')}>
          <UserPlus className='size-3.5' />
        </Button>
      </DialogTrigger>
      <DialogContent className='max-w-md'>
        <DialogHeader>
          <DialogTitle>{t('管理成员')} — {wg.name}</DialogTitle>
        </DialogHeader>
        <div className='space-y-4 py-1'>
          {/* Current members */}
          <div>
            <p className='mb-2 text-sm font-medium'>{t('当前成员')} ({wgMembers.length})</p>
            {wgMembers.length === 0 ? (
              <p className='text-muted-foreground text-sm'>{t('暂无成员')}</p>
            ) : (
              <div className='max-h-40 space-y-1 overflow-y-auto'>
                {wgMembers.map(m => (
                  <div key={m.id} className='flex items-center justify-between rounded px-2 py-1 hover:bg-muted/40'>
                    <div>
                      <span className='text-sm font-medium'>{m.display_name || m.username}</span>
                      <span className='text-muted-foreground ml-2 text-xs'>{m.email}</span>
                    </div>
                    <Button variant='ghost' size='icon' className='size-6' onClick={() => handleRemove(m.id)}>
                      <UserMinus className='size-3 text-red-500' />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* Add member */}
          <div className='border-t pt-3'>
            <p className='mb-2 text-sm font-medium'>{t('添加成员')}</p>
            <div className='flex gap-2'>
              <Select value={selectedId} onValueChange={setSelectedId}>
                <SelectTrigger className='flex-1'>
                  <SelectValue placeholder={t('选择成员')} />
                </SelectTrigger>
                <SelectContent>
                  {unassigned.length === 0 ? (
                    <SelectItem value='__none__' disabled>{t('所有成员已分配')}</SelectItem>
                  ) : (
                    unassigned.map(m => (
                      <SelectItem key={m.id} value={String(m.id)}>
                        {m.display_name || m.username}
                        {m.email && <span className='text-muted-foreground ml-2 text-xs'>{m.email}</span>}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <Button onClick={handleAssign} disabled={!selectedId || saving} size='sm'>
                {t('Add')}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Main component ──────────────────────────────────────────────
export function EnterpriseWorkgroupStats() {
  const { t } = useTranslation()
  const [stats, setStats] = useState<WorkgroupStat[]>([])
  const [workgroups, setWorkgroups] = useState<WorkGroup[]>([])
  const [allMembers, setAllMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [statsRes, wgRes, memberRes] = await Promise.all([
        enterpriseApi.getWorkgroupStats(),
        enterpriseApi.listWorkgroups(),
        enterpriseApi.getMembers(1, 100),
      ])
      if (statsRes.success) setStats(statsRes.data || [])
      if (wgRes.success) setWorkgroups(wgRes.data || [])
      if (memberRes.success) setAllMembers(memberRes.data || [])
    } catch {
      toast.error(t('Failed to load'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => { load() }, [load])

  const handleDelete = async (wgId: number) => {
    const res = await enterpriseApi.deleteWorkgroup(wgId)
    if (res.success) {
      toast.success(t('Deleted'))
      load()
    } else {
      toast.error(res.message || t('Operation failed'))
    }
  }

  const statMap = Object.fromEntries(stats.map(s => [s.id, s]))

  // Count unassigned members
  const assignedUserIds = new Set<number>()
  stats.forEach(s => {
    // We don't have per-member info here; rely on member_count total
  })
  const totalAssigned = stats.reduce((sum, s) => sum + s.member_count, 0)
  const unassignedCount = Math.max(0, allMembers.length - totalAssigned)

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between'>
        <div>
          <h3 className='text-base font-semibold'>{t('工作组管理')}</h3>
          <p className='text-muted-foreground text-sm'>
            {t('本月各工作组消费进度')}
            {unassignedCount > 0 && (
              <span className='ml-2 text-amber-500'>
                · {unassignedCount} {t('成员未分配工作组')}
              </span>
            )}
          </p>
        </div>
        <div className='flex items-center gap-2'>
          <Button variant='outline' size='sm' onClick={load} disabled={loading}>
            <RefreshCw className={`mr-1 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            {t('Refresh')}
          </Button>
          <WorkgroupDialog onDone={load} />
        </div>
      </div>

      {loading ? (
        <p className='text-muted-foreground text-sm'>{t('Loading...')}</p>
      ) : workgroups.length === 0 ? (
        <Card>
          <CardContent className='flex flex-col items-center gap-3 py-12'>
            <Layers className='text-muted-foreground size-10 opacity-30' />
            <p className='text-muted-foreground text-sm'>{t('暂无工作组')}</p>
            <p className='text-muted-foreground text-xs'>{t('点击右上角「New Workgroup」创建第一个工作组')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
          {workgroups.map((wg) => {
            const s = statMap[wg.id]
            const usedUSD = s?.used_usd ?? 0
            const maxUSD = s?.max_usd ?? 0
            const pct = s?.pct ?? 0

            return (
              <Card key={wg.id} className='transition-shadow hover:shadow-md'>
                <CardHeader className='pb-2'>
                  <div className='flex items-start justify-between'>
                    <div className='min-w-0 flex-1'>
                      <CardTitle className='truncate text-base'>{wg.name}</CardTitle>
                      <CardDescription className='flex items-center gap-1 mt-0.5'>
                        <Users className='size-3' />
                        {s?.member_count ?? 0} {t('members')}
                        {wg.description && (
                          <span className='ml-1 text-xs'>· {wg.description}</span>
                        )}
                      </CardDescription>
                    </div>
                    {s?.max_quota && s.max_quota > 0 && (
                      <Badge
                        variant='secondary'
                        className={`ml-2 shrink-0 text-xs font-bold ${pctColor(pct)}`}
                      >
                        {pct >= 100 ? (
                          <ShieldAlert className='mr-1 size-3' />
                        ) : pct >= 80 ? (
                          <Shield className='mr-1 size-3' />
                        ) : null}
                        {pct}%
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className='space-y-3'>
                  <div className='flex items-baseline justify-between'>
                    <span className='text-2xl font-bold tabular-nums'>
                      ${usedUSD.toFixed(2)}
                    </span>
                    {maxUSD > 0 && (
                      <span className='text-muted-foreground text-sm'>
                        / ${maxUSD.toFixed(2)}
                      </span>
                    )}
                  </div>

                  {maxUSD > 0 ? (
                    <>
                      <Progress value={pct} className={`h-1.5 ${progressClass(pct)}`} />
                      <p className='text-muted-foreground text-xs'>
                        {t('remaining')}: ${Math.max(0, maxUSD - usedUSD).toFixed(2)}
                        {pct >= 80 && (
                          <span className={`ml-2 font-medium ${pctColor(pct)}`}>
                            {pct >= 100 ? '⚠ 超限' : pct >= 90 ? '⚠ 近上限' : '⚠ 注意'}
                          </span>
                        )}
                      </p>
                    </>
                  ) : (
                    <p className='text-muted-foreground text-xs'>{t('无月度限额')}</p>
                  )}

                  <div className='flex items-center justify-end gap-0.5 border-t pt-2'>
                    <WorkgroupLimitDialog wg={wg} stat={s} onDone={load} />
                    <AssignMemberDialog wg={wg} allMembers={allMembers} onDone={load} />
                    <WorkgroupDialog existing={wg} onDone={load} />
                    <Button
                      variant='ghost'
                      size='icon'
                      className='size-7 text-red-500 hover:text-red-600'
                      onClick={() => handleDelete(wg.id)}
                      title={t('Delete')}
                    >
                      <Trash2 className='size-3.5' />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
