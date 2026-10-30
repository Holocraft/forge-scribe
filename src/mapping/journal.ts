import { escapeHtml, escapeRegExp } from "../html.ts";

export interface JournalParagraph {
  text: string;
  readAloud: boolean;
}

export interface LinkableActor {
  /** Id in the import plan, not the Foundry id. The Foundry id does not exist yet. */
  id: string;
  name: string;
}

/**
 * Journal HTML for one section.
 * Actor names become placeholders (`@@folio:id@@`) that createImport replaces
 * with `@UUID[Actor....]{Name}` once the actors exist. That enricher is how
 * Foundry turns a mention in a journal into a link that opens the actor.
 */
export function renderSectionHtml(section: { title: string; paragraphs: JournalParagraph[] }, actors: LinkableActor[]): string {
  const parts = [`<h2>${escapeHtml(section.title)}</h2>`];
  let quote: string[] = [];
  const flushQuote = () => {
    if (quote.length === 0) return;
    parts.push(`<div class="folio-read-aloud">${quote.join("")}</div>`);
    quote = [];
  };
  for (const paragraph of section.paragraphs) {
    const html = `<p>${linkActorNames(paragraph.text, actors)}</p>`;
    if (paragraph.readAloud) quote.push(html);
    else {
      flushQuote();
      parts.push(html);
    }
  }
  flushQuote();
  return parts.join("\n");
}

export function linkActorNames(text: string, actors: LinkableActor[]): string {
  const sorted = [...actors].filter((actor) => actor.name.trim()).sort((a, b) => b.name.length - a.name.length);
  if (sorted.length === 0) return escapeHtml(text);
  const pattern = sorted.map((actor) => escapeRegExp(actor.name)).join("|");
  const expression = new RegExp(`\\b(?:${pattern})\\b`, "gi");
  let html = "";
  let cursor = 0;
  for (const match of text.matchAll(expression)) {
    const index = match.index ?? 0;
    const found = match[0];
    html += escapeHtml(text.slice(cursor, index));
    const actor = sorted.find((candidate) => candidate.name.toLowerCase() === found.toLowerCase());
    html += actor ? `@@folio:${actor.id}@@` : escapeHtml(found);
    cursor = index + found.length;
  }
  html += escapeHtml(text.slice(cursor));
  return html;
}

/** `@UUID[Actor.id]{Name}` is Foundry's cross-link. The id is the world actor id. */
export function uuidEnricher(actorId: string, name: string): string {
  const safe = name.replace(/[\[\]{}]/g, "");
  return `@UUID[Actor.${actorId}]{${safe}}`;
}

export function applyActorLinks(html: string, links: { planId: string; actorId: string; name: string }[]): string {
  let output = html;
  for (const link of links) {
    output = output.replaceAll(`@@folio:${link.planId}@@`, uuidEnricher(link.actorId, link.name));
  }
  return output;
}
