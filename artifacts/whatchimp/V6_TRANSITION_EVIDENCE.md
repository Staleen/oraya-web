# Question-transition evidence — genuine WhatChimp export survey

**Purpose:** exact, auditable backing for the question-transition contract (DECISIONS_LOG 2026-07-03; validator `question-transition` check): a `User Input Flow Single` (Question) node's final-reply output feeds **only a Text or HTTP API node** in genuine WhatChimp exports; the chained-question port (`userInputFlowSingleOutput`) feeds only another Question. Direct `Question → Condition` / `Question → User Input Flow` edges appear in **no** genuine export and were operator-observed rendering as loose/disconnected lines after import (2026-07-03).

**Survey generated 2026-07-03** by parsing each export's node graph and counting every outgoing connection of every Question node. **Exact count: 22 files** — 1 in-repo byte-preserved operator export + 21 platform-named exports in the operator's local Oraya folder (outside this repo; identified below by filename + size + SHA-256 prefix so the survey is re-runnable and tamper-evident).

**Genuineness criterion (stated honestly):** the 21 external files match the WhatChimp download naming convention `whatsapp-bot_<numeric-bot-id>_<YYYYMMDDHHMMSS>.txt` and were exported by the operator from the live tenant between 2026-05-10 and 2026-06-22; the in-repo v5.5 file is the operator's hand-repaired export, byte-preserved (full SHA-256 recorded in `V6_DEPENDENCIES.md`). This is provenance by naming convention and operator custody — not cryptographic proof of origin. Files **not** matching the platform naming convention (agent-built or renamed) were excluded from the evidence set; the relevant ones are listed at the bottom as counter-examples.

## Result

Across all 22 files: **167 Question nodes, 0 (zero) final-reply edges to anything other than Text or HTTP API.**

| File | Bytes | SHA-256 (first 16) | Nodes | Questions | Question outgoing edges found |
|---|---|---|---|---|---|
| `artifacts/whatchimp/Oraya_natural_intake_v5.5.input.txt` (in-repo) | 59555 | `0113c6b2040a1686…` | 69 | 14 | 7× finalReply → HTTP API<br>7× finalReply → Text |
| `whatsapp-bot_1825051_20260510032943.txt` | 10560 | `765bb2ea8b397681…` | 10 | 7 | 1× finalReply → Text<br>6× chained → Question |
| `whatsapp-bot_1825051_20260512234437.txt` | 17743 | `9f999b1725ec6e87…` | 23 | 7 | 1× finalReply → Text<br>6× chained → Question |
| `whatsapp-bot_1825051_20260513000645.txt` | 22557 | `509ccb079468830d…` | 27 | 11 | 1× finalReply → Text<br>10× chained → Question |
| `whatsapp-bot_1825412_20260510203239.txt` | 9676 | `5cd225deeb3290c4…` | 9 | 6 | 1× finalReply → Text<br>5× chained → Question |
| `whatsapp-bot_1825412_20260512234444.txt` | 9676 | `cbea960eb7df455a…` | 9 | 6 | 1× finalReply → Text<br>5× chained → Question |
| `whatsapp-bot_1833637_20260513001503.txt` | 35739 | `57eb72720d7e3afc…` | 34 | 17 | 3× finalReply → Text<br>14× chained → Question |
| `whatsapp-bot_1833656_20260513011202.txt` | 36376 | `13228810bbed159d…` | 38 | 10 | 2× finalReply → Text<br>8× chained → Question |
| `whatsapp-bot_1833752_20260513020649.txt` | 38594 | `c64f45fa91758256…` | 38 | 10 | 2× finalReply → Text<br>8× chained → Question |
| `whatsapp-bot_1846357_20260517200535.txt` | 34596 | `d0f8c1fa888f66b1…` | 38 | 16 | 6× finalReply → HTTP API<br>1× finalReply → Text<br>9× chained → Question |
| `whatsapp-bot_1846357_20260517202459.txt` | 36983 | `7ec0cbc212ee5167…` | 40 | 16 | 6× finalReply → HTTP API<br>1× finalReply → Text<br>9× chained → Question |
| `whatsapp-bot_1846496_20260518031049.txt` | 33832 | `eff074253264f4b1…` | 43 | 10 | 3× finalReply → HTTP API<br>3× finalReply → Text<br>4× chained → Question |
| `whatsapp-bot_1846656_20260521223130.txt` | 39360 | `08a40d7ee9bd440f…` | 47 | 10 | 3× finalReply → HTTP API<br>3× finalReply → Text<br>4× chained → Question |
| `whatsapp-bot_1846656_20260522113008.txt` | 39360 | `bfb3ef3b9f41b5b3…` | 47 | 10 | 3× finalReply → HTTP API<br>3× finalReply → Text<br>4× chained → Question |
| `whatsapp-bot_1857205_20260521234639.txt` | 21064 | `b70d29a8becc96ec…` | 26 | 4 | 2× finalReply → HTTP API<br>2× finalReply → Text |
| `whatsapp-bot_1858005_20260522113016.txt` | 39736 | `5b10f9ef1177639e…` | 47 | 10 | 3× finalReply → HTTP API<br>3× finalReply → Text<br>4× chained → Question |
| `whatsapp-bot_1858006_20260522094046.txt` | 21972 | `be846914ce5ccf00…` | 27 | 4 | 2× finalReply → HTTP API<br>2× finalReply → Text |
| `whatsapp-bot_1858006_20260522103744.txt` | 27933 | `631f1387303d4d49…` | 36 | 5 | 2× finalReply → HTTP API<br>3× finalReply → Text |
| `whatsapp-bot_1858233_20260523090930.txt` | 25944 | `51ce060bb33bbdef…` | 34 | 5 | 2× finalReply → HTTP API<br>3× finalReply → Text |
| `whatsapp-bot_1888942_20260622011409.txt` | 39406 | `cf59e146b752615c…` | 47 | 10 | 3× finalReply → HTTP API<br>3× finalReply → Text<br>4× chained → Question |
| `whatsapp-bot_1926903_20260622074534.txt` | 52353 | `bcde19fc54a7cd95…` | 62 | 13 | 6× finalReply → HTTP API<br>7× finalReply → Text |
| `whatsapp-bot_1928101_20260622141724.txt` | 81831 | `a95b17baca8ddb93…` | 97 | 21 | 8× finalReply → HTTP API<br>9× finalReply → Text<br>3× chained → Question |

Legend: `finalReply` = the `userInputFlowSingleOutputFinalReply` output port; `chained → Question` = the `userInputFlowSingleOutput` port feeding another `User Input Flow Single` (a proven pattern the v6 artifact does not use).

## Excluded counter-examples (agent-built, NOT platform-named — corroborating evidence)

| File | Bytes | SHA-256 (first 16) | Why excluded / what it shows |
|---|---|---|---|
| `whatsapp-bot_guest-identification_v1.txt` | 21349 | `56615c70e4888bce…` | agent-hand-built (2026-05-22 identity flow); contains 1× finalReply → **Condition** — the unsupported transition |
| `whatsapp-bot_guest-identification_v2.txt` | 20424 | `15855d78fbc586f3…` | agent-hand-built; contains the same 1× finalReply → **Condition** |
| `whatsapp-bot_guest-identification_v2_repaired.txt` | 25925 | `dce8dad83a5e9a22…` | the repaired version: the Question → Condition edge is **gone**, replaced by finalReply → Text — independently mirroring the v6 repair |

**Interpretation limit:** this survey proves the transition pattern is absent from every genuine export available to Oraya; it does not prove the WhatChimp editor can never produce it, and it does not prove save compatibility of the repaired v6 artifact — that remains the operator's import → save → close → reopen → export test (`V6_ROUNDTRIP_CHECKLIST.md` A2/B).
