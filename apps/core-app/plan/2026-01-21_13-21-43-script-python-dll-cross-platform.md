---
mode: plan
cwd: /Users/talexdreamsoul/Workspace/Projects/talex-touch/apps/core-app
task: Provide script and native capability support (Python + DLL) with a cross-platform design
complexity: complex
planning_method: builtin
created_at: 2026-01-21T13:21:47+08:00
---

# Plan: Script and Native Capability Support

## Task Summary
Define a concrete, cross-platform approach to support Python scripts and native libraries (e.g., DLL/so/dylib), including OS-specific capabilities such as macOS scripts or Swift-only features. The goal is to align with existing architecture, ensure packaging/security compatibility, and provide a stable API for modules and plugins.

## Execution Plan
1. Discovery and constraints: inspect existing process execution, IPC, plugin/module patterns, and any sidecar usage to match style; identify platform constraints (Electron sandboxing, signing, permissions).
2. Scope and capability matrix: list supported script types (Python, OS shell, AppleScript) and native integration modes (DLL/so/dylib, sidecar executables); define per-OS support and fallback behavior.
3. Architecture design: propose a dedicated main-process module (e.g., ScriptBridge/NativeBridge) with provider interfaces, IPC contract, logging, timeouts, cancellation, and configuration.
4. Python runtime strategy: decide between embedded Python vs system Python; design dependency management, virtual environments, path resolution, and per-platform packaging.
5. Native library strategy: choose N-API add-ons vs FFI vs sidecar process; define ABI compatibility, loading rules, and error isolation for Windows/macOS/Linux.
6. OS-specific providers: design concrete adapters (Windows DLL/COM/WinRT, macOS AppleScript/Swift helper, Linux dbus/native libs) with example flows (e.g., screenshot capture).
7. Build and distribution: integrate native assets into build, codesign/notarize, update strategy, and feature gating/rollback toggles.
8. Testing and docs: unit tests for resolution/config, integration tests per OS, mock external dependencies, and author-facing documentation with examples.

## Risks and Considerations
- Packaging size and signing for embedded runtimes and native binaries can be complex across macOS/Windows.
- Security risk from executing scripts or loading dynamic libraries; require clear permissions and isolation.
- ABI incompatibilities and OS API drift can cause runtime failures; need robust detection and fallback.
- CI coverage for multi-OS validation may be limited; plan for manual smoke tests where needed.

## References
- src/main/index.ts
- src/main/core/module-manager.ts
- src/main/core/channel-core.ts
- src/main/modules/plugin/plugin-provider.ts
