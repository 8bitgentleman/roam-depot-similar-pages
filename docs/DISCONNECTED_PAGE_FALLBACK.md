# Disconnected-page similarity fallback

## The problem this solves

The extension plots pages on two axes: **similarity** (semantic, from AI
embeddings) and **distance** (shortest link path in the Roam graph). The whole
pipeline was scoped to the selected page's graph *neighborhood*:

- `getShortestPaths(apex)` (BFS in `useGraphology`) returns only pages reachable
  by block references.
- Those become `activePageIds`, and **only those get embedded and scored**.

If the selected page is **isolated** — no blocks reference other pages and no
other page references it — the BFS returns only the page itself, so
`activePageIds` is empty and both the scatter and list views render blank
("no data to graph"). This is exactly what a tester on a fresh/sparse graph
hits, and it looks like the extension is broken.

Similarity never actually needed the graph. Each page's embedding already
encodes its **title** (see `getFullString` in `queries.ts`), so we can rank an
isolated page against any other embedded page with a plain dot product.

## What we do now (the fast path)

When the selected page's neighborhood is empty, we fall back to embedding the
**`RECENT_FALLBACK_LIMIT` most-recently-edited pages** (see `constants.tsx`) and
rank them by pure similarity. Because there's no distance axis, disconnected
results are shown in the **list view only** (the scatter/view toggle is hidden),
and the distance column renders `—`.

Data flow:

- `sp-body.tsx` detects isolation (`Object.keys(pathMap).length <= 1`), builds a
  synthetic path map from `getRecentPageIds(...)`, and threads a `disconnected`
  flag down to the views.
- `useVisx` has a `disconnected` branch that scores by similarity only and marks
  `rawDistance` as `Infinity` (rendered as `—`).

## Modal toggles for hidden pages

Some pages are hidden from the search list on purpose: **attribute pages**
(titles used as `Title::` anywhere), **daily notes**, and `DONE`. The modal has
live "Show attribute pages" / "Show daily notes" switches (`sp-body.tsx`), off by
default, that re-filter the searchable list without rebuilding the graph
(`selectablePages` is a `useMemo` over the full page map + toggle state).

Attribute pages and daily notes are deliberately kept **out of the graph
topology** (`useGraphology` skips attribute uids; `isRelevantPage` skips daily/
DONE) so they don't distort link distances — daily notes especially are hubs.
The consequence: when you toggle one of these on and select it, it has no graph
node, so `getShortestPaths` is skipped and it routes through the disconnected
similarity fallback below (ranked by content, distance shown as `—`). A
heavily-linked daily note therefore won't show real graph distances — that's the
trade-off for keeping topology clean and toggles instant.

## Why this is the fast path, not the complete one — notes for future work

- **Recency ≠ relevance.** We compare against the 500 most-recently-edited
  pages. The genuinely most-similar page could be old and never enter the pool.
  A complete solution embeds the whole graph (up to the existing 10k cap) or
  lazily grows the embedded corpus across sessions, then ranks against all of
  it. Embeddings already persist in IndexedDB, so the cost amortizes.
- **Worker fan-out.** Embedding chunks at `CHUNK_SIZE` (100) spawn one worker
  per chunk, each independently loading the transformers model from the CDN. A
  500-page fallback is ~5 concurrent cold model loads on first run. The
  connected path already has this behavior on large graphs; if you raise
  `RECENT_FALLBACK_LIMIT` a lot, consider serializing workers or reusing one.
- **Tunable.** `RECENT_FALLBACK_LIMIT` trades completeness for first-run speed.
