export type StepsDirection = 'horizontal' | 'vertical'

export type StepsSize = 'small' | 'medium' | 'large'

export type StepStatus = 'wait' | 'active' | 'completed' | 'error'

export interface StepsContext {
  direction: StepsDirection
  size: StepsSize
  activeStep: { value: number | string }
  setActiveStep: (step: number | string) => void
}

export interface StepsProps {
  direction?: StepsDirection
  size?: StepsSize
  active?: number | string
}

export interface StepProps {
  title?: string
  description?: string
  icon?: string
  status?: StepStatus
  step?: number | string
  clickable?: boolean
  disabled?: boolean
  showLine?: boolean
  completedIcon?: string
}
