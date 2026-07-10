**similar pages** uses machine learning and graph theory to help you find connections between ideas.

## how it works

for a given page in your graph, we calculate how similar the other pages are along two dimensions:
* **graph distance** — how close they are via link paths (using [BFS shortest path](https://graphology.github.io/standard-library/shortest-path.html))
* **semantic similarity** — how similar their content is in meaning (using [bge-small-en-v1.5](https://huggingface.co/Xenova/bge-small-en-v1.5) via [Transformers.js](https://huggingface.co/docs/transformers.js))

pages are scored primarily by semantic similarity, with a small discovery boost for distant pages — surfacing connections you might not have found on your own.

![image](https://user-images.githubusercontent.com/1139703/201499109-337ea065-c53e-4226-9349-343acd06aa05.png)

## usage

after installing, click the scatter-plot icon next to the search input:

<img src="https://user-images.githubusercontent.com/1139703/201499087-0b651331-ad51-45e8-a747-1e652160660c.png" width="400"/>

select a page to see its similar pages as a **scatter plot** or **ranked list**. you can toggle views from the sidebar.

you can also right-click any page title and choose **"Similar Pages: Find similar"** to jump straight to results for that page.

### settings

in the Roam settings panel under "Similar Pages":

| setting | description | default |
|---------|-------------|---------|
| **Default View** | scatter plot or ranked list | scatter |
| **Show Voronoi Overlay** | voronoi polygons on scatter plot | off |
| **Hide Dot-Prefixed Pages** | exclude `.rm-doc` etc. | on |
| **Hide roam/ Pages** | exclude `roam/` namespace | on |
| **Custom Exclusions** | comma-separated prefixes to exclude | — |
| **Skip Codeblocks** | strip code blocks from embeddings | on |

### list view

the ranked list is sortable by clicking column headers:
* **Score** — composite ranking (similarity + distance discovery boost). "top" = top 5%.
* **Similarity** — semantic similarity percentage
* **Distance** — shortest link path (hops)

click any row to link pages together.

## technical details

everything is client side — your data never leaves roam. the extension uses web workers for embedding computation and IndexedDB for caching so that subsequent lookups are fast.

graph distances are computed lazily (only for the selected page) rather than upfront, which keeps initialization fast on large graphs.

### first-run model download

the first time you embed pages, the extension downloads a one-time ~34MB AI embedding model ([bge-small-en-v1.5](https://huggingface.co/Xenova/bge-small-en-v1.5)) along with the [Transformers.js](https://huggingface.co/docs/transformers.js) and idb libraries from a CDN and Hugging Face. these are cached by your browser afterward, so subsequent runs work offline. the model runs entirely on your machine — no page content is ever sent anywhere.

## acknowledgements

credit to Stephen Solka, creator of [logseq-graph-analysis](https://github.com/trashhalo/logseq-graph-analysis), which served as a source of inspiration and guidance for representing a knowledge graph with [graphology](https://graphology.github.io/).
