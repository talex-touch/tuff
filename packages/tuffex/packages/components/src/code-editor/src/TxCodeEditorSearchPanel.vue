<script setup lang="ts">
import type { EditorView } from '@codemirror/view'
import {
  SearchQuery,
  closeSearchPanel,
  findNext,
  findPrevious,
  replaceAll,
  replaceNext,
  selectMatches,
  setSearchQuery,
} from '@codemirror/search'
import TxCheckbox from '../../checkbox/src/TxCheckbox.vue'

export interface CodeEditorSearchState {
  search: string
  replace: string
  caseSensitive: boolean
  regexp: boolean
  wholeWord: boolean
  readOnly: boolean
}

const props = defineProps<{
  view: EditorView
  state: CodeEditorSearchState
}>()

function commitQuery(patch?: Partial<Omit<CodeEditorSearchState, 'readOnly'>>) {
  const next = {
    search: patch?.search ?? props.state.search,
    replace: patch?.replace ?? props.state.replace,
    caseSensitive: patch?.caseSensitive ?? props.state.caseSensitive,
    regexp: patch?.regexp ?? props.state.regexp,
    wholeWord: patch?.wholeWord ?? props.state.wholeWord,
  }

  props.view.dispatch({
    effects: setSearchQuery.of(
      new SearchQuery({
        search: next.search,
        replace: next.replace,
        caseSensitive: next.caseSensitive,
        regexp: next.regexp,
        wholeWord: next.wholeWord,
      }),
    ),
  })
}

function onSearchInput(event: Event) {
  commitQuery({ search: (event.target as HTMLInputElement).value })
}

function onReplaceInput(event: Event) {
  commitQuery({ replace: (event.target as HTMLInputElement).value })
}

function onPanelKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    closeSearchPanel(props.view)
    props.view.focus()
  }
}

function onSearchKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault()
    if (event.shiftKey)
      findPrevious(props.view)
    else
      findNext(props.view)
  }
}

function onReplaceKeydown(event: KeyboardEvent) {
  if (props.state.readOnly)
    return
  if (event.key === 'Enter') {
    event.preventDefault()
    replaceNext(props.view)
  }
}

function handleFindNext() {
  findNext(props.view)
}

function handleFindPrevious() {
  findPrevious(props.view)
}

function handleSelectAll() {
  selectMatches(props.view)
}

function handleReplaceNext() {
  if (props.state.readOnly)
    return
  replaceNext(props.view)
}

function handleReplaceAll() {
  if (props.state.readOnly)
    return
  replaceAll(props.view)
}

function handleClose() {
  closeSearchPanel(props.view)
  props.view.focus()
}
</script>

<template>
  <div class="tx-code-editor-search" @keydown="onPanelKeydown">
    <div class="tx-ce-sr">
      <input
        main-field="true"
        name="search"
        type="text"
        class="cm-textfield"
        placeholder="Find"
        aria-label="Find"
        :value="state.search"
        @input="onSearchInput"
        @keydown="onSearchKeydown"
      >
      <button type="button" class="cm-button" name="next" @click="handleFindNext">
        Next
      </button>
      <button type="button" class="cm-button" name="prev" @click="handleFindPrevious">
        Previous
      </button>
      <button type="button" class="cm-button" name="select" @click="handleSelectAll">
        All
      </button>
      <button
        type="button"
        name="close"
        aria-label="Close"
        @click="handleClose"
      >
        ×
      </button>
    </div>

    <div class="tx-ce-st">
      <TxCheckbox
        class="tx-ce-sc"
        :model-value="state.caseSensitive"
        label="match case"
        @update:model-value="val => commitQuery({ caseSensitive: val })"
      />
      <TxCheckbox
        class="tx-ce-sc"
        :model-value="state.regexp"
        label="regexp"
        @update:model-value="val => commitQuery({ regexp: val })"
      />
      <TxCheckbox
        class="tx-ce-sc"
        :model-value="state.wholeWord"
        label="by word"
        @update:model-value="val => commitQuery({ wholeWord: val })"
      />
    </div>

    <div v-if="!state.readOnly" class="tx-ce-sr">
      <input
        name="replace"
        type="text"
        class="cm-textfield"
        placeholder="Replace"
        aria-label="Replace"
        :value="state.replace"
        @input="onReplaceInput"
        @keydown="onReplaceKeydown"
      >
      <button type="button" class="cm-button" name="replace" @click="handleReplaceNext">
        Replace
      </button>
      <button type="button" class="cm-button" name="replaceAll" @click="handleReplaceAll">
        Replace All
      </button>
    </div>
  </div>
</template>
