import { useCallback, useEffect, useState } from 'react'
import { Copy, RotateCcw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'

const OPTION_KEY = 'billing_setting.dashscope_native_pricing'

const DEFAULT_TEMPLATE = {
  'happyhorse-1.1-r2v': {
    unit: 'video_second',
    prices: {
      '720p|16:9': 0,
      '720p': 0,
      default: 0,
    },
  },
  'cosyvoice-example': {
    unit: 'character',
    price: 0,
  },
  'asr-example': {
    unit: 'audio_second',
    price: 0,
  },
  'image-example': {
    unit: 'image',
    prices: {
      '1024*1024': 0,
      default: 0,
    },
  },
}

const UNITS = [
  ['video_second', 'Video seconds; reads parameters.duration'],
  ['video_task', 'One submitted video task/request'],
  ['request', 'One native request'],
  ['image', 'Image count; reads parameters.n or parameters.image_count'],
  ['character', 'Characters; reads input.text, input.prompt, or text'],
  ['audio_second', 'Audio seconds; reads duration/audio_seconds fields'],
  [
    'token_input_output',
    'Input/output token prices; settles only when the native response includes usage',
  ],
] as const

function formatJson(value: unknown) {
  return JSON.stringify(value, null, 2)
}

function normalizeJsonText(value: string | undefined) {
  const raw = (value ?? '').trim()
  if (!raw) return '{}'
  try {
    return formatJson(JSON.parse(raw))
  } catch {
    return raw
  }
}

type DashScopePricingSettingsProps = {
  defaultValue: string
}

export function DashScopePricingSettings({
  defaultValue,
}: DashScopePricingSettingsProps) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()
  const [jsonText, setJsonText] = useState(() => normalizeJsonText(defaultValue))
  const [jsonError, setJsonError] = useState('')

  useEffect(() => {
    setJsonText(normalizeJsonText(defaultValue))
    setJsonError('')
  }, [defaultValue])

  const validateJson = useCallback(
    (text: string) => {
      try {
        const parsed = JSON.parse(text) as unknown
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          setJsonError(t('JSON must be an object'))
          return false
        }
        setJsonError('')
        return true
      } catch (error) {
        setJsonError(error instanceof Error ? error.message : t('Invalid JSON'))
        return false
      }
    },
    [t]
  )

  const handleTextChange = useCallback(
    (value: string) => {
      setJsonText(value)
      validateJson(value)
    },
    [validateJson]
  )

  const handleSave = useCallback(async () => {
    if (!validateJson(jsonText)) {
      toast.error(t('Please fix JSON errors before saving'))
      return
    }
    await updateOption.mutateAsync({
      key: OPTION_KEY,
      value: JSON.stringify(JSON.parse(jsonText)),
    })
  }, [jsonText, t, updateOption, validateJson])

  const handleUseTemplate = useCallback(() => {
    const text = formatJson(DEFAULT_TEMPLATE)
    setJsonText(text)
    setJsonError('')
  }, [])

  const handleCopyTemplate = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(formatJson(DEFAULT_TEMPLATE))
      toast.success(t('Copied to clipboard'))
    } catch {
      toast.error(t('Failed to copy'))
    }
  }, [t])

  return (
    <SettingsSection
      title={t('DashScope Native Pricing')}
      description={t(
        'Configure opt-in official-unit pricing for Ali SDK / DashScope Native channels.'
      )}
    >
      <div className='space-y-4'>
        <Alert>
          <AlertDescription className='space-y-2 text-sm'>
            <p>
              {t(
                'Set billing_setting.billing_mode for the model to dashscope_native, then add its official-unit price here. Unconfigured models are rejected to avoid incorrect billing.'
              )}
            </p>
            <p>
              {t(
                'Use price for a flat official unit price, prices for tier keys such as resolution, quality, or resolution|ratio, and input_price/output_price for token_input_output.'
              )}
            </p>
          </AlertDescription>
        </Alert>

        <div className='grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]'>
          <div className='space-y-2'>
            <Textarea
              value={jsonText}
              onChange={(event) => handleTextChange(event.target.value)}
              className='min-h-[520px] font-mono text-sm'
              spellCheck={false}
            />
            {jsonError && (
              <p className='text-destructive text-sm'>{jsonError}</p>
            )}
          </div>

          <div className='space-y-4 rounded-md border p-4'>
            <div className='space-y-2'>
              <h4 className='text-sm font-medium'>{t('Supported units')}</h4>
              <div className='space-y-2'>
                {UNITS.map(([unit, hint]) => (
                  <div key={unit} className='space-y-1'>
                    <Badge variant='secondary'>{unit}</Badge>
                    <p className='text-muted-foreground text-xs'>{t(hint)}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className='space-y-2'>
              <h4 className='text-sm font-medium'>{t('Example structure')}</h4>
              <pre className='bg-muted max-h-72 overflow-auto rounded-md p-3 text-xs'>
                {formatJson(DEFAULT_TEMPLATE)}
              </pre>
            </div>

            <div className='flex flex-wrap gap-2'>
              <Button variant='outline' size='sm' onClick={handleUseTemplate}>
                <RotateCcw className='mr-2 h-4 w-4' />
                {t('Use template')}
              </Button>
              <Button variant='ghost' size='sm' onClick={handleCopyTemplate}>
                <Copy className='mr-2 h-4 w-4' />
                {t('Copy template')}
              </Button>
            </div>
          </div>
        </div>

        <div className='flex justify-end'>
          <Button
            onClick={handleSave}
            disabled={updateOption.isPending || !!jsonError}
          >
            {updateOption.isPending
              ? t('Saving...')
              : t('Save DashScope Native pricing')}
          </Button>
        </div>
      </div>
    </SettingsSection>
  )
}
