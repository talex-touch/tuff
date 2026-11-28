import type {
  ChangeEvent,
  CSSProperties,
  DragEvent,
  HTMLAttributes,
  KeyboardEvent,
  ReactNode,
} from 'react'
import { hasDocument, hasNavigator } from '@talex-touch/tuffex-core'
import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { useControllableState } from '../../hooks/useControllableState'
import { allocateZIndex, trapFocusInContainer, useDismissableLayer, useFocusReturn } from '../../hooks/useDismissableLayer'
import { useFloatingPosition } from '../../hooks/useFloating'
import { cn, mergeRefs } from '../../utils/cn'
import { BuiltinIcon } from '../../utils/icons'
import { TxInput } from '../TxInput'

// ============================================================================
// 29. TxFileUploader (file-uploader)
// ============================================================================

export interface TxFileUploaderFile {
  id: string
  name: string
  size: number
  type: string
  file: File
}

export interface TxFileUploaderProps extends Omit<HTMLAttributes<HTMLDivElement>, 'defaultValue' | 'onChange'> {
  value?: TxFileUploaderFile[]
  defaultValue?: TxFileUploaderFile[]
  multiple?: boolean
  accept?: string
  disabled?: boolean
  max?: number
  showSize?: boolean
  allowDrop?: boolean
  buttonText?: string
  dropText?: string
  hintText?: string
  onChange?: (files: TxFileUploaderFile[]) => void
  onAdd?: (added: TxFileUploaderFile[]) => void
  onRemove?: (payload: { id: string, value: TxFileUploaderFile[] }) => void
}

let uploadIdCounter = 0

function createUploadId(prefix: string): string {
  uploadIdCounter += 1
  return `${prefix}-${Date.now()}-${uploadIdCounter}`
}

function formatByteSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0)
    return '0 B'
  if (bytes < 1024)
    return `${bytes} B`
  if (bytes < 1024 * 1024)
    return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export const TxFileUploader = forwardRef<HTMLDivElement, TxFileUploaderProps>((
  {
    value,
    defaultValue = [],
    multiple = false,
    accept,
    disabled = false,
    max,
    showSize = true,
    allowDrop = true,
    buttonText = 'Choose files',
    dropText = 'Drag files here or click to upload',
    hintText,
    onChange,
    onAdd,
    onRemove,
    className,
    style,
    ...rest
  },
  ref,
) => {
  const [files, setFiles] = useControllableState<TxFileUploaderFile[]>({
    value,
    defaultValue,
    onChange,
  })
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const addFileList = useCallback((fileList: FileList | File[]) => {
    if (disabled)
      return
    const incoming = Array.from(fileList)
    if (incoming.length === 0)
      return
    const room = max !== undefined ? Math.max(0, max - files.length) : incoming.length
    const allowed = incoming.slice(0, multiple ? room : Math.min(1, room))
    if (allowed.length === 0)
      return
    const created: TxFileUploaderFile[] = allowed.map(file => ({
      id: createUploadId('file'),
      name: file.name,
      size: file.size,
      type: file.type,
      file,
    }))
    const next = multiple ? [...files, ...created] : created
    setFiles(next)
    onAdd?.(created)
  }, [disabled, files, max, multiple, onAdd, setFiles])

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files)
      addFileList(event.target.files)
    event.target.value = ''
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragging(false)
    if (!allowDrop || disabled)
      return
    if (event.dataTransfer?.files)
      addFileList(event.dataTransfer.files)
  }

  const removeFile = (id: string) => {
    if (disabled)
      return
    const next = files.filter(f => f.id !== id)
    setFiles(next)
    onRemove?.({ id, value: next })
  }

  return (
    <div ref={ref} className={cn('tx-file-uploader', { 'is-disabled': disabled }, className)} style={style} {...rest}>
      <input
        ref={inputRef}
        type="file"
        className="tx-file-uploader__input"
        multiple={multiple}
        accept={accept}
        disabled={disabled}
        tabIndex={-1}
        aria-hidden="true"
        onChange={handleInputChange}
      />

      {allowDrop
        ? (
            <div
              className={cn('tx-file-uploader__drop', { 'is-dragging': dragging, 'is-disabled': disabled })}
              onDragOver={(e) => {
                e.preventDefault()
                if (!disabled)
                  setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
            >
              <div className="tx-file-uploader__drop-title">{dropText}</div>
              {hintText && <div className="tx-file-uploader__drop-hint">{hintText}</div>}
              <button
                type="button"
                className="tx-file-uploader__button"
                disabled={disabled}
                onClick={() => inputRef.current?.click()}
              >
                {buttonText}
              </button>
            </div>
          )
        : (
            <button
              type="button"
              className="tx-file-uploader__button"
              disabled={disabled}
              onClick={() => inputRef.current?.click()}
            >
              {buttonText}
            </button>
          )}

      {files.length > 0 && (
        <ul className="tx-file-uploader__list">
          {files.map(file => (
            <li key={file.id} className="tx-file-uploader__item">
              <div className="tx-file-uploader__meta">
                <span className="tx-file-uploader__name">{file.name}</span>
                {showSize && <span className="tx-file-uploader__size">{formatByteSize(file.size)}</span>}
              </div>
              <button
                type="button"
                className="tx-file-uploader__remove"
                aria-label={`Remove ${file.name}`}
                disabled={disabled}
                onClick={() => removeFile(file.id)}
              >
                <BuiltinIcon name="close" size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
})
TxFileUploader.displayName = 'TxFileUploader'

// ============================================================================
// 30. TxImageUploader (image-uploader)
// ============================================================================

export interface TxImageUploaderFile {
  id: string
  url: string
  name?: string
  file?: File
}

export interface TxImageUploaderProps extends Omit<HTMLAttributes<HTMLDivElement>, 'defaultValue' | 'onChange'> {
  value?: TxImageUploaderFile[]
  defaultValue?: TxImageUploaderFile[]
  multiple?: boolean
  accept?: string
  disabled?: boolean
  max?: number
  uploadText?: string
  removeLabel?: (name?: string) => string
  onChange?: (files: TxImageUploaderFile[]) => void
  onRemove?: (payload: { id: string, value: TxImageUploaderFile[] }) => void
}

function createPreviewUrl(file: File): string {
  if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function')
    return URL.createObjectURL(file)
  return `data:${file.type || 'image/png'};base64,`
}

export const TxImageUploader = forwardRef<HTMLDivElement, TxImageUploaderProps>((
  {
    value,
    defaultValue = [],
    multiple = true,
    accept = 'image/*',
    disabled = false,
    max,
    uploadText = 'Upload',
    removeLabel = (name?: string) => name ? `Remove ${name}` : 'Remove image',
    onChange,
    onRemove,
    className,
    style,
    ...rest
  },
  ref,
) => {
  const [items, setItems] = useControllableState<TxImageUploaderFile[]>({
    value,
    defaultValue,
    onChange,
  })
  const inputRef = useRef<HTMLInputElement | null>(null)

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (disabled || !event.target.files)
      return
    const incoming = Array.from(event.target.files)
    const room = max !== undefined ? Math.max(0, max - items.length) : incoming.length
    const allowed = incoming.slice(0, multiple ? room : Math.min(1, room))
    if (allowed.length > 0) {
      const created: TxImageUploaderFile[] = allowed.map(file => ({
        id: createUploadId('img'),
        url: createPreviewUrl(file),
        name: file.name,
        file,
      }))
      setItems(multiple ? [...items, ...created] : created)
    }
    event.target.value = ''
  }

  const removeAt = (id: string) => {
    if (disabled)
      return
    const next = items.filter(item => item.id !== id)
    setItems(next)
    onRemove?.({ id, value: next })
  }

  const canAdd = !disabled && (max === undefined || items.length < max)

  return (
    <div
      ref={ref}
      className={cn('tx-image-uploader', { 'tx-image-uploader--disabled': disabled }, className)}
      style={style}
      {...rest}
    >
      <input
        ref={inputRef}
        type="file"
        className="tx-image-uploader__input"
        multiple={multiple}
        accept={accept}
        disabled={disabled}
        tabIndex={-1}
        aria-hidden="true"
        onChange={handleInputChange}
      />

      <div className="tx-image-uploader__grid">
        {items.map(item => (
          <div key={item.id} className="tx-image-uploader__item">
            <img src={item.url} alt={item.name ?? 'Uploaded image'} className="tx-image-uploader__img" />
            <button
              type="button"
              className="tx-image-uploader__remove"
              aria-label={removeLabel(item.name)}
              disabled={disabled}
              onClick={() => removeAt(item.id)}
            >
              <BuiltinIcon name="close" size={12} />
            </button>
          </div>
        ))}

        {canAdd && (
          <button
            type="button"
            className="tx-image-uploader__add"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
          >
            <BuiltinIcon name="plus" size={18} />
            <span className="tx-image-uploader__add-text">{uploadText}</span>
          </button>
        )}
      </div>
    </div>
  )
})
TxImageUploader.displayName = 'TxImageUploader'

// ============================================================================
// 32. TxImagePreview (image-preview) — declared before TxImageGallery
// ============================================================================

export type TxImagePreviewAction = 'rotate' | 'copy' | 'share' | 'download'
export type TxImagePreviewIndicator = 'thumbnails' | 'dots' | 'none'

export interface TxImagePreviewItem {
  type?: 'image' | 'custom'
  url?: string
  name?: string
  alt?: string
  thumbnail?: string
  width?: number
  height?: number
}

export type TxImagePreviewSource = string | TxImagePreviewItem

export interface TxImagePreviewActionEvent {
  action: TxImagePreviewAction
  index: number
  item: TxImagePreviewItem
  preventDefault: () => void
  readonly defaultPrevented: boolean
}

export interface TxImagePreviewProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onError'> {
  open?: boolean
  visible?: boolean
  defaultOpen?: boolean
  index?: number
  defaultIndex?: number
  images?: readonly TxImagePreviewSource[]
  items?: readonly TxImagePreviewSource[]
  maxScale?: number
  failed?: ReadonlySet<string> | readonly string[]
  actions?: readonly TxImagePreviewAction[]
  indicator?: TxImagePreviewIndicator
  label?: string
  closeLabel?: string
  previousLabel?: string
  nextLabel?: string
  zoomInLabel?: string
  zoomOutLabel?: string
  resetLabel?: string
  rotateLabel?: string
  copyLabel?: string
  shareLabel?: string
  downloadLabel?: string
  failedText?: string
  counterFormatter?: (current: number, total: number) => string
  scaleFormatter?: (scale: number) => string
  renderItem?: (ctx: { item: TxImagePreviewItem, index: number, scale: number, turns: number }) => ReactNode
  onOpenChange?: (open: boolean) => void
  onIndexChange?: (index: number) => void
  onClose?: () => void
  onError?: (url: string, index: number) => void
  onAction?: (event: TxImagePreviewActionEvent) => void
}

function normalizePreviewSource(source: TxImagePreviewSource): TxImagePreviewItem {
  return typeof source === 'string' ? { type: 'image', url: source } : source
}

export const TxImagePreview = forwardRef<HTMLDivElement, TxImagePreviewProps>((
  {
    open,
    visible,
    defaultOpen = false,
    index,
    defaultIndex = 0,
    images,
    items,
    maxScale = 4,
    failed,
    actions = ['rotate', 'copy', 'download'],
    indicator = 'thumbnails',
    label = 'Image preview',
    closeLabel = 'Close',
    previousLabel = 'Previous image',
    nextLabel = 'Next image',
    zoomInLabel = 'Zoom in',
    zoomOutLabel = 'Zoom out',
    resetLabel = 'Fit to screen',
    rotateLabel = 'Rotate',
    copyLabel = 'Copy image',
    shareLabel = 'Share',
    downloadLabel = 'Download',
    failedText = 'This image could not be loaded',
    counterFormatter = (current, total) => `${current} / ${total}`,
    scaleFormatter = scale => `${Math.round(scale * 100)}%`,
    renderItem,
    onOpenChange,
    onIndexChange,
    onClose,
    onError,
    onAction,
    className,
    style,
    ...rest
  },
  ref,
) => {
  const [isOpen, setIsOpen] = useControllableState({
    value: open ?? visible,
    defaultValue: defaultOpen,
    onChange: (next) => {
      onOpenChange?.(next)
      if (!next)
        onClose?.()
    },
  })
  const [currentIndex, setCurrentIndex] = useControllableState<number>({
    value: index,
    defaultValue: defaultIndex,
    onChange: onIndexChange,
  })
  const [scale, setScale] = useState(1)
  const [turns, setTurns] = useState(0)
  const [mounted, setMounted] = useState(false)
  const [erroredUrls, setErroredUrls] = useState<Record<string, boolean>>({})
  const overlayRef = useRef<HTMLDivElement | null>(null)
  const zIndexRef = useRef(allocateZIndex())

  useEffect(() => {
    setMounted(true)
  }, [])

  const list = useMemo<TxImagePreviewItem[]>(
    () => (items ?? images ?? []).map(normalizePreviewSource),
    [images, items],
  )
  const total = list.length
  const safeIndex = total > 0 ? Math.min(total - 1, Math.max(0, currentIndex)) : 0
  const currentItem = list[safeIndex]

  const failedSet = useMemo(() => {
    if (!failed)
      return new Set<string>()
    return failed instanceof Set ? failed : new Set<string>(failed)
  }, [failed])

  useEffect(() => {
    setScale(1)
    setTurns(0)
  }, [safeIndex, isOpen])

  useFocusReturn(isOpen, overlayRef)

  const goPrev = useCallback(() => {
    if (total <= 1)
      return
    setCurrentIndex((safeIndex - 1 + total) % total)
  }, [safeIndex, setCurrentIndex, total])

  const goNext = useCallback(() => {
    if (total <= 1)
      return
    setCurrentIndex((safeIndex + 1) % total)
  }, [safeIndex, setCurrentIndex, total])

  const zoomIn = useCallback(() => setScale(s => Math.min(maxScale, Number((s + 0.25).toFixed(2)))), [maxScale])
  const zoomOut = useCallback(() => setScale(s => Math.max(0.25, Number((s - 0.25).toFixed(2)))), [])
  const resetView = useCallback(() => {
    setScale(1)
    setTurns(0)
  }, [])
  const rotate = useCallback(() => setTurns(t => (t + 1) % 4), [])

  useEffect(() => {
    if (!isOpen || !hasDocument())
      return
    const handleKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setIsOpen(false)
      }
      else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        goPrev()
      }
      else if (event.key === 'ArrowRight') {
        event.preventDefault()
        goNext()
      }
      else if (event.key === '+' || event.key === '=') {
        event.preventDefault()
        zoomIn()
      }
      else if (event.key === '-') {
        event.preventDefault()
        zoomOut()
      }
      else if (event.key === '0') {
        event.preventDefault()
        resetView()
      }
      else if (event.key === 'r' || event.key === 'R') {
        event.preventDefault()
        rotate()
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [goNext, goPrev, isOpen, resetView, rotate, setIsOpen, zoomIn, zoomOut])

  const runAction = (action: TxImagePreviewAction) => {
    if (!currentItem)
      return
    let defaultPrevented = false
    const evt: TxImagePreviewActionEvent = {
      action,
      index: safeIndex,
      item: currentItem,
      preventDefault: () => {
        defaultPrevented = true
      },
      get defaultPrevented() {
        return defaultPrevented
      },
    }
    onAction?.(evt)
    if (defaultPrevented)
      return
    if (action === 'rotate') {
      rotate()
    }
    else if (action === 'copy' && currentItem.url && hasNavigator() && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(currentItem.url)
    }
  }

  if (!mounted || !isOpen || !hasDocument() || !currentItem)
    return null

  const isFailed = Boolean(currentItem.url && (failedSet.has(currentItem.url) || erroredUrls[currentItem.url]))
  const dialogLabel = currentItem.name ? `${label}: ${currentItem.name}` : label

  const actionLabelMap: Record<TxImagePreviewAction, string> = {
    rotate: rotateLabel,
    copy: copyLabel,
    share: shareLabel,
    download: downloadLabel,
  }

  return createPortal(
    <div
      ref={mergeRefs(ref, overlayRef)}
      role="dialog"
      aria-modal="true"
      aria-label={dialogLabel}
      tabIndex={-1}
      className={cn('tx-image-preview', className)}
      style={{ zIndex: zIndexRef.current, ...style } as CSSProperties}
      onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
        if (e.key === 'Tab')
          trapFocusInContainer(e.nativeEvent, overlayRef.current)
      }}
      {...rest}
    >
      <div className="tx-image-preview__scrim" onClick={() => setIsOpen(false)} />

      <div className="tx-image-preview__topbar">
        <span className="tx-image-preview__counter">{counterFormatter(safeIndex + 1, total)}</span>
        {currentItem.name && <span className="tx-image-preview__name">{currentItem.name}</span>}
        <button
          type="button"
          className="tx-image-preview__btn tx-image-preview__close"
          aria-label={closeLabel}
          onClick={() => setIsOpen(false)}
        >
          <BuiltinIcon name="close" size={18} />
        </button>
      </div>

      <div className="tx-image-preview__stage">
        {total > 1 && (
          <button
            type="button"
            className="tx-image-preview__nav tx-image-preview__nav--prev"
            aria-label={previousLabel}
            onClick={goPrev}
          >
            ‹
          </button>
        )}

        <div className="tx-image-preview__content">
          {renderItem
            ? renderItem({ item: currentItem, index: safeIndex, scale, turns })
            : isFailed
              ? <div className="tx-image-preview__placeholder" role="status">{failedText}</div>
              : (
                  <img
                    src={currentItem.url}
                    alt={currentItem.alt ?? currentItem.name ?? `Image ${safeIndex + 1}`}
                    className="tx-image-preview__img"
                    style={{ transform: `scale(${scale}) rotate(${turns * 90}deg)` }}
                    onError={() => {
                      if (currentItem.url) {
                        setErroredUrls(prev => ({ ...prev, [currentItem.url!]: true }))
                        onError?.(currentItem.url, safeIndex)
                      }
                    }}
                  />
                )}
        </div>

        {total > 1 && (
          <button
            type="button"
            className="tx-image-preview__nav tx-image-preview__nav--next"
            aria-label={nextLabel}
            onClick={goNext}
          >
            ›
          </button>
        )}
      </div>

      <div className="tx-image-preview__toolbar">
        <button type="button" className="tx-image-preview__btn" aria-label={zoomOutLabel} onClick={zoomOut}>−</button>
        <button type="button" className="tx-image-preview__btn" aria-label={resetLabel} onClick={resetView}>
          {scaleFormatter(scale)}
        </button>
        <button type="button" className="tx-image-preview__btn" aria-label={zoomInLabel} onClick={zoomIn}>+</button>
        {actions.map(action => (
          <button
            key={action}
            type="button"
            className="tx-image-preview__btn"
            aria-label={actionLabelMap[action]}
            onClick={() => runAction(action)}
          >
            {actionLabelMap[action]}
          </button>
        ))}
      </div>

      {indicator !== 'none' && total > 1 && (
        <div className="tx-image-preview__strip" role="tablist" aria-label="Images">
          {list.map((item, idx) => (
            <button
              key={`${item.url ?? idx}-${idx}`}
              type="button"
              role="tab"
              aria-selected={idx === safeIndex}
              aria-label={item.name ?? `Image ${idx + 1}`}
              className={cn(
                'tx-image-preview__strip-item',
                `tx-image-preview__strip-item--${indicator}`,
                { 'is-active': idx === safeIndex },
              )}
              onClick={() => setCurrentIndex(idx)}
            >
              {indicator === 'thumbnails' && (item.thumbnail || item.url)
                ? <img src={item.thumbnail ?? item.url} alt="" />
                : <span className="tx-image-preview__dot" />}
            </button>
          ))}
        </div>
      )}
    </div>,
    document.body,
  )
})
TxImagePreview.displayName = 'TxImagePreview'

// ============================================================================
// 31. TxImageGallery (image-gallery)
// ============================================================================

export interface TxImageGalleryItem {
  id: string
  url: string
  name?: string
}

export interface TxImageGalleryProps extends HTMLAttributes<HTMLDivElement> {
  items: TxImageGalleryItem[]
  startIndex?: number
  previousLabel?: string
  nextLabel?: string
  previewTitle?: string
  closeLabel?: string
  zoomInLabel?: string
  zoomOutLabel?: string
  resetLabel?: string
  failedText?: string
  itemLabelFormatter?: (index: number) => string
  openLabelFormatter?: (label: string) => string
  previewProps?: Partial<TxImagePreviewProps>
  onOpen?: (payload: { index: number, item: TxImageGalleryItem }) => void
  onClose?: () => void
  onAction?: (event: TxImagePreviewActionEvent) => void
}

export const TxImageGallery = forwardRef<HTMLDivElement, TxImageGalleryProps>((
  {
    items,
    startIndex = 0,
    previousLabel = 'Previous image',
    nextLabel = 'Next image',
    previewTitle = 'Preview',
    closeLabel = 'Close',
    zoomInLabel = 'Zoom in',
    zoomOutLabel = 'Zoom out',
    resetLabel = 'Fit to screen',
    failedText = 'This image could not be loaded',
    itemLabelFormatter = idx => `Image ${idx + 1}`,
    openLabelFormatter = lbl => `Open ${lbl} preview`,
    previewProps,
    onOpen,
    onClose,
    onAction,
    className,
    style,
    ...rest
  },
  ref,
) => {
  const [previewOpen, setPreviewOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(startIndex)

  const openAt = (idx: number) => {
    const item = items[idx]
    if (!item)
      return
    setActiveIndex(idx)
    setPreviewOpen(true)
    onOpen?.({ index: idx, item })
  }

  return (
    <div ref={ref} className={cn('tx-image-gallery', className)} style={style} {...rest}>
      <div className="tx-image-gallery__grid">
        {items.map((item, idx) => {
          const itemLabel = item.name ?? itemLabelFormatter(idx)
          return (
            <button
              key={item.id}
              type="button"
              className="tx-image-gallery__thumb"
              aria-label={openLabelFormatter(itemLabel)}
              onClick={() => openAt(idx)}
            >
              <img src={item.url} alt={itemLabel} className="tx-image-gallery__img" />
            </button>
          )
        })}
      </div>

      <TxImagePreview
        {...previewProps}
        open={previewOpen}
        index={activeIndex}
        items={items.map(i => ({ type: 'image', url: i.url, name: i.name }))}
        label={previewTitle}
        previousLabel={previousLabel}
        nextLabel={nextLabel}
        closeLabel={closeLabel}
        zoomInLabel={zoomInLabel}
        zoomOutLabel={zoomOutLabel}
        resetLabel={resetLabel}
        failedText={failedText}
        onIndexChange={setActiveIndex}
        onOpenChange={(next) => {
          setPreviewOpen(next)
          if (!next)
            onClose?.()
        }}
        onAction={onAction}
      />
    </div>
  )
})
TxImageGallery.displayName = 'TxImageGallery'

// ============================================================================
// 33. TxIconPicker (icon-picker)
// ============================================================================

export type TxIconPickerShape
  = | 'circle'
    | 'squircle'
    | 'rounded'
    | 'square'
    | 'diamond'
    | 'pentagon'
    | 'hexagon'
    | 'arch'
    | 'cookie'
    | 'clover'
    | 'burst'
    | 'heart'

export type TxIconPickerSection = 'emoji' | 'icon' | 'brand' | 'ai' | 'file'
export type TxIconPickerCatalogSection = Exclude<TxIconPickerSection, 'file'>

export interface TxIconPickerEntry {
  id: string
  glyph: string
  label: string
  keywords: string
  category?: string
}

export interface TxIconPickerLabels {
  emoji: string
  icon: string
  brand: string
  ai: string
  file: string
  search: string
  empty: string
  clear: string
  chooseFile: string
  shape: string
}

export const TX_ICON_PICKER_DEFAULT_LABELS: TxIconPickerLabels = {
  emoji: 'Emoji',
  icon: 'Icons',
  brand: 'Brands',
  ai: 'AI',
  file: 'File',
  search: 'Search icons...',
  empty: 'No matching icons',
  clear: 'Clear',
  chooseFile: 'Choose image file',
  shape: 'Shape',
}

const DEFAULT_ICON_CATALOG: Record<TxIconPickerCatalogSection, TxIconPickerEntry[]> = {
  emoji: [
    { id: 'emoji:🚀', glyph: '🚀', label: 'Rocket', keywords: 'rocket launch space 火箭', category: 'Objects' },
    { id: 'emoji:✨', glyph: '✨', label: 'Sparkles', keywords: 'sparkles magic ai stars 闪烁', category: 'Objects' },
    { id: 'emoji:🔥', glyph: '🔥', label: 'Fire', keywords: 'fire hot flame 火', category: 'Nature' },
    { id: 'emoji:⚡', glyph: '⚡', label: 'Bolt', keywords: 'lightning bolt fast 闪电', category: 'Nature' },
    { id: 'emoji:📦', glyph: '📦', label: 'Package', keywords: 'package box module 包', category: 'Objects' },
    { id: 'emoji:🎯', glyph: '🎯', label: 'Target', keywords: 'target goal bullseye 目标', category: 'Objects' },
    { id: 'emoji:🧩', glyph: '🧩', label: 'Puzzle', keywords: 'puzzle plugin extension 插件', category: 'Objects' },
    { id: 'emoji:🎨', glyph: '🎨', label: 'Palette', keywords: 'palette design art theme 调色板', category: 'Objects' },
  ],
  icon: [
    { id: 'class:i-ri-rocket-line', glyph: '✦', label: 'Rocket', keywords: 'rocket launch deploy', category: 'General' },
    { id: 'class:i-ri-search-line', glyph: '⌕', label: 'Search', keywords: 'search find query', category: 'General' },
    { id: 'class:i-ri-settings-3-line', glyph: '⚙', label: 'Settings', keywords: 'settings gear config', category: 'General' },
    { id: 'class:i-ri-folder-line', glyph: '▤', label: 'Folder', keywords: 'folder directory files', category: 'Files' },
    { id: 'class:i-ri-code-s-slash-line', glyph: '</>', label: 'Code', keywords: 'code dev script', category: 'Dev' },
    { id: 'class:i-ri-terminal-box-line', glyph: '>_', label: 'Terminal', keywords: 'terminal cli shell', category: 'Dev' },
  ],
  brand: [
    { id: 'brand:github', glyph: 'GH', label: 'GitHub', keywords: 'github git repo', category: 'Dev' },
    { id: 'brand:figma', glyph: 'Fg', label: 'Figma', keywords: 'figma design ui', category: 'Design' },
    { id: 'brand:slack', glyph: 'Sl', label: 'Slack', keywords: 'slack chat team', category: 'Work' },
    { id: 'brand:notion', glyph: 'No', label: 'Notion', keywords: 'notion docs wiki', category: 'Work' },
  ],
  ai: [
    { id: 'ai:gemini', glyph: '✦', label: 'Gemini', keywords: 'gemini google ai model', category: 'Models' },
    { id: 'ai:claude', glyph: '✳', label: 'Claude', keywords: 'claude anthropic ai model', category: 'Models' },
    { id: 'ai:openai', glyph: '◎', label: 'OpenAI', keywords: 'openai gpt chatgpt ai', category: 'Models' },
    { id: 'ai:tuff', glyph: '◈', label: 'Tuff AI', keywords: 'tuff agent assistant', category: 'Models' },
  ],
}

const DEFAULT_SHAPES: TxIconPickerShape[] = ['rounded', 'circle', 'squircle', 'square']

export interface TxIconPickerProps extends Omit<HTMLAttributes<HTMLDivElement>, 'defaultValue' | 'onChange'> {
  value?: string
  defaultValue?: string
  shape?: TxIconPickerShape
  defaultShape?: TxIconPickerShape
  sections?: TxIconPickerSection[]
  catalog?: Partial<Record<TxIconPickerCatalogSection, TxIconPickerEntry[]>>
  shapeSelectable?: boolean
  fileChooser?: () => Promise<string | null>
  accept?: string
  disabled?: boolean
  size?: number
  placeholder?: string
  inline?: boolean
  labels?: Partial<TxIconPickerLabels>
  onChange?: (value: string) => void
  onShapeChange?: (shape: TxIconPickerShape) => void
  onFileError?: (error: unknown) => void
}

function renderIdentifierPreview(id: string | undefined, catalog: Record<TxIconPickerCatalogSection, TxIconPickerEntry[]>): ReactNode {
  if (!id)
    return null
  if (id.startsWith('emoji:'))
    return <span>{id.slice(6)}</span>
  if (id.startsWith('url:') || id.startsWith('file:') || id.startsWith('data:')) {
    const src = id.startsWith('url:') ? id.slice(4) : id.startsWith('file:') ? id.slice(5) : id
    return <img src={src} alt="" className="tx-icon-picker__preview-img" />
  }
  for (const entries of Object.values(catalog)) {
    const found = entries.find(e => e.id === id)
    if (found)
      return <span>{found.glyph}</span>
  }
  if (id.startsWith('class:'))
    return <i className={id.slice(6)} aria-hidden="true" />
  return <span>{id}</span>
}

export const TxIconPicker = forwardRef<HTMLDivElement, TxIconPickerProps>((
  {
    value,
    defaultValue = '',
    shape,
    defaultShape = 'rounded',
    sections = ['emoji', 'icon', 'brand', 'ai', 'file'],
    catalog: customCatalog,
    shapeSelectable = true,
    fileChooser,
    accept = 'image/*',
    disabled = false,
    size = 44,
    placeholder = 'Pick icon',
    inline = false,
    labels: customLabels,
    onChange,
    onShapeChange,
    onFileError,
    className,
    style,
    ...rest
  },
  ref,
) => {
  const [currentValue, setCurrentValue] = useControllableState<string>({
    value,
    defaultValue,
    onChange,
  })
  const [currentShape, setCurrentShape] = useControllableState<TxIconPickerShape>({
    value: shape,
    defaultValue: defaultShape,
    onChange: onShapeChange,
  })
  const [open, setOpen] = useState(false)
  const [activeSection, setActiveSection] = useState<TxIconPickerSection>(sections[0] ?? 'emoji')
  const [searchQuery, setSearchQuery] = useState('')
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const zIndexRef = useRef(allocateZIndex())
  const panelId = useId()

  const mergedLabels = useMemo<TxIconPickerLabels>(
    () => ({ ...TX_ICON_PICKER_DEFAULT_LABELS, ...customLabels }),
    [customLabels],
  )

  const mergedCatalog = useMemo<Record<TxIconPickerCatalogSection, TxIconPickerEntry[]>>(
    () => ({
      emoji: customCatalog?.emoji ?? DEFAULT_ICON_CATALOG.emoji,
      icon: customCatalog?.icon ?? DEFAULT_ICON_CATALOG.icon,
      brand: customCatalog?.brand ?? DEFAULT_ICON_CATALOG.brand,
      ai: customCatalog?.ai ?? DEFAULT_ICON_CATALOG.ai,
    }),
    [customCatalog],
  )

  useDismissableLayer({
    open: open && !inline,
    onDismiss: () => setOpen(false),
    containerRefs: [triggerRef, panelRef],
  })

  const floating = useFloatingPosition(triggerRef, panelRef, {
    open: open && !inline,
    placement: 'bottom-start',
    offset: 8,
  })

  const filteredEntries = useMemo(() => {
    if (activeSection === 'file')
      return []
    const entries = mergedCatalog[activeSection] ?? []
    const q = searchQuery.trim().toLowerCase()
    if (!q)
      return entries
    return entries.filter(entry =>
      entry.label.toLowerCase().includes(q)
      || entry.keywords.toLowerCase().includes(q)
      || (entry.category?.toLowerCase().includes(q) ?? false),
    )
  }, [activeSection, mergedCatalog, searchQuery])

  const selectIcon = (id: string) => {
    if (disabled)
      return
    setCurrentValue(id)
    if (!inline)
      setOpen(false)
  }

  const handleChooseFile = async () => {
    if (disabled)
      return
    if (fileChooser) {
      try {
        const picked = await fileChooser()
        if (picked)
          selectIcon(picked.startsWith('file:') || picked.startsWith('url:') ? picked : `file:${picked}`)
      }
      catch (err) {
        onFileError?.(err)
      }
      return
    }
    fileInputRef.current?.click()
  }

  const panelContent = (
    <div
      ref={panelRef}
      id={panelId}
      className={cn('tx-icon-picker-panel', { 'tx-floating-panel': !inline })}
      style={!inline
        ? {
            position: floating.strategy,
            left: `${floating.x}px`,
            top: `${floating.y}px`,
            zIndex: zIndexRef.current,
          } as CSSProperties
        : undefined}
    >
      <div className="tx-icon-picker-panel__tabs" role="tablist">
        {sections.map(sec => (
          <button
            key={sec}
            type="button"
            role="tab"
            aria-selected={activeSection === sec}
            className={cn('tx-icon-picker-panel__tab', { 'is-active': activeSection === sec })}
            onClick={() => setActiveSection(sec)}
          >
            {mergedLabels[sec]}
          </button>
        ))}
      </div>

      {activeSection !== 'file' && (
        <div className="tx-icon-picker-panel__search">
          <TxInput
            value={searchQuery}
            placeholder={mergedLabels.search}
            clearable
            className="tx-icon-picker-panel__search-input"
            onChange={v => setSearchQuery(String(v))}
          />
        </div>
      )}

      <div className="tx-icon-picker-panel__viewport">
        {activeSection === 'file'
          ? (
              <div className="tx-icon-picker-panel__file">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={accept}
                  className="tx-file-uploader__input"
                  tabIndex={-1}
                  aria-hidden="true"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file)
                      selectIcon(`url:${createPreviewUrl(file)}`)
                    e.target.value = ''
                  }}
                />
                <button
                  type="button"
                  className="tx-file-uploader__button"
                  disabled={disabled}
                  onClick={() => void handleChooseFile()}
                >
                  {mergedLabels.chooseFile}
                </button>
              </div>
            )
          : filteredEntries.length === 0
            ? <div className="tx-icon-picker-panel__empty">{mergedLabels.empty}</div>
            : (
                <div className="tx-icon-picker-panel__grid" role="listbox" aria-label={mergedLabels[activeSection]}>
                  {filteredEntries.map(entry => (
                    <button
                      key={entry.id}
                      type="button"
                      role="option"
                      aria-selected={currentValue === entry.id}
                      aria-label={entry.label}
                      title={entry.label}
                      className={cn('tx-icon-picker-panel__cell', { 'is-selected': currentValue === entry.id })}
                      onClick={() => selectIcon(entry.id)}
                    >
                      {entry.glyph}
                    </button>
                  ))}
                </div>
              )}
      </div>

      <div className="tx-icon-picker-panel__footer">
        {shapeSelectable && (
          <div className="tx-icon-picker-panel__shapes" aria-label={mergedLabels.shape}>
            {DEFAULT_SHAPES.map(s => (
              <button
                key={s}
                type="button"
                aria-pressed={currentShape === s}
                className={cn('tx-icon-picker-panel__shape-btn', `is-shape-${s}`, { 'is-active': currentShape === s })}
                onClick={() => setCurrentShape(s)}
              >
                {s}
              </button>
            ))}
          </div>
        )}
        {currentValue && (
          <button
            type="button"
            className="tx-icon-picker-panel__clear"
            onClick={() => setCurrentValue('')}
          >
            {mergedLabels.clear}
          </button>
        )}
      </div>
    </div>
  )

  return (
    <div
      ref={ref}
      className={cn('tx-icon-picker', { 'is-disabled': disabled, 'is-inline': inline }, className)}
      style={{ '--tx-icon-picker-size': `${size}px`, ...style } as CSSProperties}
      {...rest}
    >
      {inline
        ? panelContent
        : (
            <>
              <button
                ref={triggerRef}
                type="button"
                disabled={disabled}
                aria-expanded={open}
                aria-haspopup="dialog"
                aria-controls={open ? panelId : undefined}
                aria-label={placeholder}
                className={cn('tx-icon-picker__trigger', `is-shape-${currentShape}`)}
                onClick={() => {
                  if (disabled)
                    return
                  if (!open)
                    zIndexRef.current = allocateZIndex()
                  setOpen(!open)
                }}
              >
                <span className={cn('tx-icon-picker__plate', `is-shape-${currentShape}`)}>
                  {currentValue
                    ? <span className="tx-icon-picker__content">{renderIdentifierPreview(currentValue, mergedCatalog)}</span>
                    : <span className="tx-icon-picker__trigger-empty">+</span>}
                </span>
              </button>
              {open && hasDocument() && createPortal(panelContent, document.body)}
            </>
          )}
    </div>
  )
})
TxIconPicker.displayName = 'TxIconPicker'
