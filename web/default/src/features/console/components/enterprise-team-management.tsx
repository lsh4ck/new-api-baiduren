import { useEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Search, RefreshCw, Crown, UserMinus, UserCheck, MoreVertical,
  ChevronLeft, ChevronRight, DollarSign,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { toast } from 'sonner'
import { enterpriseApi, type Member } from '../enterprise-api'
import { format } from 'date-fns'

const PAGE_SIZE = 20

function RoleBadge({ role }: { role: number }) {
  const { t } = useTranslation()
  if (role >= 100) return <Badge className='bg-red-500/20 text-red-700 dark:text-red-400'><Crown className='mr-1 size-3' />{t('Root')}</Badge>
  if (role >= 10) return <Badge className='bg-yellow-500/20 text-yellow-700 dark:text-yellow-400'><Crown className='mr-1 size-3' />{t('Admin')}</Badge>
  return <Badge variant='secondary'>{t('User')}</Badge>
}

// ─── Member limit dialog ─────────────────────────────────────────
function MemberLimitDialog({ member, onDone }: { member: Member; onDone: () => void }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [budget, setBudget] = useState('')
  const [enforceHard, setEnforceHard] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      enterpriseApi.getMemberLimits(member.id).then(res => {
        if (res.success && res.data) {
          setBudget(res.data.budget_usd.toString())
          setEnforceHard(res.data.enforce_hard)
        }
      })
    }
  }, [open, member.id])

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await enterpriseApi.setMemberLimit(member.id, {
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
      <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setOpen(true) }}>
        <DollarSign className='mr-2 size-3' />
        {t('Set Quota Limit')}
      </DropdownMenuItem>
      {open && (
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('个人月度限额')} — {member.display_name || member.username}</DialogTitle>
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
      )}
    </Dialog>
  )
}

// ─── Main component ──────────────────────────────────────────────
export function EnterpriseTeamManagement() {
  const { t } = useTranslation()
  const [members, setMembers] = useState<Member[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [page, setPage] = useState(1)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await enterpriseApi.getMembers(page, PAGE_SIZE, search)
      setMembers(res.data || [])
      setTotal(res.total || 0)
    } catch {
      toast.error(t('Failed to load members'))
    } finally {
      setLoading(false)
    }
  }, [page, search, t])

  useEffect(() => { load() }, [load])

  const handleSearch = () => {
    setPage(1)
    setSearch(searchInput)
  }

  const handleRoleChange = async (id: number, role: number) => {
    const res = await enterpriseApi.updateMember(id, { role })
    if (res.success) {
      toast.success(t('Role updated'))
      load()
    } else {
      toast.error(res.message || t('Operation failed'))
    }
  }

  const handleToggleStatus = async (id: number, currentStatus: number) => {
    const newStatus = currentStatus === 2 ? 1 : 2
    const res = await enterpriseApi.toggleMemberStatus(id, newStatus as 1 | 2)
    if (res.success) {
      toast.success(newStatus === 1 ? t('Member enabled') : t('Member disabled'))
      load()
    } else {
      toast.error(res.message || t('Operation failed'))
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className='space-y-4'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div>
          <h3 className='text-lg font-semibold'>{t('Team Members')}</h3>
          <p className='text-muted-foreground text-sm'>
            {t('Total')}: {total}
          </p>
        </div>
        <Button variant='outline' size='sm' onClick={load} disabled={loading}>
          <RefreshCw className={`mr-1 size-4 ${loading ? 'animate-spin' : ''}`} />
          {t('Refresh')}
        </Button>
      </div>

      <div className='flex gap-2'>
        <div className='relative max-w-sm flex-1'>
          <Search className='absolute left-2.5 top-2.5 size-4 text-muted-foreground' />
          <Input
            className='pl-8'
            placeholder={t('Search members...')}
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
          />
        </div>
        <Button size='sm' variant='outline' onClick={handleSearch}>{t('Search')}</Button>
      </div>

      <Card>
        <CardContent className='p-0'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('Member')}</TableHead>
                <TableHead>{t('Role')}</TableHead>
                <TableHead className='text-right'>{t('This Month')}</TableHead>
                <TableHead className='text-right'>{t('Total Used')}</TableHead>
                <TableHead>{t('Last Active')}</TableHead>
                <TableHead>{t('Status')}</TableHead>
                <TableHead className='w-12' />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className='text-muted-foreground py-8 text-center text-sm'>{t('Loading...')}</TableCell>
                </TableRow>
              ) : members.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className='text-muted-foreground py-8 text-center text-sm'>{t('No members found')}</TableCell>
                </TableRow>
              ) : (
                members.map((member) => (
                  <TableRow key={member.id} className={member.status === 2 ? 'opacity-50' : ''}>
                    <TableCell>
                      <div className='flex items-center gap-3'>
                        <Avatar className='size-8'>
                          <AvatarFallback className='text-xs'>
                            {(member.display_name || member.username).slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className='font-medium'>{member.display_name || member.username}</div>
                          <div className='text-muted-foreground text-xs'>{member.email}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {member.status === 2 ? (
                        <RoleBadge role={member.role} />
                      ) : (
                        <Select
                          value={String(member.role)}
                          onValueChange={(v) => handleRoleChange(member.id, parseInt(v))}
                        >
                          <SelectTrigger className='h-7 w-[90px]'>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value='1'>{t('User')}</SelectItem>
                            <SelectItem value='10'>{t('Admin')}</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </TableCell>
                    <TableCell className='text-right font-mono text-sm'>
                      ${(member.used_quota / 500000).toFixed(2)}
                    </TableCell>
                    <TableCell className='text-right font-mono text-xs text-muted-foreground'>
                      ${(member.used_quota / 500000).toFixed(2)}
                    </TableCell>
                    <TableCell className='text-muted-foreground text-xs'>
                      {member.last_login_at ? format(new Date(member.last_login_at * 1000), 'MM-dd HH:mm') : '—'}
                    </TableCell>
                    <TableCell>
                      {member.status === 2
                        ? <Badge variant='destructive' className='text-xs'>{t('Disabled')}</Badge>
                        : <Badge variant='secondary' className='text-xs'>{t('Active')}</Badge>
                      }
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant='ghost' size='icon' className='size-7'>
                            <MoreVertical className='size-3' />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align='end'>
                          <MemberLimitDialog member={member} onDone={load} />
                          <DropdownMenuSeparator />
                          {member.status === 2 ? (
                            <DropdownMenuItem onClick={() => handleToggleStatus(member.id, member.status)}>
                              <UserCheck className='mr-2 size-3 text-green-500' />
                              {t('Enable Member')}
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              className='text-red-600'
                              onClick={() => handleToggleStatus(member.id, member.status)}
                            >
                              <UserMinus className='mr-2 size-3' />
                              {t('Disable Member')}
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className='flex items-center justify-between text-sm'>
          <span className='text-muted-foreground'>
            {t('Page')} {page} / {totalPages}
          </span>
          <div className='flex gap-1'>
            <Button
              variant='outline'
              size='icon'
              className='size-8'
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
            >
              <ChevronLeft className='size-4' />
            </Button>
            <Button
              variant='outline'
              size='icon'
              className='size-8'
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
            >
              <ChevronRight className='size-4' />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
