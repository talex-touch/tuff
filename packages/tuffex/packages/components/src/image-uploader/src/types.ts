export interface ImageUploaderFile {
  id: string
  url: string
  name?: string
  file?: File
}

export interface ImageUploaderProps {
  modelValue: ImageUploaderFile[]
  multiple?: boolean
  accept?: string
  disabled?: boolean
  max?: number
  uploadText?: string
  removeLabel?: (name?: string) => string
}

export interface ImageUploaderEmits {
  (e: 'update:modelValue', value: ImageUploaderFile[]): void
  (e: 'change', value: ImageUploaderFile[]): void
  (e: 'remove', payload: { id: string, value: ImageUploaderFile[] }): void
}
