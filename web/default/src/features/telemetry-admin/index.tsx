// 摆渡人 · https://apiai.xin —— 部署监控(探针明细·仅管理员)。
// 公开页 /api/telemetry 只显示聚合数；这里给管理员看每个部署的 IP/域名/实例ID 等细节。
import { useEffect, useState } from 'react'
import { RefreshCw, Server } from 'lucide-react'
import { api } from '@/lib/api'

type Dep = {
  id: number
  instance_id: string
  product: string
  domain: string
  ip: string
  version: string
  first_seen: number
  last_seen: number
  beacon_count: number
}

function fmt(unix: number) {
  if (!unix) return '-'
  return new Date(unix * 1000).toLocaleString('zh-CN', { hour12: false })
}

export function TelemetryAdmin() {
  const [rows, setRows] = useState<Dep[]>([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const res = await api.get('/api/telemetry/deployments')
      setRows(res.data?.data ?? [])
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    load()
  }, [])

  const now = Date.now() / 1000
  const active = rows.filter((r) => now - r.last_seen < 30 * 86400).length

  return (
    <div className='p-4 md:p-6'>
      <div className='mb-4 flex items-center justify-between gap-3'>
        <div>
          <h1 className='flex items-center gap-2 text-lg font-semibold'>
            <Server className='size-5 text-emerald-500' /> 部署监控 · 探针
          </h1>
          <p className='mt-1 text-xs text-muted-foreground'>
            自托管实例统计明细（含公开页不显示的 IP / 域名 / 实例ID）。共 {rows.length} 个部署，近 30 天活跃 {active} 个。
          </p>
        </div>
        <button
          onClick={load}
          className='inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted'
        >
          <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} /> 刷新
        </button>
      </div>
      <div className='overflow-x-auto rounded-xl border border-border'>
        <table className='w-full min-w-[840px] text-left text-sm'>
          <thead className='text-[11px] uppercase tracking-wide text-muted-foreground'>
            <tr className='border-b border-border'>
              <th className='px-4 py-3'>产品</th>
              <th className='px-4 py-3'>域名</th>
              <th className='px-4 py-3'>公网 IP</th>
              <th className='px-4 py-3'>版本</th>
              <th className='px-4 py-3'>实例 ID</th>
              <th className='px-4 py-3'>首次上报</th>
              <th className='px-4 py-3'>最近上报</th>
              <th className='px-4 py-3'>次数</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isActive = now - r.last_seen < 7 * 86400
              return (
                <tr key={r.id} className='border-b border-border/50 hover:bg-muted/40'>
                  <td className='px-4 py-3'>
                    <span className='inline-flex items-center gap-1.5 font-medium'>
                      <span className={`size-2 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`} />
                      {r.product}
                    </span>
                  </td>
                  <td className='max-w-[220px] truncate px-4 py-3'>
                    <a href={r.domain} target='_blank' rel='noreferrer' className='text-sky-500 hover:underline'>
                      {r.domain || '-'}
                    </a>
                  </td>
                  <td className='px-4 py-3 font-mono'>{r.ip}</td>
                  <td className='px-4 py-3 font-mono text-xs'>{r.version}</td>
                  <td className='px-4 py-3 font-mono text-[11px] text-muted-foreground'>{r.instance_id?.slice(0, 12)}…</td>
                  <td className='px-4 py-3 text-xs text-muted-foreground'>{fmt(r.first_seen)}</td>
                  <td className='px-4 py-3 text-xs'>{fmt(r.last_seen)}</td>
                  <td className='px-4 py-3 font-mono'>{r.beacon_count}</td>
                </tr>
              )
            })}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={8} className='px-4 py-10 text-center text-muted-foreground'>
                  暂无部署上报
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
