import { MenuItem } from "@blueprintjs/core";
import { ItemListPredicate, ItemRenderer } from "@blueprintjs/select";

import React from "react";
import { highlightText } from "../../services/highlight-text";
import { SelectablePageList } from "../../types";

export const renderPageList: ItemRenderer<SelectablePageList> = (
  pageList: { title: any; id: React.Key },
  { handleClick, modifiers, query }: any
) => {
  if (!modifiers.matchesPredicate) {
    return null;
  }
  const text = pageList.title;
  return (
    <MenuItem
      active={modifiers.active}
      disabled={modifiers.disabled}
      key={pageList.id}
      onClick={handleClick}
      text={highlightText(text, query)}
    />
  );
};

// Rank a matching title so the most relevant results float to the top:
// exact match first, then prefix matches, then whole-query substrings, then
// pages that merely contain every word. Shorter titles win ties so an exact
// short page (e.g. "backend") beats a long incidental match.
const rankTitle = (title: string, query: string, tokens: string[]): number => {
  if (title === query) return 0;
  if (title.startsWith(query)) return 1;
  if (title.includes(query)) return 2;
  if (tokens.some((token) => title.startsWith(token))) return 3;
  return 4;
};

// Tokenized, ranked filter. Splitting on whitespace lets "project search" match
// "Project: Better Search", and the ranking keeps exact/prefix hits at the top
// instead of relying on the arbitrary source order.
export const filterPageList: ItemListPredicate<SelectablePageList> = (query, items) => {
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery.length === 0) {
    return items;
  }

  const tokens = normalizedQuery.split(/\s+/).filter((token) => token.length > 0);

  return items
    .map((item) => ({ item, title: item.title.toLowerCase() }))
    .filter(({ title }) => tokens.every((token) => title.includes(token)))
    .map((entry) => ({ ...entry, rank: rankTitle(entry.title, normalizedQuery, tokens) }))
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        a.title.length - b.title.length ||
        a.title.localeCompare(b.title)
    )
    .map(({ item }) => item);
};
