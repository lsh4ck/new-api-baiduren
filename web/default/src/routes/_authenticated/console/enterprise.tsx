import { createFileRoute } from '@tanstack/react-router'
import { Link } from '@tanstack/react-router'
import { ShieldAlert, ArrowLeft, Mail } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { EnterpriseConsolePage } from '@/features/console/EnterpriseConsolePage'
import { SectionPageLayout } from '@/components/layout'

function NoPermissionPage() {
  return (
    <SectionPageLayout>
      <SectionPageLayout.Content>
        <div className='mx-auto flex max-w-xl flex-col items-center px-4 py-16 text-center'>
          <div className='inline-flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-rose-500 text-white shadow-lg shadow-amber-500/30'>
            <ShieldAlert className='size-8' />
          </div>
          <h1 className='mt-5 text-2xl font-bold sm:text-3xl'>无访问权限</h1>
          <p className='mt-4 text-sm leading-relaxed text-foreground/60'>
            企业控制台仅对 <b className='text-foreground/90'>企业管理员</b> 开放，需要由<br className='hidden sm:inline' />
            平台管理员授予<b className='text-foreground/90'>企业管理员</b>角色后才能进入。
          </p>
          <div className='mt-6 w-full rounded-2xl border bg-muted/30 p-5 text-left text-sm'>
            <div className='mb-2 font-semibold text-foreground/80'>如何获取权限？</div>
            <ol className='ml-4 list-decimal space-y-1.5 text-foreground/60'>
              <li>联系平台管理员，提交开通申请</li>
              <li>提供企业名称、对接人、用量预估</li>
              <li>由管理员在「企业管理」页面创建企业并指派您为企业管理员</li>
              <li>权限生效后重新登录即可看到企业控制台</li>
            </ol>
          </div>
          <div className='mt-6 flex flex-wrap items-center justify-center gap-3'>
            <Link
              to='/console'
              className='inline-flex items-center gap-1.5 rounded-xl bg-foreground px-5 py-2.5 text-sm font-semibold text-background hover:opacity-90'
            >
              <ArrowLeft className='size-4' />
              返回个人控制台
            </Link>
            <Link
              to='/feedback'
              className='inline-flex items-center gap-1.5 rounded-xl border px-5 py-2.5 text-sm font-medium hover:bg-muted/50'
            >
              <Mail className='size-4' />
              联系管理员开通
            </Link>
          </div>
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}

function EnterpriseGate() {
  const user = useAuthStore((s) => s.auth?.user)
  const role = user?.role ?? 0
  const enterpriseAdminOf =
    (user as { enterprise_admin_of?: number } | null)?.enterprise_admin_of ?? 0
  // 平台管理员 (role >= 10) 或 企业管理员 (enterprise_admin_of > 0) 可访问
  if (role < 10 && enterpriseAdminOf === 0) {
    return <NoPermissionPage />
  }
  return <EnterpriseConsolePage />
}

export const Route = createFileRoute('/_authenticated/console/enterprise')({
  component: EnterpriseGate,
})
