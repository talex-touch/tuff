# Tuff Usage Tracking PRD

## 1. Overview

This document outlines the Product Requirements for implementing usage tracking in the Tuff launcher. The goal is to collect user behavior data to improve the intelligence of the launcher's ranking and recommendation algorithms.

## 2. Goals

### 2.1. Primary Goals

- Track how many times each application is executed.
- Record search and execution sessions to correlate user actions.
- Provide data for intelligent sorting and recommendations.

### 2.2. Secondary Goals

- Track user interactions with search results (hover, preview, etc.).
- Record detailed context for search and execution actions.
- Monitor plugin and aggregator performance.

## 3. Requirements

### 3.1. Functional Requirements

#### 3.1.1. Basic Usage Tracking

- **FR-1**: The system shall record each execution of an application.
- **FR-2**: The system shall store the count of executions for each application.
- **FR-3**: The system shall record the last time each application was used.

#### 3.1.2. Session Tracking

- **FR-4**: The system shall generate a unique session ID for each search operation.
- **FR-5**: The system shall return the session ID to the frontend with search results.
- **FR-6**: The system shall accept the session ID when recording execution actions.
- **FR-7**: The system shall correlate search and execution actions within the same session.

#### 3.1.3. Data Collection

- **FR-8**: The system shall collect search context (query, duration, sort stats, source stats).
- **FR-9**: The system shall collect execution context (app launch time, etc.).
- **FR-10**: The system shall identify items by their `item.id`, and throw an error if it doesn't exist.

### 3.2. Non-Functional Requirements

#### 3.2.1. Performance

- **NFR-1**: Usage tracking shall not significantly impact search or execution performance.
- **NFR-2**: Usage tracking operations should be asynchronous and non-blocking.

#### 3.2.2. Data Storage

- **NFR-3**: Usage data shall be stored in a SQLite database.
- **NFR-4**: The database schema shall support efficient querying for ranking and recommendation algorithms.

## 4. Design

### 4.1. Data Model

#### 4.1.1. `usageLogs` Table

Stores detailed logs of user actions.

| Column      | Type    | Description                                             |
| ----------- | ------- | ------------------------------------------------------- |
| `id`        | INTEGER | Primary key                                             |
| `sessionId` | TEXT    | Session identifier                                      |
| `itemId`    | TEXT    | Identifier of the item                                  |
| `source`    | TEXT    | Source of the item (e.g., 'files', 'clipboard_history') |
| `action`    | TEXT    | Type of action ('search' or 'execute')                  |
| `keyword`   | TEXT    | Search keyword (for 'search' action)                    |
| `timestamp` | INTEGER | Timestamp of the action                                 |
| `context`   | TEXT    | JSON string containing context-specific information     |

#### 4.1.2. `usageSummary` Table

Stores aggregated usage statistics for quick access.

| Column       | Type    | Description                                  |
| ------------ | ------- | -------------------------------------------- |
| `itemId`     | TEXT    | Primary key, identifier of the item          |
| `clickCount` | INTEGER | Number of times the item has been executed   |
| `lastUsed`   | INTEGER | Timestamp of the last time the item was used |

### 4.2. Core Components

#### 4.2.1. SearchEngineCore

The main component responsible for search operations and usage tracking.

- **`search(query)`**: Executes a search and records the search action.
- **`recordExecute(sessionId, item, context)`**: Records an execution action.
- **`_getItemId(item)`**: Gets or generates a unique ID for an item.
- **`_recordSearch(result)`**: Records a search action.
- **`_recordExecute(sessionId, item, context)`**: Records an execution action.

#### 4.2.2. ISearchProvider

Interface for search providers, which may also handle execution.

- **`onExecute(item)`**: Executes an item, should call `SearchEngineCore.recordExecute`.

## 5. Implementation Plan

### 5.1. Phase 1: Basic Usage Tracking (MVP)

- Extend `TuffSearchResult` interface to include `sessionId`.
- Modify `SearchEngineCore` to generate and return `sessionId`.
- Modify `SearchEngineCore` to record search and execute actions separately.
- Modify `ISearchProvider` implementations to call `recordExecute`.
- Update database schema and utilities to support new fields.

### 5.2. Phase 2: Enhanced Tracking

- Add tracking for user interactions with search results (hover, preview, etc.).
- Add tracking for keyboard navigation (arrow keys, Cmd+1, etc.).
- Add tracking for plugin and aggregator performance.

### 5.3. Phase 3: Advanced Analytics

- Implement data analysis tools to process usage logs.
- Integrate usage data into ranking and recommendation algorithms.
- Create dashboards for monitoring launcher performance and user behavior.

## 6. Future Considerations

### 6.1. Privacy

- Consider user privacy and data protection regulations.
- Provide options for users to opt-out of usage tracking.

### 6.2. Scalability

- Design the system to handle a large volume of usage data.
- Consider data retention and archiving policies.

### 6.3. Integration

- Integrate usage tracking with other Tuff components (AI engine, plugin system, etc.).
- Provide APIs for plugins to access usage data.

## 7. Success Metrics

- **Metric-1**: Percentage of search sessions with associated execution actions.
- **Metric-2**: Accuracy of application ranking based on usage data.
- **Metric-3**: Performance impact of usage tracking on search and execution operations.
