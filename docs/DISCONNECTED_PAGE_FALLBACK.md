# Similarity candidate pool (global corpus)

## The problem this solves

The extension plots pages on two axes: **similarity** (semantic, from AI
embeddings) and **distance** (shortest link path in the Roam graph). The pipeline
was originally scoped to the selected page's graph *neighborhood*:

- `getShortestPaths(apex)` (BFS in `useGraphology`) returns only pages reachable
  by block references.
- Those became `activePageIds`, and **only those were embedded and scored**.

Two failure modes fell out of that:

1. **Isolated pages rendered blank.** If nothing referenced the selected page and
   it referenced nothing, the BFS returned only the page itself, so there were no
   candidates at all.
2. **Connected pages returned topologically-biased, not semantically-best,
   results.** You could only ever match against pages within a few link-hops, so
   the genuinely most-similar page in your graph was invisible if it wasn't
   already linked nearby. Selecting `Datalevin` surfaced whatever happened to be
   linked or recent (tensorflow, MLP, azure…) instead of `datahike`/`datascript`.

Similarity never actually needed the graph — each page's embedding stands on its
own — so the candidate pool has no reason to be limited to the neighborhood.

## What we do now (global corpus)

Every selectable page is a similarity candidate, ranked against the apex by a
plain dot product of normalized embeddings:

- `sp-body.tsx` builds `corpusPathMap` over **all** `selectablePages`: reachable
  pages keep their real BFS distance; everything else is `Infinity` (unconnected).
- `addActivePages` (in `useIdb`) embeds any page that doesn't yet have a cached
  vector. **First selection embeds the whole graph; after that, embeddings
  persist in IndexedDB and selection is cheap.** A page's vector is refreshed when
  that page is chosen as the apex (`addApexPage` re-hashes and invalidates on
  content change), so we don't re-derive text for the whole corpus on every
  select.
- Only graph-reachable pages get a `DIJKSTRA_STORE` entry, so only they carry a
  real distance.

`useVisx` scores every candidate: `score = similarity + 0.1 · scaledDistance` for
connected pages (a small "surprising discovery" boost for far-but-similar pages),
and pure `similarity` for unconnected pages. The two views split the pool:

- **Scatter plot** (`global = false`) shows only pages with a real distance — the
  graph neighborhood, unchanged.
- **Ranked list** (`global = true`) shows the whole corpus, capped to the top
  `MAX_LIST_ROWS` by score, with unconnected pages showing `—` for distance.

A page is still flagged **disconnected** when its own neighborhood is empty
(`Object.keys(distances).length <= 1`); that only picks the list view and its
copy — the ranking itself is global either way.

## Modal toggles for hidden pages

Some pages are hidden from the search list on purpose: **attribute pages**
(titles used as `Title::` anywhere), **daily notes**, and `DONE`. The modal has
live "Show attribute pages" / "Show daily notes" switches (`sp-body.tsx`), off by
default, that re-filter the searchable list without rebuilding the graph
(`selectablePages` is a `useMemo` over the full page map + toggle state). Because
the candidate pool is built from `selectablePages`, these toggles also control
what can appear in results.

Attribute pages and daily notes are deliberately kept **out of the graph
topology** (`useGraphology` skips attribute uids; `isRelevantPage` skips daily/
DONE) so they don't distort link distances — daily notes especially are hubs.
The consequence: when you toggle one of these on and select it, it has no graph
node, so `getShortestPaths` is skipped and every candidate is ranked by pure
content similarity (distance shown as `—`).

## Known trade-offs / notes for future work

- **Non-apex staleness.** A page's embedding refreshes when it's selected as the
  apex, not on every select. If you edit page B's content and then look at page
  A's similar pages without ever selecting B, B's vector can be stale until B is
  next selected. This is the standard "re-index on access" trade-off and keeps
  per-select cost off the whole corpus.
- **Worker fan-out.** Embedding chunks at `CHUNK_SIZE` (100) spawn one worker per
  chunk, each independently loading the transformers model. The first full-corpus
  embed is therefore several sequential cold model loads (cached by the browser
  after the first). Reusing a single long-lived worker would speed up first run.
- **List cap.** The ranked list shows the top `MAX_LIST_ROWS` by score; deeper
  matches exist but aren't rendered, to keep the table cheap.
