/**
 * Prompts ask for the small schema in src/llm/schema.ts.
 * They forbid Foundry document JSON on purpose: that schema changes between
 * dnd5e versions, and this code is what maps the simple result onto it.
 */

export const STRUCTURE_SYSTEM_PROMPT = [
  "You turn extracted text from a Dungeons & Dragons 5th-edition adventure into a JSON outline.",
  "Return one JSON object and nothing else. Do not return HTML, markdown, or Foundry VTT documents.",
  "Do not use the keys system, items, flags, prototypeToken, _id, or activities.",
  "Preserve the author's sentences in paragraph text. Do not invent plot, names, or numbers.",
  "Lines that begin with \"> \" are likely read-aloud or a letter. Mark those paragraphs readAloud true.",
  "Other boxed or quoted text that the table should hear is also readAloud true.",
  "One chapter per scene or major heading. One section per smaller heading.",
  "Stat blocks are listed by id at the end of the text. Reference them with statBlockId.",
  "Do not copy a stat block into paragraph text. One short sentence is enough.",
  "sourcePages are the page numbers printed in the headings.",
].join(" ");

export const NPC_SYSTEM_PROMPT = [
  "You convert one Dungeons & Dragons 5th-edition stat block into a JSON object.",
  "Return one JSON object and nothing else. Do not return a Foundry actor.",
  "Do not use the keys system, items, flags, prototypeToken, _id, or activities.",
  "Copy numbers from the stat block. If Challenge is missing, omit cr.",
  "kind is attack, save, or utility.",
  "An attack that also asks for a saving throw stays kind attack and also fills saveDc, saveAbilities, and saveDamage.",
  "damage formulas look like 1d6+3 with no spaces.",
  "abilities are the six scores, not the modifiers.",
  "skills is a map of skill name to the printed bonus, such as { \"stealth\": 5 }.",
  "speed values are foot-per-round numbers as strings, such as { \"walk\": \"30\", \"climb\": \"30\" }.",
  "size is one of tiny, sm, med, lg, huge, grg.",
  "activation is action, bonus, reaction, legendary, or special.",
].join(" ");

export function structureUserPrompt(prose: string, statBlocks: { id: string; name: string; page: number }[]): string {
  const list = statBlocks.map((block) => `- ${block.id}: ${block.name} (page ${block.page})`).join("\n");
  return [
    "Known stat blocks (already extracted; reference by id, do not copy their statistics):",
    list || "(none)",
    "",
    "Adventure text:",
    prose,
  ].join("\n");
}

export function npcUserPrompt(name: string, text: string): string {
  return `Stat block name: ${name}\n\n${text}`;
}

export function retrySuffix(error: string): string {
  return [
    "",
    "Your previous JSON failed validation:",
    error,
    "Return only the corrected JSON object. Do not include Foundry document fields.",
  ].join("\n");
}
