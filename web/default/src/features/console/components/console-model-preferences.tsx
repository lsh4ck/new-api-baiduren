import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Star, StarOff, GripVertical, Layers3 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { mockModelPreferences, CHANNEL_NAMES as ALL_CHANNELS } from '../lib/mock-data'
import { formatRelativeTime } from '../lib/utils'

// ─── 模型偏好列表 ───

function ModelPreferencesList() {
  const { t } = useTranslation()
  const [models, setModels] = useState(mockModelPreferences)

  const toggleFavorite = (id: string) => {
    setModels((prev) =>
      prev.map((m) => (m.id === id ? { ...m, isFavorite: !m.isFavorite } : m))
    )
    const model = models.find((m) => m.id === id)
    if (model) {
      toast.success(
        model.isFavorite ? t('Removed from favorites') : t('Added to favorites')
      )
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('Model Preferences')}</CardTitle>
        <CardDescription>{t('Manage your favorite models for quick access')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className='space-y-2'>
          {models.map((model) => (
            <div
              key={model.id}
              className='flex items-center justify-between rounded-lg border px-3 py-2.5 transition-colors hover:bg-muted/50'
            >
              <div className='flex items-center gap-3'>
                <GripVertical className='size-4 cursor-grab text-muted-foreground' />
                <div>
                  <div className='font-mono text-sm font-medium'>{model.name}</div>
                  <div className='text-xs text-muted-foreground'>
                    {model.usageCount} {t('calls this month')}
                  </div>
                </div>
              </div>
              <Button
                variant='ghost'
                size='icon'
                className='size-8'
                onClick={() => toggleFavorite(model.id)}
              >
                {model.isFavorite ? (
                  <Star className='size-4 fill-amber-400 text-amber-400' />
                ) : (
                  <StarOff className='size-4 text-muted-foreground' />
                )}
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// ─── 渠道偏好 ───

function ChannelPreferences() {
  const { t } = useTranslation()
  const [preferredLayers3, setPreferredLayers3] = useState(
    ALL_CHANNELS.map((ch, i) => ({
      name: ch,
      enabled: i < 4, // 默认启用前4个
      priority: i + 1,
    }))
  )

  const toggleChannel = (name: string) => {
    setPreferredLayers3((prev) =>
      prev.map((ch) => (ch.name === name ? { ...ch, enabled: !ch.enabled } : ch))
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('Channel Preferences')}</CardTitle>
        <CardDescription>{t('Select preferred API channels for routing')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className='space-y-3'>
          {preferredLayers3.map((ch, i) => (
            <div key={ch.name} className='flex items-center justify-between'>
              <div className='flex items-center gap-3'>
                <Layers3 className='size-4 text-muted-foreground' />
                <div>
                  <span className='text-sm font-medium'>{ch.name}</span>
                  <div className='text-xs text-muted-foreground'>
                    {t('Priority')}: {ch.priority}
                  </div>
                </div>
              </div>
              <div className='flex items-center gap-2'>
                <Switch checked={ch.enabled} onCheckedChange={() => toggleChannel(ch.name)} />
                <Label className='sr-only'>{ch.name}</Label>
              </div>
            </div>
          ))}
        </div>

        <Separator className='my-4' />

        <div className='flex flex-wrap gap-2'>
          {preferredLayers3
            .filter((c) => c.enabled)
            .map((c) => (
              <Badge key={c.name} variant='secondary'>
                {c.name}
              </Badge>
            ))}
        </div>
      </CardContent>
    </Card>
  )
}

// ─── 主组件 ───

export function ConsoleModelPreferences() {
  return (
    <div className='space-y-4'>
      <ModelPreferencesList />
      <ChannelPreferences />
    </div>
  )
}
