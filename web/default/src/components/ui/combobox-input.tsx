import * as React from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'

export type ComboboxInputOption = {
  value: string
  label: string
  icon?: React.ReactNode
}

interface ComboboxInputProps {
  options: ComboboxInputOption[]
  value?: string
  onValueChange: (value: string) => void
  placeholder?: string
  emptyText?: string
  className?: string
  id?: string
}

export function ComboboxInput({
  options,
  value = '',
  onValueChange,
  placeholder = 'Select or type...',
  emptyText = 'No option found.',
  className,
  id,
}: ComboboxInputProps) {
  const { t } = useTranslation()
  const [open, setOpen] = React.useState(false)
  const [typing, setTyping] = React.useState(false) // 用户是否正在输入搜索词
  const [query, setQuery] = React.useState('') // 搜索词（与选中值分离）
  const [highlightedIndex, setHighlightedIndex] = React.useState(-1)
  const containerRef = React.useRef<HTMLDivElement>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const listRef = React.useRef<HTMLUListElement>(null)

  // 选中项：用于把"编号 value"显示成"名称 label"
  const selectedOption = React.useMemo(
    () => options.find((option) => option.value === value),
    [options, value]
  )
  // 输入框显示的文字：正在搜索时显示搜索词，否则显示选中项的名称（无匹配则回退原值）
  const displayValue = typing ? query : (selectedOption?.label ?? value)

  const filteredOptions = React.useMemo(() => {
    // 未输入搜索词时（刚聚焦/已选中）显示全部，方便浏览完整列表
    if (!typing || !query.trim()) return options
    const search = query.toLowerCase().trim()
    return options.filter(
      (option) =>
        option.label.toLowerCase().includes(search) ||
        option.value.toLowerCase().includes(search)
    )
  }, [options, query, typing])

  // Reset highlight when filtered options change
  React.useEffect(() => {
    setHighlightedIndex(-1)
  }, [filteredOptions])

  // Handle click outside to close
  React.useEffect(() => {
    if (!open) return

    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
        setTyping(false)
        setQuery('')
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const handleSelect = (selectedValue: string) => {
    onValueChange(selectedValue)
    setOpen(false)
    setTyping(false)
    setQuery('')
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setOpen(true)
      return
    }

    if (!open) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setHighlightedIndex((prev) =>
          prev < filteredOptions.length - 1 ? prev + 1 : 0
        )
        break
      case 'ArrowUp':
        e.preventDefault()
        setHighlightedIndex((prev) =>
          prev > 0 ? prev - 1 : filteredOptions.length - 1
        )
        break
      case 'Enter':
        e.preventDefault()
        if (highlightedIndex >= 0 && filteredOptions[highlightedIndex]) {
          handleSelect(filteredOptions[highlightedIndex].value)
        } else if (typing && query.trim()) {
          // 用户输入了自定义值，回车采用
          handleSelect(query.trim())
        } else {
          setOpen(false)
          setTyping(false)
          setQuery('')
        }
        break
      case 'Escape':
        e.preventDefault()
        setOpen(false)
        setTyping(false)
        setQuery('')
        break
    }
  }

  // Scroll highlighted item into view
  React.useEffect(() => {
    if (highlightedIndex < 0 || !listRef.current) return
    const item = listRef.current.children[highlightedIndex] as HTMLElement
    item?.scrollIntoView({ block: 'nearest' })
  }, [highlightedIndex])

  const showDropdown = open && (filteredOptions.length > 0 || (typing && query.trim()))

  return (
    <div ref={containerRef} className='relative'>
      <Input
        ref={inputRef}
        id={id}
        type='text'
        role='combobox'
        aria-expanded={open}
        aria-haspopup='listbox'
        aria-autocomplete='list'
        autoComplete='off'
        placeholder={placeholder}
        value={displayValue}
        onChange={(e) => {
          setQuery(e.target.value)
          setTyping(true)
          if (!open) setOpen(true)
        }}
        onFocus={(e) => {
          setOpen(true)
          e.target.select()
        }}
        onKeyDown={handleKeyDown}
        className={cn('pr-9', className)}
      />
      <ChevronsUpDown className='pointer-events-none absolute top-1/2 right-3 size-4 shrink-0 -translate-y-1/2 opacity-50' />

      {showDropdown && (
        <div className='bg-popover text-popover-foreground absolute top-full z-100 mt-1 w-full rounded-md border shadow-md'>
          {filteredOptions.length > 0 ? (
            <ul
              ref={listRef}
              role='listbox'
              className='max-h-[200px] overflow-y-auto p-1'
            >
              {filteredOptions.map((option, index) => (
                <li
                  key={option.value}
                  role='option'
                  aria-selected={value === option.value}
                  data-highlighted={index === highlightedIndex}
                  className={cn(
                    'relative flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm select-none',
                    index === highlightedIndex &&
                      'bg-accent text-accent-foreground',
                    value === option.value && 'font-medium'
                  )}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  onMouseDown={(e) => {
                    e.preventDefault() // Prevent blur
                    handleSelect(option.value)
                  }}
                >
                  <Check
                    className={cn(
                      'size-4 shrink-0',
                      value === option.value ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  {option.icon && <span>{option.icon}</span>}
                  <span className='truncate'>{option.label}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className='px-2 py-6 text-center text-sm'>
              {emptyText}
              {typing && query.trim() && (
                <div className='text-muted-foreground mt-1 text-xs'>
                  {t('Press Enter to use "{{value}}"', { value: query.trim() })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
