#!/usr/bin/env python3
"""Rewrite the `category` frontmatter of Tuffex component docs.

The docs sidebar (app/components/DocsSidebar.vue) groups component pages purely by
this field, so it is the single source of truth for sidebar structure.

Categories roll up into three suites via DocsSidebar's CATEGORY_SUITE_MAP:

- base 基础组件: Basic, Form, Layout, Navigation, Data, Feedback, Status
- pro  进阶套件: Advanced, Visualization, Effects, Primitives
- ai   AI 套件:  AiChat, AiAgent, AiReasoning, AiContext

The suite assignment table lives in .trellis/tasks/08-30-docs-suite-split/prd.md;
keep this file, DocsSidebar.vue and the tuffex base/pro/ai entry barrels in sync.

`Foundations` (foundations, utils → base) and `AiSuite` (ai-suite → ai) are special
cases: the sidebar renders them as standalone links inside their suite rather than
as collapsible groups.

Future chart components (tuffex-charts work) belong in pro / "Visualization".
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

COMPONENTS_DIR = Path(__file__).resolve().parent.parent / "content" / "docs" / "dev" / "components"

# Ordered: group key -> slugs, in the order they should appear inside the group.
TAXONOMY: dict[str, list[str]] = {
    # ── suite: base 基础组件 ──────────────────────────────────────────────
    "Foundations": [
        "foundations",
        "utils",
    ],
    "Basic": [
        "button",
        "icon",
        "avatar",
        "avatar-variants",
        "tag",
        "badge",
        "status-badge",
        "icon-chip",
        "kbd",
        "divider",
    ],
    "Form": [
        "form",
        "input",
        "flat-input",
        "textarea",
        "number-input",
        "search-input",
        "tag-input",
        "scrub-field",
        "select",
        "flat-select",
        "search-select",
        "tree-select",
        "cascader",
        "picker",
        "date-picker",
        "radio",
        "flat-radio",
        "checkbox",
        "switch",
        "slider",
        "segmented-slider",
        "rating",
        "file-uploader",
        "image-uploader",
    ],
    "Layout": [
        "container",
        "flex",
        "grid",
        "grid-layout",
        "stack",
        "splitter",
        "scroll",
        "collapse",
        "card",
        "card-item",
        "group-block",
    ],
    "Navigation": [
        "tabs",
        "tab-bar",
        "nav-bar",
        "sidebar-nav",
        "breadcrumb",
        "steps",
        "pagination",
        "dropdown-menu",
        "flat-dropdown",
        "context-menu",
    ],
    "Data": [
        "data-table",
        "tree",
        "sortable-list",
        "timeline",
        "transfer",
        "stat-card",
        "cell-link",
        "dot-indicator",
        "filter-chips",
        "markdown-view",
        "image-gallery",
    ],
    "Feedback": [
        "dialog",
        "modal",
        "drawer",
        "popover",
        "tooltip",
        "toast",
        "alert",
        "progress",
        "progress-bar",
        "spinner",
        "loading-overlay",
        "selection-actions",
    ],
    "Status": [
        "empty",
        "empty-state",
        "no-data",
        "no-selection",
        "search-empty",
        "error-state",
        "offline-state",
        "permission-state",
        "guide-state",
        "blank-slate",
        "loading-state",
        "skeleton",
        "layout-skeleton",
    ],
    # ── suite: pro 进阶套件 ──────────────────────────────────────────────
    "Advanced": [
        "command-palette",
        "search-panel",
        "markdown-editor",
        "code-editor",
        "virtual-list",
        "version-capsule",
    ],
    "Visualization": [
        "spark-chart",
        "allocation-bar",
        "diff-table",
        "signal-meter",
    ],
    "Effects": [
        "glass-surface",
        "gradient-border",
        "outline-border",
        "border-beam",
        "corner-overlay",
        "gradual-blur",
        "edge-fade-mask",
        "glow-text",
        "keyframe-stroke-text",
        "tuff-logo-stroke",
        "text-transformer",
        "transition",
        "stagger",
        "fusion",
        "liquid",
        "flip-overlay",
    ],
    # Infrastructure that other components are built on; rarely used directly.
    "Primitives": [
        "base-surface",
        "base-anchor",
        "floating",
        "auto-sizer",
        "resize-box",
    ],
    # ── suite: ai AI 套件 ────────────────────────────────────────────────
    "AiSuite": [
        "ai-suite",
    ],
    "AiChat": [
        "chat",
        "chat-composer",
        "prompt-bar",
        "attachment-tray",
        "message-actions",
        "suggestion-chips",
        "typing-indicator",
        "conversation-stream",
    ],
    "AiAgent": [
        "agents",
        "agent-trace",
        "task-rows",
        "tool-call-card",
        "tool-chips",
        "tool-confirmation",
        "approval-card",
        "working-indicator",
    ],
    "AiReasoning": [
        "ai-elements",
        "chain-of-thought",
        "reasoning-disclosure",
        "thinking-orb",
        "stream-markdown",
        "code-stream",
        "inline-citation",
        "sources",
    ],
    "AiContext": [
        "context-cards",
        "context-indicator",
        "insight-cards",
        "recommendation-card",
        "fine-tune-card",
    ],
}

# Pages that are not categorised component entries.
EXCLUDED_SLUGS = {"index"}

CATEGORY_RE = re.compile(r"^category:[ \t]*.*$", re.MULTILINE)
TITLE_RE = re.compile(r"^title:[ \t]*.*$", re.MULTILINE)


def build_slug_map() -> dict[str, str]:
    slug_to_category: dict[str, str] = {}
    for category, slugs in TAXONOMY.items():
        for slug in slugs:
            if slug in slug_to_category:
                raise SystemExit(
                    f"duplicate slug {slug!r}: in both {slug_to_category[slug]!r} and {category!r}"
                )
            slug_to_category[slug] = category
    return slug_to_category


def discover_slugs() -> set[str]:
    return {
        path.name.removesuffix(".zh.mdc").removesuffix(".en.mdc")
        for path in COMPONENTS_DIR.glob("*.mdc")
    }


def set_category(text: str, category: str) -> str:
    if CATEGORY_RE.search(text):
        return CATEGORY_RE.sub(f"category: {category}", text, count=1)
    # No category line yet: insert right after the title line inside frontmatter.
    match = TITLE_RE.search(text)
    if not match:
        raise SystemExit("cannot insert category: no title line found")
    return f"{text[: match.end()]}\ncategory: {category}{text[match.end() :]}"


def main() -> int:
    apply = "--apply" in sys.argv

    slug_to_category = build_slug_map()
    on_disk = discover_slugs()
    expected = set(slug_to_category) | EXCLUDED_SLUGS

    missing = sorted(on_disk - expected)
    extra = sorted(expected - on_disk)
    if missing:
        raise SystemExit(f"{len(missing)} doc(s) have no taxonomy entry: {missing}")
    if extra:
        raise SystemExit(f"{len(extra)} taxonomy entrie(s) have no doc: {extra}")

    changed = 0
    for slug, category in sorted(slug_to_category.items()):
        for locale in ("zh", "en"):
            path = COMPONENTS_DIR / f"{slug}.{locale}.mdc"
            if not path.exists():
                raise SystemExit(f"missing locale file: {path}")
            original = path.read_text(encoding="utf-8")
            updated = set_category(original, category)
            if updated == original:
                continue
            changed += 1
            if apply:
                path.write_text(updated, encoding="utf-8")

    verb = "updated" if apply else "would update"
    print(
        f"{len(slug_to_category)} components across {len(TAXONOMY)} categories; "
        f"{verb} {changed} file(s)"
    )
    if not apply:
        print("dry run — pass --apply to write")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
