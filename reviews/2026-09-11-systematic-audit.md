# Website audit

## Fixed
- Help, privacy, terms and safety templates (both languages), plus 404, were missing shared reading preferences. Connected them and added a regression test for all 20 public pages including the web app.
- Large text policy-page navigation now wraps. Verified 200% (32px root) at 390px viewport on Chinese/English marketing, features, support, privacy, terms, safety, philosophy, circularity, materials and 404 pages; no page-wide horizontal overflow measured.
- Inventory statistic accessible names now separate count and meaning.
- Item action accessible names include the food name, making repeated edit/remove actions distinguishable.
- Search-result counts are polite live status messages.
- Unified “加入购物清单” and “待购买” wording.

## Evidence
20 generated public pages checked for internal href/src targets, fragment IDs and duplicate IDs: no issues found before edits. Static build validates generated output. Existing 24 data/cache/drag tests passed again; added reading inclusion test passed.
Browser on an isolated local origin: added quantity 3, consumed 1 => 2, undo => 3, reload => 3. Separately verified named edit action, accessible inventory count and zero-result search feedback after fixes.

## Limits
Width checks are not full visual certification. No physical iPhone/HarmonyOS/Android device, VoiceOver/TalkBack or external store status verification in this pass. Real cloud sync, account services and native apps are outside this website audit. No user production data was edited. Synthetic records remain only on isolated localhost test origins.
