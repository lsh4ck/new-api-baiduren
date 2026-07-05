import { useEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, XCircle, Ban, RefreshCw, Download } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { toast } from 'sonner'
import { enterpriseApi, type AuditLog } from '../enterprise-api'
import { format } from 'date-fns'

function ResultBadge({ result }: { result: string }) {
  const { t } = useTranslation()
  if (result === 'success') return <Badge className='bg-green-500/20 text-green-700 dark:text-green-400'>{t('Success')}</Badge>
  if (result === 'failure') return <Badge className='bg-red-500/20 text-red-700 dark:text-red-400'>{t('Failure')}</Badge>
  return <Badge className='bg-amber-500/20 text-amber-700 dark:text-amber-400'>{t('Denied')}</Badge>
}

export function EnterpriseAuditLogs() {
  const { t } = useTranslation()
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [resultFilter, setResultFilter] = useState('all')
  const [eventFilter, setEventFilter] = useState('all')

  const successCount = logs.filter(l => l.result === 'success').length
  const failureCount = logs.filter(l => l.result === 'failure').length
  const deniedCount = logs.filter(l => l.result === 'denied').length

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await enterpriseApi.getAuditLogs(
        1, 100,
        eventFilter === 'all' ? '' : eventFilter,
        resultFilter === 'all' ? '' : resultFilter,
      )
      setLogs(res.data || [])
      setTotal(res.total || 0)
    } catch {
      toast.error(t('Failed to load audit logs'))
    } finally {
      setLoading(false)
    }
  }, [eventFilter, resultFilter, t])

  useEffect(() => { load() }, [load])

  return (
    <div className='space-y-4'>
      <div className='grid gap-4 sm:grid-cols-3'>
        {[
          { icon: <CheckCircle2 className='size-5 text-green-500' />, count: successCount, label: t('Success') },
          { icon: <XCircle className='size-5 text-red-500' />, count: failureCount, label: t('Failures') },
          { icon: <Ban className='size-5 text-amber-500' />, count: deniedCount, label: t('Denied') },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className='flex items-center gap-3 pt-5'>
              {s.icon}
              <div>
                <div className='text-2xl font-bold'>{s.count}</div>
                <div className='text-sm text-muted-foreground'>{s.label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className='flex flex-wrap items-center gap-2'>
        <Select value={eventFilter} onValueChange={setEventFilter}>
          <SelectTrigger className='w-44'>
            <SelectValue placeholder={t('Event type')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>{t('All Events')}</SelectItem>
            <SelectItem value='api_key'>api_key.*</SelectItem>
            <SelectItem value='member'>member.*</SelectItem>
            <SelectItem value='workspace'>workspace.*</SelectItem>
          </SelectContent>
        </Select>
        <Select value={resultFilter} onValueChange={setResultFilter}>
          <SelectTrigger className='w-36'>
            <SelectValue placeholder={t('Result')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>{t('All Results')}</SelectItem>
            <SelectItem value='success'>{t('Success')}</SelectItem>
            <SelectItem value='failure'>{t('Failure')}</SelectItem>
            <SelectItem value='denied'>{t('Denied')}</SelectItem>
          </SelectContent>
        </Select>
        <Button variant='outline' size='sm' onClick={load} disabled={loading}>
          <RefreshCw className={`mr-1 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          {t('Refresh')}
        </Button>
        <Button
          variant='outline'
          size='sm'
          onClick={() => {
            const a = document.createElement('a')
            a.href = enterpriseApi.exportUrls.auditLogs
            a.download = ''
            document.body.appendChild(a)
            a.click()
            a.remove()
          }}
        >
          <Download className='mr-1 h-4 w-4' />
          {t('导出 CSV')}
        </Button>
        <span className='text-muted-foreground ml-auto text-xs'>{t('Total')}: {total}</span>
      </div>

      <Card>
        <CardContent className='p-0'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('Time')}</TableHead>
                <TableHead>{t('Actor')}</TableHead>
                <TableHead>{t('Event')}</TableHead>
                <TableHead>{t('Resource')}</TableHead>
                <TableHead>{t('Result')}</TableHead>
                <TableHead>{t('IP')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className='text-muted-foreground py-8 text-center text-sm'>{t('Loading...')}</TableCell>
                </TableRow>
              ) : logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className='text-muted-foreground py-8 text-center text-sm'>{t('No audit logs yet')}</TableCell>
                </TableRow>
              ) : (
                logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className='text-muted-foreground text-xs'>
                      {format(new Date(log.created_at * 1000), 'MM-dd HH:mm')}
                    </TableCell>
                    <TableCell>
                      <div className='font-medium'>{log.actor_name}</div>
                      <div className='text-muted-foreground text-xs'>{log.actor_email}</div>
                    </TableCell>
                    <TableCell>
                      <code className='bg-muted rounded px-1.5 py-0.5 text-xs'>{log.event_type}</code>
                    </TableCell>
                    <TableCell className='text-muted-foreground text-sm'>
                      {log.resource}{log.resource_id ? `#${log.resource_id}` : ''}
                    </TableCell>
                    <TableCell><ResultBadge result={log.result} /></TableCell>
                    <TableCell className='font-mono text-xs'>{log.ip}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
