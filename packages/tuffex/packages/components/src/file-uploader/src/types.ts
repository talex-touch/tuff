export interface FileUploaderFile {
  id: string
  name: string
  size: number
  type: string
  file: File
}

export interface FileUploaderProps {
  modelValue?: FileUploaderFile[]
  multiple?: boolean
  accept?: string
  disabled?: boolean
  max?: number
  showSize?: boolean
  allowDrop?: boolean
  buttonText?: string
  dropText?: string
  hintText?: string
}

export interface FileUploaderEmits {
  (e: 'update:modelValue', value: FileUploaderFile[]): void
  (e: 'change', value: FileUploaderFile[]): void
  (e: 'add', value: FileUploaderFile[]): void
  (e: 'remove', payload: { id: string, value: FileUploaderFile[] }): void
}
