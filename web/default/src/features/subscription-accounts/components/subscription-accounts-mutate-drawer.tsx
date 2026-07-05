import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { KeyRound, Network, Settings2, Shield } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { createSubscriptionAccount, updateSubscriptionAccount } from '../api'
import type { SubscriptionAccount } from '../types'
import { useSubscriptionAccounts } from './subscription-accounts-provider'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentRow?: SubscriptionAccount
}

type FormValues = {
  platform: string
  account_name: string
  email: string
  access_token: string
  refresh_token: string
  expires_at: string
  status: string
  usage_limit: number
  group_id: number
  proxy_url: string
  rpm: number
  max_concurrent: number
}

const PLATFORM_OPTIONS = [
  { value: 'claude', label: 'Claude' },
  { value: 'codex', label: 'Codex' },
  { value: 'gemini', label: 'Gemini' },
]

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'disabled', label: 'Disabled' },
]

export function SubscriptionAccountsMutateDrawer({
  open,
  onOpenChange,
  currentRow,
}: Props) {
  const { t } = useTranslation()
  const isEdit = !!currentRow?.id
  const { triggerRefresh } = useSubscriptionAccounts()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const form = useForm<FormValues>({
    defaultValues: {
      platform: 'claude',
      account_name: '',
      email: '',
      access_token: '',
      refresh_token: '',
      expires_at: '',
      status: 'active',
      usage_limit: 0,
      group_id: 0,
      proxy_url: '',
      rpm: 0,
      max_concurrent: 0,
    },
  })

  useEffect(() => {
    if (open) {
      if (currentRow) {
        form.reset({
          platform: currentRow.platform,
          account_name: currentRow.account_name,
          email: currentRow.email || '',
          access_token: '',
          refresh_token: '',
          expires_at: currentRow.expires_at
            ? new Date(currentRow.expires_at).toISOString().slice(0, 16)
            : '',
          status: currentRow.status,
          usage_limit: currentRow.usage_limit || 0,
          group_id: currentRow.group_id || 0,
          proxy_url: currentRow.proxy_url || '',
          rpm: currentRow.rpm || 0,
          max_concurrent: currentRow.max_concurrent || 0,
        })
      } else {
        form.reset({
          platform: 'claude',
          account_name: '',
          email: '',
          access_token: '',
          refresh_token: '',
          expires_at: '',
          status: 'active',
          usage_limit: 0,
          group_id: 0,
          proxy_url: '',
          rpm: 0,
          max_concurrent: 0,
        })
      }
    }
  }, [open, currentRow, form])

  const onSubmit = async (values: FormValues) => {
    setIsSubmitting(true)
    try {
      if (isEdit && currentRow) {
        const res = await updateSubscriptionAccount(currentRow.id, {
          account_name: values.account_name,
          status: values.status,
          usage_limit: values.usage_limit,
          group_id: values.group_id,
          proxy_url: values.proxy_url || undefined,
          rpm: values.rpm || undefined,
          max_concurrent: values.max_concurrent || undefined,
        })
        if (res.success) {
          toast.success(t('Update succeeded'))
          onOpenChange(false)
          triggerRefresh()
        } else {
          toast.error(res.message || t('Update failed'))
        }
      } else {
        const payload = {
          platform: values.platform,
          account_name: values.account_name,
          email: values.email || undefined,
          access_token: values.access_token,
          refresh_token: values.refresh_token || undefined,
          expires_at: values.expires_at || undefined,
          status: values.status,
          usage_limit: values.usage_limit || undefined,
          group_id: values.group_id || undefined,
          proxy_url: values.proxy_url || undefined,
          rpm: values.rpm || undefined,
          max_concurrent: values.max_concurrent || undefined,
        }
        const res = await createSubscriptionAccount(payload)
        if (res.success) {
          toast.success(t('Create succeeded'))
          onOpenChange(false)
          triggerRefresh()
        } else {
          toast.error(res.message || t('Create failed'))
        }
      }
    } catch {
      toast.error(t('Request failed'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v)
        if (!v) {
          form.reset()
        }
      }}
    >
      <SheetContent className='flex h-dvh w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-[600px]'>
        <SheetHeader className='border-b px-4 py-3 text-start sm:px-6 sm:py-4'>
          <SheetTitle>
            {isEdit ? t('Update Account') : t('Add Subscription Account')}
          </SheetTitle>
          <SheetDescription>
            {isEdit
              ? t('Modify subscription account info')
              : t('Fill in account credentials to add to the pool')}
          </SheetDescription>
        </SheetHeader>
        <Form {...form}>
          <form
            id='subscription-account-form'
            onSubmit={form.handleSubmit(onSubmit)}
            className='flex-1 space-y-4 overflow-y-auto px-3 py-3 pb-4 sm:space-y-6 sm:px-4'
          >
            {/* Basic Info */}
            <div className='space-y-4'>
              <h3 className='flex items-center gap-2 text-sm font-medium'>
                <Settings2 className='h-4 w-4' />
                {t('Basic Info')}
              </h3>

              {!isEdit && (
                <FormField
                  control={form.control}
                  name='platform'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Platform')}</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent alignItemWithTrigger={false}>
                          <SelectGroup>
                            {PLATFORM_OPTIONS.map((o) => (
                              <SelectItem key={o.value} value={o.value}>
                                {o.label}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name='account_name'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Account Name')}</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder={t('e.g. Claude Pro #1')} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='email'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Email')}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type='email'
                        placeholder={t('Account email (optional)')}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Credentials */}
            <div className='space-y-4'>
              <h3 className='flex items-center gap-2 text-sm font-medium'>
                <KeyRound className='h-4 w-4' />
                {t('Credentials')}
              </h3>

              {(!isEdit || true) && (
                <FormField
                  control={form.control}
                  name='access_token'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {isEdit ? t('Access Token (leave blank to keep)') : t('Access Token')}
                      </FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type='password'
                          placeholder={isEdit ? t('Leave blank to keep current') : t('sk-ant-api03-...')}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name='refresh_token'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Refresh Token')}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type='password'
                        placeholder={t('Optional refresh token')}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='expires_at'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Expires At')}</FormLabel>
                    <FormControl>
                      <Input {...field} type='datetime-local' />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Proxy */}
            <div className='space-y-4'>
              <h3 className='flex items-center gap-2 text-sm font-medium'>
                <Network className='h-4 w-4' />
                {t('Proxy')}
              </h3>

              <FormField
                control={form.control}
                name='proxy_url'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Proxy URL')}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder={t('socks5://user:pass@host:port or http://host:port')}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Limits */}
            <div className='space-y-4'>
              <h3 className='flex items-center gap-2 text-sm font-medium'>
                <Shield className='h-4 w-4' />
                {t('Limits & Status')}
              </h3>

              <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
                <FormField
                  control={form.control}
                  name='status'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Status')}</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent alignItemWithTrigger={false}>
                          <SelectGroup>
                            {STATUS_OPTIONS.map((o) => (
                              <SelectItem key={o.value} value={o.value}>
                                {o.label}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name='usage_limit'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Usage Limit')}</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type='number'
                          min={0}
                          onChange={(e) =>
                            field.onChange(parseFloat(e.target.value) || 0)
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
                <FormField
                  control={form.control}
                  name='rpm'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('RPM (0=unlimited)')}</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type='number'
                          min={0}
                          onChange={(e) =>
                            field.onChange(parseInt(e.target.value, 10) || 0)
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name='max_concurrent'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Max Concurrent (0=unlimited)')}</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type='number'
                          min={0}
                          onChange={(e) =>
                            field.onChange(parseInt(e.target.value, 10) || 0)
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name='group_id'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Group ID')}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type='number'
                        min={0}
                        onChange={(e) =>
                          field.onChange(parseInt(e.target.value, 10) || 0)
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </form>
        </Form>
        <SheetFooter className='grid grid-cols-2 gap-2 border-t px-4 py-3 sm:flex sm:px-6 sm:py-4'>
          <SheetClose render={<Button variant='outline' />}>
            {t('Close')}
          </SheetClose>
          <Button
            form='subscription-account-form'
            type='submit'
            disabled={isSubmitting}
          >
            {isSubmitting ? t('Saving...') : t('Save changes')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
