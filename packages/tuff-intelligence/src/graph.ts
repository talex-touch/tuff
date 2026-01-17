import type {
  IntelligenceCapabilityConfig,
  IntelligenceProviderConfig,
  PromptTemplate,
} from '@talex-touch/utils/types/intelligence'
import type {
  TuffGraphArtifacts,
  TuffGraphContext,
  TuffGraphStep,
  TuffIntelligenceConfig,
} from './types'
import { Annotation, END, START, StateGraph } from '@langchain/langgraph'

export interface BuildGraphOptions {
  config: TuffIntelligenceConfig
  steps?: TuffGraphStep[]
  providerResolver?: (id: string) => IntelligenceProviderConfig | undefined
  capabilityResolver?: (id: string) => IntelligenceCapabilityConfig | undefined
  promptResolver?: (id: string) => PromptTemplate | undefined
}

const TuffGraphStateAnnotation = Annotation.Root({
  context: Annotation<TuffGraphContext>,
})

export function buildGraphArtifacts(options: BuildGraphOptions): TuffGraphArtifacts {
  const providedSteps = options.steps?.filter(step => Boolean(step?.id && step.run)) ?? []
  const steps: TuffGraphStep[] = providedSteps.length
    ? providedSteps
    : [{ id: 'noop', run: (ctx: TuffGraphContext) => ctx }]

  const graphBuilder = new StateGraph(TuffGraphStateAnnotation as any) as any

  for (const step of steps) {
    graphBuilder.addNode(step.id, async (state: typeof TuffGraphStateAnnotation.State) => {
      const nextContext = await step.run(state.context)
      return { context: nextContext }
    })
  }

  graphBuilder.addEdge(START, steps[0]!.id)
  for (let i = 0; i < steps.length - 1; i++) {
    graphBuilder.addEdge(steps[i]!.id, steps[i + 1]!.id)
  }
  graphBuilder.addEdge(steps[steps.length - 1]!.id, END)

  const compiled = graphBuilder.compile()

  return {
    compiled,
    steps,
  }
}

export interface InvokeGraphOptions {
  artifacts: TuffGraphArtifacts
  context: TuffGraphContext
}

export async function invokeGraph(options: InvokeGraphOptions): Promise<TuffGraphContext> {
  if (options.artifacts.compiled) {
    const result = await options.artifacts.compiled.invoke({ context: options.context })
    return (result as { context: TuffGraphContext }).context
  }

  let ctx = options.context
  for (const step of options.artifacts.steps ?? []) {
    ctx = await step.run(ctx)
  }
  return ctx
}
