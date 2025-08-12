# Usage Logging Plan

## Overview
This document outlines the plan to implement usage logging for search and execute actions in the `SearchEngineCore`. The goal is to record detailed context for each type of user interaction separately, allowing for more accurate analysis of user behavior and better reflection of Tuff's core functionalities.

## Requirements
1. `itemId` should be directly taken from `item.id`, and an error should be thrown if it doesn't exist.
2. After a search completes, a `sessionId` should be returned to the frontend.
3. When the frontend executes an action, it will pass back the `sessionId` and `itemId`, allowing us to correlate actions within the same session (search, execute).

## Design

### 1. Extend `TuffSearchResult` Interface
- Add a `sessionId` field to the `TuffSearchResult` interface in `types.ts`.

### 2. Modify `SearchEngineCore` Class

#### 2.1. Modify `_getItemId` Method
- Change the method to throw an error if `item.id` does not exist.

#### 2.2. Modify `search` Method
- Generate a `sessionId` at the beginning of the search.
- Include the `sessionId` in the returned `searchResult`.

#### 2.3. Modify `_recordUsage` Method
- Rename to `_recordSearch`.
- Record a log entry with `action` = "search".
- Context will include search-specific information like query text, duration, sort stats, source stats.

#### 2.4. Add `recordExecute` Method
- Add a new public method `recordExecute(sessionId: string, item: TuffItem, context?: any)`.
- Record a log entry with `action` = "execute".
- Context will include execution-specific information like app launch time.
- Update `usageSummary` to increment `clickCount` and update `lastUsed`.

### 3. Modify `ISearchProvider` Implementation
- Ensure that implementations of `ISearchProvider` (like `appProvider`) call `SearchEngineCore.getInstance().recordExecute()` in their `onExecute` method.

## Implementation Steps

### Step 1: Extend `TuffSearchResult` Interface
- Edit `apps/core-app/src/main/modules/box-tool/search-engine/types.ts`.
- Add `sessionId?: string` to the `TuffSearchResult` interface.

### Step 2: Modify `SearchEngineCore` Class
- Edit `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts`.
- Implement the changes described in section 2.

### Step 3: Update `ISearchProvider` Implementations
- Review and update implementations of `ISearchProvider` to call `recordExecute` in `onExecute`.

## Data Model

### `usageLogs` Table
- `id`: Primary key.
- `sessionId`: Session identifier.
- `itemId`: Identifier of the item.
- `source`: Source of the item (e.g., 'files', 'clipboard_history').
- `action`: Type of action ('search' or 'execute').
- `keyword`: Search keyword (for 'search' action).
- `timestamp`: Timestamp of the action.
- `context`: JSON string containing context-specific information.

### `usageSummary` Table
- `itemId`: Primary key.
- `clickCount`: Number of times the item has been executed.
- `lastUsed`: Timestamp of the last time the item was used (search or execute).

## Reflection of Tuff Core Functionalities

This logging design reflects Tuff's core functionalities in the following ways:

1.  **Plugin System**: The `source` field and `sourceStats` record plugin performance.
2.  **Aggregator**: The `sourceStats` and `sessionId` track aggregator performance and session context.
3.  **Search Items**: The `itemId` and `context` fields capture detailed information about individual items.
4.  **AI Engine**: The `sort_stats` and detailed context can record AI module performance and decisions.
5.  **User Behavior Analysis**: The core purpose of this design is to support user behavior analysis for intelligent sorting and recommendations.

## Future Improvements

1.  **Renderer Tracking**: Add logging for user interactions with the renderer (hover, preview, etc.).
2.  **Detailed AI Logging**: Record more detailed information about AI module inputs, outputs, and processes.
3.  **Plugin Lifecycle**: Log plugin loading, activation, and deactivation events.
4.  **System Resource Usage**: Log CPU and memory usage during search and execute operations.