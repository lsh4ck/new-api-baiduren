import { useEffect, useMemo, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Building2, Users as UsersIcon, Trash2, Shield, ChevronLeft } from 'lucide-react'
import { toast } from 'sonner'
import { SectionPageLayout } from '@/components/layout'
import { useAuthStore } from '@/stores/auth-store'
import { Badge } from '@/components/ui/badge'
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
import { ConfirmDialog } from '@/components/confirm-dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  createEnterprise,
  deleteEnterprise,
  listEnterprises,
  listEnterpriseMembers,
  removeEnterpriseMember,
  setEnterpriseAdmin,
  listWorkGroups,
  createWorkGroup,
  deleteWorkGroup,
  listWorkGroupMembers,
  addWorkGroupMember,
  removeWorkGroupMember,
  listEnterpriseLimits,
  createEnterpriseLimit,
  updateEnterpriseLimit,
  deleteEnterpriseLimit,
  type Enterprise,
  type EnterpriseMember,
  type WorkGroup,
  type EnterpriseLimit,
} from './api'
import { MemberImportDialog } from './components/member-import-dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'

export function EnterpriseManagement() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.auth.user)
  const isPlatformAdmin = (user?.role ?? 0) >= 10
  const isSales = Boolean((user as { is_sales?: boolean } | null)?.is_sales)
  const enterpriseAdminOf = (user as { enterprise_admin_of?: number } | null)?.enterprise_admin_of ?? 0
  const canCreate = isPlatformAdmin || isSales
  const canDelete = isPlatformAdmin

  const [enterprises, setEnterprises] = useState<Enterprise[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<Enterprise | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteId, setDeleteId] = useState<number | null>(null)

  const loadEnterprises = useCallback(async () => {
    setLoading(true)
    try {
      const res = await listEnterprises({ p: 1, page_size: 100 })
      if (res.success && res.data) {
        const items = res.data.items ?? []
        setEnterprises(items)
        // 企业管理员只能看自己企业，自动选中
        if (enterpriseAdminOf > 0 && items.length === 1) {
          setSelected(items[0])
        }
      } else {
        toast.error(res.message || '加载企业列表失败')
      }
    } catch {
      toast.error('加载企业列表失败')
    } finally {
      setLoading(false)
    }
  }, [enterpriseAdminOf])

  useEffect(() => {
    loadEnterprises()
  }, [loadEnterprises])

  const handleCreated = () => {
    setCreateOpen(false)
    loadEnterprises()
  }

  const handleDelete = async () => {
    if (deleteId == null) return
    const res = await deleteEnterprise(deleteId)
    if (res.success) {
      toast.success('已删除')
      setDeleteId(null)
      if (selected?.id === deleteId) setSelected(null)
      loadEnterprises()
    } else {
      toast.error(res.message || '删除失败')
    }
  }

  return (
    <>
    <SectionPageLayout>
      <SectionPageLayout.Title>{t('Enterprise Management')}</SectionPageLayout.Title>
      <SectionPageLayout.Description>
        管理企业租户、成员、企业管理员
      </SectionPageLayout.Description>
      <SectionPageLayout.Actions>
        {canCreate && !selected && (
          <Button onClick={() => setCreateOpen(true)} size='sm'>
            <Plus className='mr-1 h-4 w-4' /> 新建企业
          </Button>
        )}
      </SectionPageLayout.Actions>
      <SectionPageLayout.Content>
        {selected ? (
          <EnterpriseDetail
            enterprise={selected}
            canSetAdmin={isPlatformAdmin}
            onBack={() => setSelected(null)}
          />
        ) : (
          <div className='space-y-4'>
            {loading ? (
              <div className='text-muted-foreground p-8 text-center text-sm'>
                加载中...
              </div>
            ) : enterprises.length === 0 ? (
              <div className='rounded-lg border border-dashed p-12 text-center'>
                <Building2 className='text-muted-foreground mx-auto mb-3 size-10' />
                <p className='text-sm font-medium'>暂无企业</p>
                {canCreate && (
                  <p className='text-muted-foreground mt-1 text-xs'>
                    点击右上角"新建企业"创建第一个企业
                  </p>
                )}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>企业名称</TableHead>
                    <TableHead>描述</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>企业管理员</TableHead>
                    <TableHead className='text-right'>操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {enterprises.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className='font-medium'>{e.name}</TableCell>
                      <TableCell className='text-muted-foreground text-xs'>
                        {e.description || '—'}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={e.status === 'active' ? 'default' : 'destructive'}
                        >
                          {e.status === 'active' ? '启用' : e.status}
                        </Badge>
                      </TableCell>
                      <TableCell className='text-xs'>
                        {e.admin_id > 0 ? (
                          <span>UID: {e.admin_id}</span>
                        ) : (
                          <span className='text-muted-foreground'>未指派</span>
                        )}
                      </TableCell>
                      <TableCell className='text-right'>
                        <Button
                          size='sm'
                          variant='outline'
                          onClick={() => setSelected(e)}
                        >
                          <UsersIcon className='mr-1 h-3.5 w-3.5' /> 成员
                        </Button>
                        {canDelete && (
                          <Button
                            size='sm'
                            variant='ghost'
                            className='ml-2 text-destructive hover:text-destructive'
                            onClick={() => setDeleteId(e.id)}
                          >
                            <Trash2 className='h-3.5 w-3.5' />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        )}
      </SectionPageLayout.Content>
    </SectionPageLayout>

    <CreateEnterpriseDialog
      open={createOpen}
      onOpenChange={setCreateOpen}
      onSuccess={handleCreated}
    />

    <ConfirmDialog
      open={deleteId != null}
      onOpenChange={(o) => !o && setDeleteId(null)}
      title='删除企业'
      desc='确认删除该企业？所有成员将被解除关联，企业管理员身份也会被撤销。'
      confirmText='删除'
      destructive
      handleConfirm={handleDelete}
    />
    </>
  )
}

function CreateEnterpriseDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      setName('')
      setDesc('')
    }
  }, [open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      toast.error('请填写企业名称')
      return
    }
    setSubmitting(true)
    try {
      const res = await createEnterprise({ name: name.trim(), description: desc.trim() })
      if (res.success) {
        toast.success('企业创建成功')
        onSuccess()
      } else {
        toast.error(res.message || '创建失败')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>新建企业</DialogTitle>
          <DialogDescription>填写基础信息</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className='space-y-3'>
          <div className='space-y-1.5'>
            <Label htmlFor='ce-name'>{t('Name')}</Label>
            <Input
              id='ce-name'
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={128}
              required
            />
          </div>
          <div className='space-y-1.5'>
            <Label htmlFor='ce-desc'>描述</Label>
            <Textarea
              id='ce-desc'
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              maxLength={512}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              onClick={() => onOpenChange(false)}
            >
              {t('Cancel')}
            </Button>
            <Button type='submit' disabled={submitting}>
              {submitting ? '提交中...' : '创建'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function EnterpriseDetail({
  enterprise,
  canSetAdmin,
  onBack,
}: {
  enterprise: Enterprise
  canSetAdmin: boolean
  onBack: () => void
}) {
  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between'>
        <Button variant='ghost' size='sm' onClick={onBack}>
          <ChevronLeft className='mr-1 h-4 w-4' /> 返回企业列表
        </Button>
      </div>

      <div className='rounded-lg border bg-card p-4'>
        <h2 className='text-lg font-semibold'>{enterprise.name}</h2>
        {enterprise.description && (
          <p className='text-muted-foreground mt-1 text-sm'>
            {enterprise.description}
          </p>
        )}
      </div>

      <Tabs defaultValue='members'>
        <TabsList>
          <TabsTrigger value='members'>成员</TabsTrigger>
          <TabsTrigger value='workgroups'>工作组</TabsTrigger>
          <TabsTrigger value='limits'>限额规则</TabsTrigger>
        </TabsList>
        <TabsContent value='members' className='mt-4'>
          <MembersTab enterprise={enterprise} canSetAdmin={canSetAdmin} />
        </TabsContent>
        <TabsContent value='workgroups' className='mt-4'>
          <WorkGroupsTab enterprise={enterprise} />
        </TabsContent>
        <TabsContent value='limits' className='mt-4'>
          <LimitsTab enterprise={enterprise} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function MembersTab({
  enterprise,
  canSetAdmin,
}: {
  enterprise: Enterprise
  canSetAdmin: boolean
}) {
  const [members, setMembers] = useState<EnterpriseMember[]>([])
  const [loading, setLoading] = useState(false)
  const [addOpen, setAddOpen] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const res = await listEnterpriseMembers(enterprise.id, { p: 1, page_size: 100 })
      if (res.success && res.data) setMembers(res.data.items ?? [])
      else toast.error(res.message || '加载成员失败')
    } finally {
      setLoading(false)
    }
  }, [enterprise.id])

  useEffect(() => {
    reload()
  }, [reload])

  const handleRemove = async (userId: number) => {
    const res = await removeEnterpriseMember(enterprise.id, userId)
    if (res.success) {
      toast.success('已移除')
      reload()
    } else toast.error(res.message || '移除失败')
  }

  const handleSetAdmin = async (userId: number) => {
    const res = await setEnterpriseAdmin(enterprise.id, userId)
    if (res.success) {
      toast.success('已指派为企业管理员')
      reload()
    } else toast.error(res.message || '指派失败')
  }

  const handleExportCsv = () => {
    if (members.length === 0) {
      toast.error('当前无成员可导出')
      return
    }
    const rows = [
      ['user_id', 'username', 'display_name', 'email', 'is_admin', 'used_quota', 'request_count'],
      ...members.map((m) => [
        m.id,
        m.username,
        m.display_name || '',
        m.email || '',
        m.enterprise_admin_of === enterprise.id ? 'yes' : 'no',
        m.used_quota,
        m.request_count,
      ]),
    ]
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `enterprise-${enterprise.id}-members-${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className='space-y-3'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div className='text-muted-foreground text-xs'>
          {members.length} 个成员
        </div>
        <div className='flex gap-2'>
          <Button variant='outline' size='sm' onClick={handleExportCsv}>
            导出 CSV
          </Button>
          <Button onClick={() => setAddOpen(true)} size='sm'>
            <Plus className='mr-1 h-4 w-4' /> 添加成员
          </Button>
        </div>
      </div>
      {loading ? (
        <div className='text-muted-foreground p-8 text-center text-sm'>加载中...</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>用户名</TableHead>
              <TableHead>显示名</TableHead>
              <TableHead>邮箱</TableHead>
              <TableHead>角色</TableHead>
              <TableHead className='text-right'>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className='text-muted-foreground text-center py-8'>
                  暂无成员
                </TableCell>
              </TableRow>
            ) : (
              members.map((m) => {
                const isAdmin = m.enterprise_admin_of === enterprise.id
                return (
                  <TableRow key={m.id}>
                    <TableCell className='font-medium'>{m.username}</TableCell>
                    <TableCell>{m.display_name || '—'}</TableCell>
                    <TableCell className='text-xs'>{m.email || '—'}</TableCell>
                    <TableCell>
                      {isAdmin ? (
                        <Badge className='gap-1 bg-indigo-500/15 text-indigo-700 dark:text-indigo-400'>
                          <Shield className='h-3 w-3' />
                          企业管理员
                        </Badge>
                      ) : (
                        <Badge variant='secondary'>成员</Badge>
                      )}
                    </TableCell>
                    <TableCell className='text-right'>
                      {canSetAdmin && !isAdmin && (
                        <Button size='sm' variant='outline' onClick={() => handleSetAdmin(m.id)}>
                          指派为管理员
                        </Button>
                      )}
                      <Button
                        size='sm'
                        variant='ghost'
                        className='ml-2 text-destructive hover:text-destructive'
                        onClick={() => handleRemove(m.id)}
                      >
                        <Trash2 className='h-3.5 w-3.5' />
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      )}
      <MemberImportDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        enterpriseId={enterprise.id}
        onSuccess={() => {
          reload()
        }}
      />
    </div>
  )
}

function WorkGroupsTab({ enterprise }: { enterprise: Enterprise }) {
  const [groups, setGroups] = useState<WorkGroup[]>([])
  const [createOpen, setCreateOpen] = useState(false)
  const [activeWgId, setActiveWgId] = useState<number | null>(null)
  const [wgMembers, setWgMembers] = useState<EnterpriseMember[]>([])
  const [addMemberOpen, setAddMemberOpen] = useState(false)

  const reload = useCallback(async () => {
    const res = await listWorkGroups(enterprise.id)
    if (res.success) setGroups(res.data ?? [])
  }, [enterprise.id])

  const reloadMembers = useCallback(
    async (wgId: number) => {
      const res = await listWorkGroupMembers(enterprise.id, wgId)
      if (res.success) setWgMembers(res.data ?? [])
    },
    [enterprise.id]
  )

  useEffect(() => {
    reload()
  }, [reload])

  useEffect(() => {
    if (activeWgId) reloadMembers(activeWgId)
  }, [activeWgId, reloadMembers])

  const handleDelete = async (id: number) => {
    const res = await deleteWorkGroup(enterprise.id, id)
    if (res.success) {
      toast.success('已删除')
      if (activeWgId === id) setActiveWgId(null)
      reload()
    } else toast.error(res.message || '删除失败')
  }

  const handleRemoveMember = async (uid: number) => {
    if (!activeWgId) return
    const res = await removeWorkGroupMember(enterprise.id, activeWgId, uid)
    if (res.success) {
      toast.success('已移除')
      reloadMembers(activeWgId)
    } else toast.error(res.message || '移除失败')
  }

  return (
    <div className='grid gap-4 lg:grid-cols-[280px_1fr]'>
      {/* 工作组列表 */}
      <div className='space-y-2 rounded-lg border bg-card p-3'>
        <div className='mb-2 flex items-center justify-between'>
          <h3 className='text-sm font-medium'>工作组</h3>
          <Button size='sm' variant='outline' onClick={() => setCreateOpen(true)}>
            <Plus className='h-3.5 w-3.5' />
          </Button>
        </div>
        {groups.length === 0 ? (
          <p className='text-muted-foreground py-6 text-center text-xs'>
            还没有工作组
          </p>
        ) : (
          groups.map((g) => (
            <div
              key={g.id}
              className={`group flex items-center justify-between rounded-md px-2.5 py-2 text-sm cursor-pointer hover:bg-muted/60 ${
                activeWgId === g.id ? 'bg-muted' : ''
              }`}
              onClick={() => setActiveWgId(g.id)}
            >
              <div className='min-w-0'>
                <div className='truncate font-medium'>{g.name}</div>
                {g.description && (
                  <div className='text-muted-foreground truncate text-xs'>
                    {g.description}
                  </div>
                )}
              </div>
              <Button
                size='sm'
                variant='ghost'
                className='shrink-0 text-destructive opacity-0 group-hover:opacity-100'
                onClick={(e) => {
                  e.stopPropagation()
                  handleDelete(g.id)
                }}
              >
                <Trash2 className='h-3.5 w-3.5' />
              </Button>
            </div>
          ))
        )}
      </div>
      {/* 成员区 */}
      <div className='space-y-2'>
        {!activeWgId ? (
          <div className='rounded-lg border border-dashed bg-muted/20 p-12 text-center text-sm text-muted-foreground'>
            选择左侧一个工作组查看其成员
          </div>
        ) : (
          <>
            <div className='flex justify-end'>
              <Button size='sm' onClick={() => setAddMemberOpen(true)}>
                <Plus className='mr-1 h-4 w-4' /> 添加成员
              </Button>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>用户名</TableHead>
                  <TableHead>显示名</TableHead>
                  <TableHead>邮箱</TableHead>
                  <TableHead className='text-right'>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {wgMembers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className='text-muted-foreground text-center py-6'>
                      暂无成员
                    </TableCell>
                  </TableRow>
                ) : (
                  wgMembers.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className='font-medium'>{m.username}</TableCell>
                      <TableCell>{m.display_name || '—'}</TableCell>
                      <TableCell className='text-xs'>{m.email || '—'}</TableCell>
                      <TableCell className='text-right'>
                        <Button
                          size='sm'
                          variant='ghost'
                          className='text-destructive hover:text-destructive'
                          onClick={() => handleRemoveMember(m.id)}
                        >
                          <Trash2 className='h-3.5 w-3.5' />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </>
        )}
      </div>

      <CreateWorkGroupDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        enterpriseId={enterprise.id}
        onSuccess={() => {
          setCreateOpen(false)
          reload()
        }}
      />

      {activeWgId && (
        <AddWorkGroupMemberDialog
          open={addMemberOpen}
          onOpenChange={setAddMemberOpen}
          enterpriseId={enterprise.id}
          workgroupId={activeWgId}
          onSuccess={() => {
            setAddMemberOpen(false)
            reloadMembers(activeWgId)
          }}
        />
      )}
    </div>
  )
}

function CreateWorkGroupDialog({
  open,
  onOpenChange,
  enterpriseId,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  enterpriseId: number
  onSuccess: () => void
}) {
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')

  useEffect(() => {
    if (open) {
      setName('')
      setDesc('')
    }
  }, [open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      toast.error('请填写工作组名称')
      return
    }
    const res = await createWorkGroup(enterpriseId, {
      name: name.trim(),
      description: desc.trim(),
    })
    if (res.success) {
      toast.success('工作组已创建')
      onSuccess()
    } else toast.error(res.message || '创建失败')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>新建工作组</DialogTitle>
          <DialogDescription>填写工作组信息</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className='space-y-3'>
          <div className='space-y-1.5'>
            <Label htmlFor='wg-name'>名称</Label>
            <Input
              id='wg-name'
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className='space-y-1.5'>
            <Label htmlFor='wg-desc'>描述</Label>
            <Textarea
              id='wg-desc'
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              rows={2}
            />
          </div>
          <DialogFooter>
            <Button type='button' variant='outline' onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type='submit'>创建</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function AddWorkGroupMemberDialog({
  open,
  onOpenChange,
  enterpriseId,
  workgroupId,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  enterpriseId: number
  workgroupId: number
  onSuccess: () => void
}) {
  const [userId, setUserId] = useState('')

  useEffect(() => {
    if (open) setUserId('')
  }, [open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const uid = parseInt(userId, 10)
    if (!uid || uid <= 0) {
      toast.error('请输入有效的用户 ID')
      return
    }
    const res = await addWorkGroupMember(enterpriseId, workgroupId, uid)
    if (res.success) {
      toast.success('已加入工作组')
      onSuccess()
    } else toast.error(res.message || '添加失败')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>添加工作组成员</DialogTitle>
          <DialogDescription>
            该用户必须已在企业中。一个用户只能在一个工作组。
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className='space-y-3'>
          <div className='space-y-1.5'>
            <Label htmlFor='wgm-uid'>用户 ID</Label>
            <Input
              id='wgm-uid'
              type='number'
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              required
            />
          </div>
          <DialogFooter>
            <Button type='button' variant='outline' onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type='submit'>添加</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function LimitsTab({ enterprise }: { enterprise: Enterprise }) {
  const [limits, setLimits] = useState<EnterpriseLimit[]>([])
  const [workgroups, setWorkgroups] = useState<WorkGroup[]>([])
  const [createOpen, setCreateOpen] = useState(false)

  const reload = useCallback(async () => {
    const [lr, wr] = await Promise.all([
      listEnterpriseLimits(enterprise.id),
      listWorkGroups(enterprise.id),
    ])
    if (lr.success) setLimits(lr.data ?? [])
    if (wr.success) setWorkgroups(wr.data ?? [])
  }, [enterprise.id])

  useEffect(() => {
    reload()
  }, [reload])

  const handleDelete = async (id: number) => {
    const res = await deleteEnterpriseLimit(enterprise.id, id)
    if (res.success) {
      toast.success('已删除')
      reload()
    } else toast.error(res.message || '删除失败')
  }

  const handleToggleHard = async (l: EnterpriseLimit) => {
    const res = await updateEnterpriseLimit(enterprise.id, l.id, {
      enforce_hard: !l.enforce_hard,
    })
    if (res.success) reload()
    else toast.error(res.message || '更新失败')
  }

  return (
    <div className='space-y-3'>
      <div className='flex items-center justify-between'>
        <p className='text-muted-foreground text-xs'>
          额度按 quota 单位累计（500,000 = $1）。计数随消费实时累加，到周期边界自动清零。
        </p>
        <Button size='sm' onClick={() => setCreateOpen(true)}>
          <Plus className='mr-1 h-4 w-4' /> 新增限额
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>作用范围</TableHead>
            <TableHead>对象</TableHead>
            <TableHead>周期</TableHead>
            <TableHead>已用 / 上限</TableHead>
            <TableHead>类型</TableHead>
            <TableHead className='text-right'>操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {limits.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className='text-muted-foreground text-center py-6'>
                还没有限额规则
              </TableCell>
            </TableRow>
          ) : (
            limits.map((l) => {
              const scopeLabel =
                l.scope_type === 'enterprise'
                  ? '企业总额'
                  : l.scope_type === 'workgroup'
                    ? '工作组'
                    : '个人'
              const periodLabel = {
                daily: '日',
                monthly: '月',
                quarterly: '季度',
                total: '总额',
              }[l.period]
              const objectLabel =
                l.scope_type === 'enterprise'
                  ? '全企业'
                  : l.scope_type === 'workgroup'
                    ? workgroups.find((w) => w.id === l.scope_id)?.name ||
                      `WG #${l.scope_id}`
                    : `UID ${l.scope_id}`
              const pct =
                l.max_quota > 0
                  ? Math.min(100, (l.used_quota / l.max_quota) * 100).toFixed(0)
                  : '0'
              return (
                <TableRow key={l.id}>
                  <TableCell>{scopeLabel}</TableCell>
                  <TableCell className='text-xs'>{objectLabel}</TableCell>
                  <TableCell>{periodLabel}</TableCell>
                  <TableCell className='text-xs'>
                    {l.used_quota.toLocaleString()} /{' '}
                    {l.max_quota > 0 ? l.max_quota.toLocaleString() : '∞'}
                    <span className='text-muted-foreground ml-1'>({pct}%)</span>
                  </TableCell>
                  <TableCell>
                    <div className='flex items-center gap-2'>
                      <Switch
                        checked={l.enforce_hard}
                        onCheckedChange={() => handleToggleHard(l)}
                      />
                      <span className='text-xs'>
                        {l.enforce_hard ? (
                          <Badge variant='destructive'>硬限制</Badge>
                        ) : (
                          <Badge variant='secondary'>软告警</Badge>
                        )}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className='text-right'>
                    <Button
                      size='sm'
                      variant='ghost'
                      className='text-destructive hover:text-destructive'
                      onClick={() => handleDelete(l.id)}
                    >
                      <Trash2 className='h-3.5 w-3.5' />
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })
          )}
        </TableBody>
      </Table>

      <CreateLimitDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        enterpriseId={enterprise.id}
        workgroups={workgroups}
        onSuccess={() => {
          setCreateOpen(false)
          reload()
        }}
      />
    </div>
  )
}

function CreateLimitDialog({
  open,
  onOpenChange,
  enterpriseId,
  workgroups,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  enterpriseId: number
  workgroups: WorkGroup[]
  onSuccess: () => void
}) {
  const [scopeType, setScopeType] = useState<'enterprise' | 'workgroup' | 'member'>(
    'enterprise'
  )
  const [scopeId, setScopeId] = useState<string>('')
  const [period, setPeriod] = useState<'daily' | 'monthly' | 'quarterly' | 'total'>(
    'monthly'
  )
  const [maxQuota, setMaxQuota] = useState('')
  const [enforceHard, setEnforceHard] = useState(true)

  useEffect(() => {
    if (open) {
      setScopeType('enterprise')
      setScopeId('')
      setPeriod('monthly')
      setMaxQuota('')
      setEnforceHard(true)
    }
  }, [open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const max = parseInt(maxQuota, 10)
    if (!max || max <= 0) {
      toast.error('请填写有效的上限（quota 单位）')
      return
    }
    let resolvedScopeId = 0
    if (scopeType !== 'enterprise') {
      resolvedScopeId = parseInt(scopeId, 10)
      if (!resolvedScopeId) {
        toast.error('请选择/填写对象')
        return
      }
    }
    const res = await createEnterpriseLimit(enterpriseId, {
      scope_type: scopeType,
      scope_id: resolvedScopeId,
      period,
      max_quota: max,
      enforce_hard: enforceHard,
    })
    if (res.success) {
      toast.success('限额已创建')
      onSuccess()
    } else toast.error(res.message || '创建失败')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>新增限额规则</DialogTitle>
          <DialogDescription>选择作用范围、周期、上限和约束类型</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className='space-y-3'>
          <div className='space-y-1.5'>
            <Label>作用范围</Label>
            <Select
              value={scopeType}
              onValueChange={(v) =>
                v && setScopeType(v as 'enterprise' | 'workgroup' | 'member')
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value='enterprise'>企业总额（所有成员合计）</SelectItem>
                  <SelectItem value='workgroup'>某个工作组</SelectItem>
                  <SelectItem value='member'>某个成员（按用户 ID）</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          {scopeType === 'workgroup' && (
            <div className='space-y-1.5'>
              <Label>选择工作组</Label>
              <Select value={scopeId} onValueChange={(v) => v && setScopeId(v)}>
                <SelectTrigger>
                  <SelectValue placeholder='请选择' />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {workgroups.map((w) => (
                      <SelectItem key={w.id} value={String(w.id)}>
                        {w.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          )}

          {scopeType === 'member' && (
            <div className='space-y-1.5'>
              <Label>用户 ID</Label>
              <Input
                type='number'
                value={scopeId}
                onChange={(e) => setScopeId(e.target.value)}
                required
              />
            </div>
          )}

          <div className='space-y-1.5'>
            <Label>周期</Label>
            <Select
              value={period}
              onValueChange={(v) =>
                v && setPeriod(v as 'daily' | 'monthly' | 'quarterly' | 'total')
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value='daily'>每日（UTC+8 零点清零）</SelectItem>
                  <SelectItem value='monthly'>每月（1 号清零）</SelectItem>
                  <SelectItem value='quarterly'>每季度</SelectItem>
                  <SelectItem value='total'>总额（不清零）</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <div className='space-y-1.5'>
            <Label>上限额度（quota 单位，500,000 = $1）</Label>
            <Input
              type='number'
              value={maxQuota}
              onChange={(e) => setMaxQuota(e.target.value)}
              required
            />
          </div>

          <div className='flex items-center justify-between rounded-md border bg-muted/30 p-3'>
            <div className='text-xs'>
              <div className='font-medium'>
                {enforceHard ? '硬限制（超额拒绝请求）' : '软告警（仅记录，不拒绝）'}
              </div>
              <div className='text-muted-foreground mt-0.5'>
                可以随时切换
              </div>
            </div>
            <Switch checked={enforceHard} onCheckedChange={setEnforceHard} />
          </div>

          <DialogFooter>
            <Button type='button' variant='outline' onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type='submit'>创建</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

