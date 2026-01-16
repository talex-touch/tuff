# Intelligence (Developer)

This chapter explains the **Intelligence System** used by Tuff Core-App, and how Nexus / plugins interact with it.

## What you get

- **Multi-provider routing** (OpenAI / Anthropic / DeepSeek / SiliconFlow / Local / Custom)
- **Capability-based APIs** (`text.chat`, `vision.ocr`, `embedding.generate`, `agent.run`, ...)
- **Strategies** (provider selection + fallback chain)
- **Governance**
  - Provider/model compatibility validation
  - API key fast-fail routing
  - Embedding input chunking/truncation
  - OCR payload + storage governance

## Where the code lives

- Core runtime
  - `apps/core-app/src/main/modules/ai/intelligence-sdk.ts`
  - `apps/core-app/src/main/modules/ai/intelligence-config.ts`
  - `apps/core-app/src/main/modules/ai/intelligence-strategy-manager.ts`
  - `apps/core-app/src/main/modules/ai/runtime/provider-manager.ts`
- Providers
  - `apps/core-app/src/main/modules/ai/providers/*.ts`

## See also

- API reference: `/docs/dev/api/intelligence`
- Architecture: `/docs/dev/architecture/intelligence-system`
- Configuration: `/docs/dev/intelligence/configuration`
- Capabilities & examples: `/docs/dev/intelligence/capabilities`
- Troubleshooting: `/docs/dev/intelligence/troubleshooting`
