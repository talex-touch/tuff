#!/bin/bash
# Shoot matched crops of every ported BUI case, both sides, same browser.
set -u
export TUFFEX_CDP_URL=http://127.0.0.1:9231
R=.trellis/tasks/09-21-bui-parity-audit/research/shoot-pair.mjs
BUI=https://www.beautifului.dev/
DOCS=http://localhost:3200/zh/docs/dev/components

# key | bui section id | our docs slug | our root selector
PAIRS=(
  "01-loading-state|loading-state|working-indicator|.tx-bui-working-indicator"
  "02-thinking|thinking-state|agent-trace|.tx-bui-agent-trace"
  "04-approval-card|approval-card|approval-card|.tx-bui-approval-card"
  "05-tool-chips|tool-chips|tool-chips|.tx-bui-tool-chips"
  "06-task-rows|task-rows|task-rows|.tx-bui-task-rows"
  "08-prompt-bar|prompt-bar|prompt-bar|.tx-bui-prompt-bar"
  "09-recommendation-card|recommendation-card|recommendation-card|.tx-bui-recommendation-card"
  "10-context-cards|context-cards|context-cards|.tx-bui-context-cards"
  "11-diff-table|diff-table|diff-table|.tx-bui-diff-table"
  "13-filter-table|filter-table|filter-chips|.tx-bui-filter-chips"
  "14-sidebar-nav|sidebar-nav|sidebar-nav|.tx-bui-sidebar-nav"
  "15-search|search|search-panel|.tx-bui-search-panel"
  "18-code-block|code-block|code-stream|.tx-bui-code-stream"
  "19-fine-tune-card|fine-tune-card|fine-tune-card|.tx-bui-fine-tune-card"
  "20-selection-actions|selection-actions|selection-actions|.tx-bui-selection-actions"
)

for row in "${PAIRS[@]}"; do
  IFS='|' read -r key sec slug sel <<< "$row"
  node "$R" bui "$key" "$BUI" "#${sec} .primitive-demo-surface" 0 2>&1 | tail -1
  node "$R" ours "$key" "$DOCS/$slug" "$sel" 0 2>&1 | tail -1
done
