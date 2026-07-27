---
uid: wJHfOGkCvi
---
# Endringslogg

Alle merkbare endringer i utvidelsen dokumenteres her. Versjonene følger
[semantisk versjonering](https://semver.org/lang/no/).

## [0.2.0] – 2026-07-28

Stor utvidelse av 0.1.0: sidepanel, artikkelmal, Wikidata-import, interne ID-serier,
Claude-integrasjon og kjørelogger.

### Lagt til

**Sidepanel og navigasjon**
- Eget Ordbok-sidepanel med knapper for alle kommandoene, gruppert i «Leksikon-arbeidsflyt»,
  «Regenerering», «Vedlikehold», «Interne ID-numre», «Claude» og «Rapporter». Åpnes med
  kommandoen «Åpne Ordbok-panel» eller bok-ikonet i ribbonen.

**Artikkelmal**
- Ny mal `01 Maler/Artikkel.md` for *ekte* artikler (ikke autogenererte sider). Feltene der
  settes automatisk på nye sider i innboksen, fylles inn på eksisterende innboks-sider ved
  oppstart/regenerering, og kan legges på alle artikler i mappe-scopet med den nye kommandoen
  **«Bruk artikkelmal på eksisterende sider»**.
- Kun manglende felt legges til — eksisterende verdier røres aldri. Gjelder også ett nivå ned
  i nestede felt som `autoritetsdata`.

**Autoritetsdata og Wikidata-import**
- Ny kommando **«Hent autoritetsdata fra Wikidata»**: søk opp entiteten fra sidens tittel, velg
  treff, og importer felt inn i det nestede `autoritetsdata`-feltet.
- Henter *alle* egenskaper entiteten har, ikke bare de kjente autoritetsfeltene (Wikipedia, SNL
  P4342, BIBSYS/NORAF P1015, VIAF P214, Dewey P1036).
- Lenker bygges fra Wikidatas egen «formatter URL» (P1630), med innebygde reservelenker for SNL
  og VIAF, og en egen konfigurerbar URL-mal for Dewey (Wikidatas peker til nedlagte dewey.info).
- Navngitte, gjenbrukbare **feltgrupper** (f.eks. «Personer», «Steder») med aktiv gruppe,
  dra-og-slipp-rekkefølge, og bytte av gruppe rett i import-vinduet.
- Import-vinduet viser «Valgte felt» i skriverekkefølge, med dra-og-slipp, piler og fjerning.
- Valgfri import av entitetens **beskrivelse** (til `beskrivelse`), **alias** og
  **oversettelser** (til nestet `Oversettelser`), med egne prioriterte språklister.
- **Alias-triage**: siden Wikidata ikke skiller forkortelser fra alternative navn, klassifiserer
  du hvert alias som «Forkortelse» (→ `forkortelser`, får egen pekerside) eller «Alias» (→
  Obsidians `aliases`). Forhåndsvalg gjettes fra lengde, med justerbar terskel.

**Interne ID-serier**
- Egendefinerte serier for interne løpenummer (prefiks, antall siffer, neste nummer,
  målfelt i frontmatter), som kan matches automatisk mot en mappe eller en tag — eller settes
  til «manuelt».
- Nye kommandoer **«Generer internt ID-nummer (aktiv side)»** og
  **«Masse-generer ID-numre for en serie»**.
- Felt som allerede har en verdi overskrives aldri; autogenererte sider hoppes over.

**Claude-integrasjon** (Obsidian desktop)
- Ny kommando **«Foreslå omskriving med Claude (aktiv side)»**: sender siden til en lokalt
  installert Claude Code CLI med en valgt prompt, og viser svaret i et forslagsvindu.
- 11 innebygde, fullt redigerbare prompter (lesbarhet, korrektur, forkorting, formalisering,
  utviding av stubber, definisjonsavsnitt, målform, wikilenking, «Se også»-forslag,
  foreldet informasjon, kildekritikk). Egne prompter kan legges til.
- Prompter merkes som «full sideerstatning» (Claude returnerer hele filen) eller «rapport»
  (fritekst-svar som ikke skal erstatte artikkelen).
- Svaret kan kopieres, brukes til å erstatte siden, eller lagres som et **artikkelnotat** i
  `02 Notater/021 Artikkelnotater` og lenkes fra artikkelens nye `notat`-felt.
- Ny kommando **«Test Claude CLI-tilkobling»** som kjører et minimalt testkall og viser rått
  svar eller full feilmelding.

**Kjørelogger**
- Hver skrivende kommando skriver en loggfil til `02 Notater/ÅÅÅÅ-MM-DD/…` med hva som ble
  opprettet, oppdatert, flyttet eller slettet.

**Innstillinger**
- Nye seksjoner: Leksikon-struktur, Wikidata-felt-grupper, Wikidata (beskrivelse/alias/
  oversettelser), Interne ID-serier, Finjustering og Claude-prompter.
- Justerbar utdragslengde på pekersider (standard 140 tegn), terskel for
  «ser ut som forkortelse» (standard 6 tegn) og Dewey-fallback-URL.
- Mappevelger med autofullføring på leksikon-rot, mappe-scope og ID-seriers mappekilde.

### Endret

- Mappenavnene er ryddet: `00 Inboks` → **`00 Innboks`** og `01 mal` → **`01 Maler`**.
  Eksisterende mapper med de gamle navnene flyttes automatisk ved oppstart — innhold bevares.
- Ny undermappe `02 Notater/021 Artikkelnotater` opprettes sammen med resten av
  leksikon-strukturen.
- Utvidelsen heter nå **«Ordbok»** i plugin-listen (tidligere «Ordbok pekersider»); plugin-ID
  (`ordbok-pekersider`) og mappenavn er uendret, så oppdatering krever ingen flytting.
- Releaser inneholder nå `manifest.json` og `main.js` som egne, ikke-komprimerte filer, slik at
  installasjon og oppdatering via BRAT fungerer.

### Dokumentasjon

- README er skrevet om og utvidet med egne kapitler for Wikidata-import, ID-serier,
  Claude-integrasjon og avhengigheter.
- Ny seksjon **«Avhengigheter og anbefalte tillegg»**: utvidelsen har ingen eksterne
  kjøretidsavhengigheter, men [Nested Properties](https://github.com/mnaoumov/obsidian-nested-properties)
  anbefales sterkt for å kunne se/redigere de nestede feltene `autoritetsdata` og
  `Oversettelser` i Obsidians egenskapspanel, og Claude Code CLI kreves for Claude-funksjonene.
- Denne endringsloggen.

## [0.1.0] – 2026-07-22

Første release.

- Autogenererte **redirect-sider** for forkortelser med ett mål og **pekersider**
  (disambiguering) for forkortelser med flere mål, styrt av frontmatter-feltet `forkortelser`.
- Autogenererte **bokstav-indekssider** (`00 Index.md`) per mappe.
- **Leksikon-struktur** med rotmappe, bokstavmapper (A–Å, pluss `#` for titler som ikke starter
  på en bokstav), innboks og malmappe.
- Kommandoer: regenerering (alt / kun indekser), publisering fra innboks, organisering av alle
  sider, migrering fra `aliases` til `forkortelser`, sletting av alle autogenererte sider,
  oppdatering av «Se også»-seksjoner (fra `relatert`), og rapportene manglende artikler,
  mulige duplikater, foreldreløse artikler og leksikon-statistikk.
- Redigerbare maler for redirect-, innebygd redirect- og disambigueringssider.
- Bekreftelsesdialog med sammendrag før alle skrivende operasjoner; ekte (ikke-autogenererte)
  filer overskrives aldri — kollisjoner rapporteres.
- Innstillinger for case-sensitive forkortelser, innebygd artikkel på redirect-sider,
  leksikon-rotmappe og mappe-scope.
