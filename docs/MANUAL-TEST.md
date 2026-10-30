# Manual test checklist

Automated tests cover PDF cleanup, LLM-output validation, and the stat-block-to-actor mapper. They do not start Foundry. Foundry v14 will not boot without a license key, so the checks below have to be done by hand in a world you own.

Install first, using the steps in the README. Use Foundry 14.367 or newer and dnd5e 6.0.x. The Hunted Queen PDF is in `test-pdfs/hunted-queen.pdf` (CC BY 4.0, Payton Swick). It is two pages, two columns, and has four stat blocks: Ampheryn, Doppelganger, Giant Blade Spider, and Snake's Errant Assassin. An earlier note counted three; the doppelganger block is the fourth, and it is abbreviated.

## Happy path

1. Log in as the GM. Confirm a Folio button is on the Journal sidebar, and that Configure Settings → Folio → Open Folio opens the same window.
2. Log in as a player in another browser. The button is absent. Opening the window anyway, if you can, shows that only the GM can import.
3. As the GM, choose The Hunted Queen, pages 1–2, rules 2014, and turn AI off. Read the PDF, continue, and create.
4. Expect a journal folder and an actor folder named The Hunted Queen.
5. Journals follow the book: an overview or introduction, Scene 1 before Scene 2 before Scene 3 before Scene 4, then a Creatures journal. The opening line reads "Queen Kalia of Bragod", not a stray "Q".
6. The letter ("My queen, events have unfolded…") is in a shaded italic box.
7. Four actors exist. Giant Blade Spider has AC 13, HP 20, Dexterity 16, a Stab attack at +5 for 1d6+3 piercing, and a Pounce save of DC 12. Open the sheet and roll Stab. The chat card shows the attack.
8. Snake's Errant Assassin has Shadow dagger (+6, 1d4+3 piercing) and a DC 12 Wisdom save for necrotic damage.
9. Click a "Giant Blade Spider" or "Ampheryn" link in a journal. The actor opens.
10. Undo import. The journals, actors, and both folders are gone.

## With an API key

11. Put your own OpenAI or Anthropic key in the wizard. Read the PDF with AI on. The review screen appears, and any number the model changed (AC, HP, abilities) shows a note that the printed value was kept.
12. In the browser network panel, the only requests for the PDF text go to `api.openai.com` or `api.anthropic.com`. Nothing goes to a Folio server. The key is not in the URL.
13. Reload the world. The key is still in the wizard on this browser. It does not appear in Configure Settings as a world setting.

## SRD matching

14. Download the SRD 5.2.1 PDF from D&D Beyond (CC BY 4.0) yourself. Do not commit it. Import one page that contains a monster whose name is in the system, such as a goblin, with rules set to 2024.
15. The review row should offer "Copy the SRD actor". Create it and confirm the sheet looks like the compendium creature. If the PDF's AC or HP differs, the badge says the stats differ and the sheet shows the PDF's number.
16. Switch the same row to "From the stat block" and create again. You get a custom actor built from the text, not the compendium copy.
17. Repeat one monster with rules set to 2014 and confirm it searches the legacy Monsters compendium (`dnd5e.monsters`) rather than `dnd5e.actors24`.

## Other cases

18. Create with "Also save an Adventure compendium" checked. A world compendium of type Adventure appears. Import it into an empty test world and confirm the journals and actors arrive, and that a journal link still opens the imported actor. This is the step most likely to need a fix in `src/foundry/adventure.ts`.
19. On the review screen, uncheck one scene, rename an actor, merge a section upward, and re-read one stat block. Create. The unchecked scene is absent, and the new name is on the actor.
20. Point Folio at a scanned PDF or a page that is only a picture. It stops and says there is no text layer. It does not offer OCR.
21. Point it at a password-protected PDF. It refuses. It does not ask for the password.
22. Open a world that is not dnd5e. The wizard explains that it needs dnd5e.
23. Narrow a long PDF to a page range and confirm pages outside the range are not in the journals.

## Not in this version

Do not expect scenes, maps, token art, roll tables, or magic-item cards. Bindery is the tool for pulling images out of the same PDF.
