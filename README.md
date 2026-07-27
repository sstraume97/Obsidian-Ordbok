---
uid: WYDsyY8tDb
---
# Ordbok

Obsidian-utvidelse som automatisk genererer pekersider (disambiguering) for alias/forkortelser
som finnes på flere sider, redirect-sider for alias som finnes på én side, bokstav-indekssider,
og som kan organisere et alfabetisk leksikon i egne bokstavmapper (A–Å) med en innboks-arbeidsflyt
for nye artikler. I tillegg kan den hente autoritetsdata fra Wikidata, dele ut interne
ID-numre etter egendefinerte serier, og sende en artikkel til Claude for omskriving eller
gjennomgang.

Alt utføres via manuelle kommandoer (kommandopalett, sidepanel eller ribbon-ikon) — ingenting
kjører automatisk i bakgrunnen eller ved lagring. Det eneste unntaket er at helt nye sider
opprettet i innboksen får artikkelmalens frontmatter-felt automatisk.

## Innhold

- [Installasjon](#installasjon)
- [Avhengigheter og anbefalte tillegg](#avhengigheter-og-anbefalte-tillegg)
- [Grunnleggende begreper](#grunnleggende-begreper)
- [Frontmatter-felt](#frontmatter-felt)
- [Kommandoer](#kommandoer)
- [Sidepanel](#sidepanel)
- [Innstillinger](#innstillinger)
- [Leksikon-struktur (mappe-organisering)](#leksikon-struktur-mappe-organisering)
- [Kjørelogger](#kjørelogger)
- [Maler](#maler)
- [Autoritetsdata og Wikidata-import](#autoritetsdata-og-wikidata-import)
- [Interne ID-serier](#interne-id-serier)
- [Claude-integrasjon](#claude-integrasjon)
- [Brukermanual / typiske arbeidsflyter](#brukermanual--typiske-arbeidsflyter)
- [Teknisk oppsummering](#teknisk-oppsummering)
- [Versjonshistorikk](#versjonshistorikk)

---

## Installasjon

### Manuell installasjon

1. Gå til [siste release](https://github.com/sstraume97/Obsidian-Ordbok/releases/latest) og
   last ned `manifest.json` og `main.js` (de ligger som egne filer i releasen — alternativt
   kan du laste ned `Ordbok-0.2.0.zip` og pakke ut de samme to filene).
2. Finn `.obsidian`-mappen i hvelvet ditt (skjult mappe i roten av hvelvet). Opprett mappen
   `.obsidian/plugins/ordbok-pekersider/` hvis den ikke finnes fra før.
3. Legg de to filene rett inn i den mappen, slik:
   ```
   <ditt-hvelv>/.obsidian/plugins/ordbok-pekersider/manifest.json
   <ditt-hvelv>/.obsidian/plugins/ordbok-pekersider/main.js
   ```
4. Åpne (eller start på nytt) Obsidian. Gå til **Innstillinger → Community plugins**.
   - Hvis «Restricted mode» er på, slå det av (Obsidian advarer om at community plugins kan
     kjøre vilkårlig kode — det gjelder alle plugins, ikke noe spesielt for denne).
5. Finn **«Ordbok»** i listen og slå den på.

Utvidelsen er nå aktiv — se [Kommandoer](#kommandoer) for hva den kan gjøre, og
[Brukermanual](#brukermanual--typiske-arbeidsflyter) for hvordan du kommer i gang.

**Oppdatering til en nyere versjon** senere: gjenta steg 1–3 (overskriv de to filene), og
reload Obsidian (Ctrl/Cmd+R eller restart appen). Innstillinger og data beholdes — de ligger i
`data.json` i samme mappe, som ikke røres av en oppdatering.

### Via BRAT (automatiske oppdateringer)

Fra og med 0.2.0 legges `manifest.json` og `main.js` ved som **egne, ikke-komprimerte filer** i
hver release, som er det [BRAT](https://github.com/TfTHacker/obsidian42-brat) krever for å kunne
installere og oppdatere automatisk.

1. Installer community-pluginet **«BRAT»**.
2. Kjør kommandoen **«BRAT: Add a beta plugin for testing»**.
3. Lim inn `https://github.com/sstraume97/Obsidian-Ordbok`.

BRAT henter da siste release og holder utvidelsen oppdatert.

---

## Avhengigheter og anbefalte tillegg

Utvidelsen har **ingen eksterne kjøretidsavhengigheter** — den bygges til én enkelt `main.js`
og bruker bare Obsidians eget API. Det finnes likevel to ting som er verdt å ha på plass,
avhengig av hvilke funksjoner du bruker:

| Avhengighet | Nødvendig for | Status |
|---|---|---|
| [**Nested Properties**](https://github.com/mnaoumov/obsidian-nested-properties) (av `mnaoumov`) | Å se og redigere de **nestede** frontmatter-feltene utvidelsen skriver (`autoritetsdata` med underfelt, og `Oversettelser`) i Obsidians vanlige egenskaps-/properties-visning. | Sterkt anbefalt |
| [**Claude Code CLI**](https://claude.com/claude-code) | Kommandoene under [Claude-integrasjon](#claude-integrasjon). | Valgfri — kun for Claude-funksjonene |

### Nested Properties

Obsidians innebygde egenskapsvisning håndterer ikke nestede YAML-objekter: et felt som

```yaml
autoritetsdata:
  wikidata: "[Q114403](https://www.wikidata.org/wiki/Q114403)"
  snl: "[psykologi](https://snl.no/psykologi)"
```

vises ikke som redigerbare underfelt i properties-panelet. Ordbok skriver og leser slike felt
uansett (via Obsidians `processFrontMatter`-API, som jobber direkte mot YAML-en og ikke er
avhengig av visningen), så **funksjonaliteten virker uten tillegget** — men du må da redigere
feltene i råtekst/kildemodus for å se eller endre dem.

Installer **Nested Properties** for å få dem frem som ordinære, redigerbare egenskaper:

- Community plugins → Browse → søk «Nested Properties» → Install → Enable, eller
- via BRAT med `https://github.com/mnaoumov/obsidian-nested-properties`.

Berører disse feltene fra Ordbok:

- `autoritetsdata` (og alle underfelt: `wikidata`, `wikipedia`, `snl`, `bibsys`, `viaf`,
  `dewey`, `humord`, samt vilkårlige Wikidata-egenskaper importert etter navn).
- `Oversettelser` (én nøkkel per språkkode, se [Wikidata-import](#autoritetsdata-og-wikidata-import)).

### Claude Code CLI

[Claude-integrasjonen](#claude-integrasjon) kjører Claude Code CLI-en som en lokal underprosess.
Den må være installert og innlogget på forhånd, og fungerer bare i **Obsidian desktop**
(krever Node sitt `child_process`-API, som ikke finnes på mobil). Sett kommandoen/stien i
innstillingene, og bruk **«Test Claude CLI-tilkobling»** for å bekrefte at det virker. Utvidelsen
sender ingenting til noen tjeneste av seg selv — kallet skjer bare når du selv kjører en
Claude-kommando.

---

## Grunnleggende begreper

| Begrep                           | Betydning                                                                                                                                                                                                 |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ekte side**                    | Et vanlig, håndskrevet notat/artikkel.                                                                                                                                                                    |
| **Autogenerert side**            | En side laget av utvidelsen (`auto-generated: true` i frontmatter). Blir aldri overskrevet manuelt av deg uten at det oppdages og ryddes opp ved neste kjøring.                                           |
| ↳ **Redirect-side**              | Autogenerert side for et alias/en forkortelse som peker til **én** ekte side. Filnavn = aliaset selv.                                                                                                     |
| ↳ **Pekerside (disambiguering)** | Autogenerert side for et alias/en forkortelse som finnes på **flere** ekte sider. Viser en liste med korte utdrag, så leseren kan velge riktig betydning.                                                 |
| ↳ **Indeksside**                 | Autogenerert side (`00 Index.md`) i hver bokstavmappe, med lenker til alle ekte artikler i mappen.                                                                                                        |
| **Artikkelnotat**                | Et eget notat knyttet til en artikkel (i dag: lagrede Claude-svar), lagt i `02 Notater/021 Artikkelnotater` og lenket fra artikkelens `notat`-felt. Ikke autogenerert i teknisk forstand — slettes aldri automatisk. |
| **Kollisjon**                    | Når et alias/en forkortelse tilfeldigvis har samme navn som en allerede eksisterende, ekte (ikke-autogenerert) fil. Utvidelsen overskriver **aldri** ekte filer — kollisjoner hoppes over og rapporteres. |

---

## Frontmatter-felt

| Felt | Hvor det brukes | Betydning |
|---|---|---|
| `forkortelser` | Ekte sider | Liste over alias/forkortelser som skal få egne redirect-/peker-sider. **Ikke** det samme som Obsidians innebygde `aliases`-felt — de to påvirker ikke hverandre, nettopp for å unngå at samme alias dukker opp dobbelt (én gang via Obsidians native alias-oppløsning, én gang som egen side). |
| `publiser` | Sider i `00 Innboks` | Boolsk (avkrysningsboks). Må være `true` før siden flyttes ut av innboksen. |
| `relatert` | Ekte sider | Liste over notatnavn som skal vises i en auto-oppdatert «Se også»-seksjon nederst i artikkelen. |
| `notat` | Ekte sider | Liste over wikilenker til artikkelens [artikkelnotater](#claude-integrasjon). Holdes alltid som liste, slik at én artikkel kan samle flere notater over tid. Skrives av «Legg til som artikkelnotat» i Claude-forslagsvinduet. |
| `autoritetsdata` | Ekte sider | **Nestet** felt med eksterne identifikatorer/lenker, se [Autoritetsdata](#autoritetsdata-og-wikidata-import). Krever [Nested Properties](#nested-properties) for å vises i egenskapspanelet. |
| `beskrivelse` | Ekte sider | Wikidatas korte beskrivelse av entiteten, hvis du velger å importere den. Skrives på øverste nivå, ikke under `autoritetsdata`. |
| `Oversettelser` | Ekte sider | **Nestet** felt med entitetens etikett på andre språk (én nøkkel per språkkode), hvis du velger å importere oversettelser. |
| `auto-generated` | Autogenererte sider | Alltid `true`. Dette er nøkkelfeltet utvidelsen bruker til å gjenkjenne sine egne sider — **fjern det aldri** fra en mal. |
| `cssclass: redirect` | Autogenererte sider | Gir en visuell markering (nedtonet + banner) i lesevisning, se [styling](#teknisk-oppsummering). |
| `redirect-target` | Redirect-sider | Wikilenke til målartikkelen. |
| `peker-til` | Pekersider | Liste over wikilenker til de flere målartiklene. |
| `index-for` | Indekssider | Hvilken bokstav/mappe indekssiden hører til. |
| `Kontrollert`, `def-type`, `aliases`, `Kategori`, `kilde`, `KI`, `uid` | Ekte sider | Standardfelt fra [artikkelmalen](#artikkelmal) — redigerbare, betyr ingenting for utvidelsens egen logikk (i motsetning til `forkortelser`/`publiser`/`relatert`/`notat`). `uid` er også standard målfelt for [interne ID-serier](#interne-id-serier). |

---

## Kommandoer

Alle kommandoer nås via kommandopaletten (Ctrl/Cmd+P), søk på «Ordbok» eller kommandonavnet.
De aller fleste finnes også som knapper i [sidepanelet](#sidepanel).

### Regenerer peker- og redirect-sider
Hovedkommandoen. Skanner alle ekte sider (innenfor [mappe-scope](#mapper)) for `forkortelser`,
bygger en full plan (nye/oppdaterte/slettede sider + eventuelle kollisjoner), og viser en
bekreftelsesdialog med et sammendrag **før** noe skrives. Ved bekreftelse:

- Oppretter/oppdaterer redirect-sider for forkortelser med ett mål.
- Oppretter/oppdaterer pekersider for forkortelser med flere mål.
- Oppretter/oppdaterer bokstav-indekssider (hvis [leksikon-rot](#leksikon-struktur-mappe-organisering) er satt).
- Rydder opp (sletter) autogenererte sider som ikke lenger trengs.
- Oppretter automatisk manglende bokstavmapper og [mal-/innboksmappe](#leksikon-struktur-mappe-organisering) ved behov.

Også tilgjengelig som ribbon-ikon (refresh-symbol) i venstre sidefelt.

### Regenerer indekssider
Samme som over, men begrenset til kun bokstav-indekssidene — rører ikke redirect-/pekersider.
Nyttig hvis du bare har flyttet/omdøpt artikler og vil oppdatere indeksene raskt.

### Migrer aliases til forkortelser
Engangsverktøy: kopierer eksisterende `aliases`-verdier inn i `forkortelser`-feltet for sider som
mangler det, uten å røre `aliases`. Kjør denne når du har eldre notater med `aliases` satt, men
ennå ikke har lagt dem inn i `forkortelser`.

### Slett alle autogenererte sider
Sletter samtlige autogenererte sider innenfor mappe-scope, med bekreftelsesdialog. De kan lages
på nytt med «Regenerer peker- og redirect-sider».

### Publiser sider fra innboks
Ser i `<leksikon-rot>/00 Innboks` etter sider med `publiser: true`. Sider som fortsatt inneholder
`[…]` (tegn på ufullstendig import) hoppes automatisk over og rapporteres. Resten flyttes til
riktig bokstavmappe (opprettet ved behov), og full regenerering kjøres etterpå slik at
forkortelse-/peker-sider for de nypubliserte artiklene opprettes i samme operasjon.

### Organiser alle sider
Bredere variant: flytter **alle** ekte sider hvor som helst under leksikon-roten (unntatt
innboksen og malmappen, som har egen håndtering) til riktig bokstavmappe, uansett om de kom fra
en gammel importmappe eller bare ligger feil plassert. Viser en oppdeling per kildemappe i
bekreftelsesdialogen, slik at du ser omfanget før du bekrefter.

### Vis manglende artikler
Skanner etter `[[wikilenker]]`/embeds uten noe faktisk lenkemål, og lister dem opp sortert etter
hvor mange steder de nevnes.

### Vis mulige duplikater
Grupperer ekte sider med (nesten) samme tittel — kun forskjell i store/små bokstaver og/eller et
tall-suffiks (f.eks. «DBT» og «DBT 2») regnes som mulig duplikat.

### Vis foreldreløse artikler
Lister ekte sider som ingen andre sider (verken ekte eller autogenererte) lenker til.

### Oppdater «Se også»-seksjoner
Leser `relatert`-feltet på hver ekte side og setter inn/oppdaterer en tydelig avgrenset
«Se også»-seksjon nederst i artikkelen (mellom skjulte HTML-kommentarer, så den trygt kan
regenereres uten å duplisere). Fjernes helt hvis `relatert` tømmes. Viser bekreftelse med antall
berørte artikler før noe skrives, siden dette endrer ekte innhold.

### Vis leksikon-statistikk
Ett vindu med: antall artikler per bokstav, innboks-status (totalt/klare for publisering),
hvor mange peker-/redirect-/indekssider som trenger handling, antall kollisjoner, og antall
manglende lenkemål.

### Bruk artikkelmal på eksisterende sider
Legger til manglende felt fra artikkelmalen (`01 Maler/Artikkel.md`) på alle eksisterende ekte
sider innenfor mappe-scope. Rører aldri felt/verdier som allerede finnes — kun helt manglende
felt legges til. Se [Artikkelmal](#artikkelmal).

### Hent autoritetsdata fra Wikidata
Søker Wikidata ut fra den aktive sidens tittel, lar deg velge riktig treff fra en liste, og
henter valgte felt (Wikipedia, SNL, NORAF/BIBSYS, VIAF, Dewey, og eventuelt alle andre
egenskaper entiteten har) inn i `autoritetsdata`-feltet. Se
[Autoritetsdata og Wikidata-import](#autoritetsdata-og-wikidata-import).

### Generer internt ID-nummer (aktiv side)
Tildeler den aktive siden neste nummer i en [ID-serie](#interne-id-serier), f.eks. `DEF-0007`.
Er det bare én serie, brukes den direkte; ellers får du en velger der serier som matcher sidens
mappe/tag er merket «anbefalt». Et felt som allerede har en verdi overskrives aldri.

### Masse-generer ID-numre for en serie
Samme som over, men for alle sider som matcher en serie sin mappe/tag og som ennå mangler
verdi i målfeltet. Viser antall og startnummer i en bekreftelsesdialog, og lister opp alle
tildelte numre etterpå. Serier satt til «manuelt» kan ikke masse-tildeles (de har ingen
kilde å skanne).

### Foreslå omskriving med Claude (aktiv side)
Sender den aktive siden (frontmatter + brødtekst) til Claude Code CLI sammen med en av dine
[egendefinerte prompter](#claude-integrasjon), og viser svaret i et forslagsvindu. Krever
Obsidian desktop.

### Test Claude CLI-tilkobling
Kjører et minimalt, ufarlig kall mot CLI-en (uten å røre noen side) og viser hele det rå svaret
— eller hele feilmeldingen. Bruk denne til å feilsøke sti/PATH eller innlogging.

### Åpne Ordbok-panel
Åpner [sidepanelet](#sidepanel) med knapper for alle kommandoene over.

---

## Sidepanel

Alle kommandoer er også tilgjengelige som knapper i et eget sidepanel, gruppert i
«Leksikon-arbeidsflyt», «Regenerering», «Vedlikehold», «Interne ID-numre», «Claude» og
«Rapporter» — et alternativ til å søke opp hver kommando i kommandopaletten. Åpnes med
**«Åpne Ordbok-panel»** eller bok-ikonet i venstre sidefelt (ribbon).

---

## Innstillinger

Innstillinger → Community plugins → **Ordbok**. Innstillingene er delt i seksjoner:

### Generelt

| Innstilling | Standard | Beskrivelse |
|---|---|---|
| **Case-sensitive forkortelser** | Av | Når av, slås skrivemåter som bare skiller seg i store/små bokstaver og/eller mellomrom sammen til én side (f.eks. «Adm.dir.» og «adm. dir.»). Filnavnet velges ut fra hvilken skrivemåte som forekommer oftest (alfabetisk først ved likt antall). |
| **Bygg inn artikkelen på redirect-sider** | Av | Når på, viser redirect-siden en innebygd kopi av selve artikkelen (med en info-callout øverst), i stedet for bare en lenke. Gjelder ikke pekersider. |

### Leksikon-struktur

| Innstilling | Standard | Beskrivelse |
|---|---|---|
| **Leksikon-rotmappe** | Tom (av) | Rotmappen for et alfabetisk leksikon, se [neste seksjon](#leksikon-struktur-mappe-organisering). Feltet har mappeforslag mens du skriver. |

### Wikidata-felt-grupper

| Innstilling | Standard | Beskrivelse |
|---|---|---|
| **Rediger gruppe** / **Sett som aktiv** / **Slett gruppe** | Én gruppe («Standard») | Én eller flere navngitte feltlister for Wikidata-import. Gruppen merket «aktiv» forhåkes i import-vinduet. Minst én gruppe må alltid finnes. |
| **Navn på gruppen** | «Standard» | Fritt navn, f.eks. «Personer» eller «Steder». |
| **Feltliste** | Wikipedia, SNL (P4342), BIBSYS/NORAF (P1015), VIAF (P214), Dewey (P1036) | Feltene i importrekkefølge. Kan omorganiseres med dra-og-slipp eller opp/ned-piler, og fjernes enkeltvis. |
| **Legg til felt** | — | Godtar `wikipedia`, `description`, `alias`, `translation:<språk>` (f.eks. `translation:en`) eller en Wikidata-egenskaps-ID (`P8370`). Navnet slås automatisk opp mot Wikidata og vises i listen, f.eks. «P8370 — UN Thesaurus ID». Ugyldige/ukjente ID-er avvises. |
| **Ny gruppe** | — | Oppretter en tom gruppe. |

### Wikidata: beskrivelse, alias og oversettelser

Dette er ikke vanlige Wikidata-egenskaper (Pxxx), men hentes fra entitetens egne beskrivelse-,
alias- og etikettdata. Slå på det du vil ha tilgjengelig i import-vinduet, og velg språk.

| Innstilling | Standard | Beskrivelse |
|---|---|---|
| **Importer beskrivelse** | Av | Gjør entitetens Wikidata-beskrivelse valgbar som felt i import-vinduet (skrives til `beskrivelse`). |
| **Språk for beskrivelse** | `nb,en` | Kommaseparerte språkkoder i prioritert rekkefølge — første språk med en verdi brukes. |
| **Importer alias** | Av | Gjør entitetens Wikidata-alias (alternative navn) valgbare. Ved import åpnes [alias-triage-vinduet](#alias-triage). |
| **Språk for alias** | `nb,en` | Som over — første språk med treff brukes. |
| **Importer oversettelser** | Av | Gjør entitetens etiketter på andre språk valgbare som egne rader (én rad per språk), skrives til `Oversettelser`. |
| **Språk for oversettelser** | `en` | Kommaseparerte språkkoder — én rad per språk som faktisk har en etikett, f.eks. `en,de,fr`. |

### Interne ID-serier

| Innstilling | Standard | Beskrivelse |
|---|---|---|
| **Serier** (kort) | Ingen | Én boks per serie med **Navn**, **Prefiks**, **Antall siffer**, **Neste nummer**, **Frontmatter-felt** og **Kilde** (Manuelt / Mappe / Tag, med mappevelger). Se [Interne ID-serier](#interne-id-serier). |
| **Ny ID-serie** | — | Oppretter en tom serie (standard: 4 siffer, start på 1, felt `uid`, kilde «manuelt») som du konfigurerer etterpå. |

### Finjustering

| Innstilling | Standard | Beskrivelse |
|---|---|---|
| **Utdragslengde på pekersider** | 140 | Maks antall tegn i utdraget som vises for hver artikkel på en pekerside, før teksten kuttes med «…». |
| **Terskel for «ser ut som forkortelse»** | 6 | I [alias-triage-vinduet](#alias-triage) forhåndsvelges «Forkortelse» for alias uten mellomrom som er like lange eller kortere enn dette. Rent gjetteforsøk, alltid overstyrbart. |
| **Dewey-fallback-URL** | `https://data.ub.uio.no/skosmos/ddc/nb/search?clang=nb&q=$1` | URL-mal brukt til å lenke Dewey-tall (P1036), siden Wikidatas egen formatter-URL peker til nedlagte `dewey.info`. `$1` erstattes med selve tallet. |

### Claude-prompter

| Innstilling | Standard | Beskrivelse |
|---|---|---|
| **Claude CLI-kommando** | `claude` | Kommandoen som kjøres — må finnes i PATH, ellers oppgi full sti. |
| **Tidsavbrudd (sekunder)** | 120 | Maks ventetid på svar før kallet avbrytes. |
| **Test Claude CLI-tilkobling** | — | Knapp som kjører et minimalt testkall og viser rått svar eller full feilmelding. |
| **Prompter** (kort) | 11 innebygde | Én boks per prompt med **Navn**, **Prompt** (fritekst, `{{tittel}}` erstattes med filnavnet) og **Full sideerstatning** (på/av). Se [Claude-integrasjon](#claude-integrasjon). |
| **Ny Claude-prompt** | — | Oppretter en tom prompt. |

### Mapper

| Innstilling | Standard | Beskrivelse |
|---|---|---|
| **Mapper** (liste) | Tom (= hele hvelvet) | Begrenser hvilke mapper kommandoene skanner i, med valg om undermapper skal inkluderes per mappe. |

---

## Leksikon-struktur (mappe-organisering)

Når **Leksikon-rotmappe** er satt (f.eks. til `Div 2`), aktiveres et sett med relaterte
funksjoner:

```
Div 2/
├── 00 Innboks/           ← nye artikler starter her
├── 01 Maler/             ← redigerbare maler, se under
│   ├── Redirect.md
│   ├── Redirect (innebygd).md
│   ├── Disambiguering.md
│   └── Artikkel.md       ← frontmatter-mal for ekte artikler
├── 02 Notater/           ← kjørelogger, se under
│   ├── 021 Artikkelnotater/   ← lagrede Claude-svar, lenket fra artikkelens «notat»-felt
│   └── 2026-07-22/
│       └── 2026-07-22 23-45-12.md
├── A/
│   ├── 00 Index.md       ← autogenerert, lenker til alt i mappen
│   ├── AA.md             ← autogenerert redirect
│   └── Anonyme Alkoholikere.md   ← ekte artikkel
├── B/
│   └── …
└── … (Ø)
```

- **Bokstavmapper opprettes kun ved behov** — aldri på forhånd/spekulativt. En bokstav uten
  noen artikler får aldri en tom mappe.
- Forkortelse-/disambigueringssider for artikler under leksikon-roten plasseres etter
  **forkortelsens egen forbokstav**, ikke artikkelens mappe (f.eks. havner «AI» i `A`-mappen
  selv om målartikkelen «Kunstig intelligens» ligger i `K`).
- `00 Innboks`, `01 Maler`, `02 Notater` og `02 Notater/021 Artikkelnotater` opprettes
  automatisk (med standardmaler i `01 Maler`) så snart leksikon-rotmappen settes, ved
  plugin-oppstart, og som sikkerhetsnett ved regenerering. Eldre mapper med de gamle navnene
  (`00 Inboks`, `01 mal`) flyttes automatisk til de nye navnene ved samme anledning — innhold
  bevares.
- Titler som ikke starter på en bokstav (f.eks. tall) havner i en felles `#`-mappe.

**Publiseringsflyt for nye artikler:**
1. Opprett et nytt notat i `00 Innboks` — får automatisk artikkelmalens frontmatter-felt.
2. Skriv artikkelen, sett gjerne `forkortelser` hvis den skal ha egne peker-sider.
3. Sett `publiser: true` i frontmatter når den er klar.
4. Kjør **«Publiser sider fra innboks»**.

Uten leksikon-rot fungerer utvidelsen fortsatt: peker-/redirect-sider legges da i den nærmeste
felles mappen til artiklene de peker til, og indekssider/innboksflyt/kjørelogger er avslått.
Artikkelnotater fra Claude legges i så fall i `02 Notater/021 Artikkelnotater` rett under
hvelvroten.

---

## Kjørelogger

Hver skrivende kommando (regenerering, publisering, organisering, migrering, sletting,
«Se også»-oppdatering, artikkelmal-bruk, ID-generering, brukte/lagrede Claude-forslag og
Wikidata-import) skriver en loggfil til
`02 Notater/ÅÅÅÅ-MM-DD/ÅÅÅÅ-MM-DD TT-MM-SS.md` med hva som ble opprettet, oppdatert, flyttet
eller slettet i den kjøringen. Rent oppslagsverk for å spore hva utvidelsen faktisk har gjort —
skrives ikke hvis leksikon-rot ikke er satt.

---

## Maler

Malfilene i `01 Maler` er vanlig Markdown med plassholdere i `{{dobbel krøllparentes}}`-format:

| Mal | Brukt når | Plassholdere |
|---|---|---|
| `Redirect.md` | Enkelt alias, «Bygg inn artikkelen» er av | `{{artikkel}}` |
| `Redirect (innebygd).md` | Enkelt alias, «Bygg inn artikkelen» er på | `{{artikkel}}` |
| `Disambiguering.md` | Alias på flere sider | `{{alias}}`, `{{peker-til-liste}}` (YAML-listeblokk), `{{liste}}` (ferdigformatert punktliste i callout) |

Du kan redigere ordlyd, callout-type/farge, ekstra frontmatter-felt osv. fritt. Den eneste
regelen: **ikke fjern `auto-generated: true`** fra frontmatter — det er slik utvidelsen
gjenkjenner og trygt kan regenerere/rydde opp i sine egne sider senere. Standardmalene har en
YAML-kommentar som påminnelse.

Hvis en malfil slettes eller mangler, faller utvidelsen automatisk tilbake til de innebygde
standardmalene (samme innhold som opprettes første gang).

### Artikkelmal

`01 Maler/Artikkel.md` er annerledes enn de tre over — den er ikke en mal for autogenererte
sider, men for **ekte artikler**. Frontmatter-feltene der (standard: `Kontrollert`, `def-type`,
`aliases`, `Kategori`, `kilde`, `KI`, `uid`, `forkortelser`, `publiser`, og et nestet
`autoritetsdata`-felt, se under) blir:

- Satt automatisk på enhver ny side du oppretter direkte i `00 Innboks`.
- Lagt til (kun manglende felt, aldri overskrevet) på sider som allerede ligger i `00 Innboks`,
  hver gang leksikon-oppsettet sjekkes (oppstart, innstillingsendring, regenerering).
- Lagt til på **alle** eksisterende ekte sider i hele mappe-scopet med kommandoen
  **«Bruk artikkelmal på eksisterende sider»**.

For `autoritetsdata` (et nestet felt) gjelder samme «kun manglende»-logikk ett nivå ned — får
malen et nytt underfelt senere, legges det til på eksisterende sider uten å røre underfelt som
allerede har en verdi.

Rediger denne malen fritt for å endre hvilke felt nye/eksisterende artikler skal ha.

---

## Autoritetsdata og Wikidata-import

Standard `autoritetsdata`-struktur:

```yaml
autoritetsdata:
  wikidata:   # Wikidata-entitetsidentifikator (f.eks. Q12345)
  wikipedia:  # lenke
  snl:        # lenke til Store norske leksikon
  bibsys:     # NORAF/BIBSYS-ID (Felles autoritetsregister for personer og korporasjoner)
  viaf:       # lenke til VIAF-posten
  dewey:      # Dewey Decimal Classification-kode
  humord:     # ikke hentbar fra Wikidata (se under) — fylles inn manuelt
```

> Dette er et **nestet** felt. Installer [Nested Properties](#nested-properties) hvis du vil se
> og redigere underfeltene i Obsidians egenskapspanel.

Kommandoen **«Hent autoritetsdata fra Wikidata»** (også i sidepanelet) tar utgangspunkt i den
aktive siden:

1. Søker Wikidata (forhåndsutfylt med sidens tittel, kan justeres) og viser en liste med treff
   (etikett, beskrivelse, Q-ID) å velge mellom.
2. Henter **alle** felt Wikidata har registrert for den valgte entiteten — ikke bare de kjente
   autoritetsfeltene — og viser dem som en avkrysningsliste (verdi(er) vist under hver
   feltetikett). Wikidata-IDen importeres alltid, uavhengig av avkrysning.
3. Feltene i den **aktive gruppen** (se [Wikidata-felt-grupper](#wikidata-felt-grupper)) er
   forhåket som standard; alle andre felt entiteten har vises også, men er ikke forhåket. Du kan
   bytte til en annen lagret gruppe rett i import-vinduet («Bruk gruppe») uten å gå via
   innstillingene.
4. Til høyre vises **«Valgte felt»** i den rekkefølgen de skrives til siden — juster med
   dra-og-slipp, opp/ned-piler, eller fjern enkeltfelt med krysset.

| Felt | Wikidata-egenskap |
|---|---|
| `wikipedia` | Wikipedia-sitelink (norsk bokmål foretrukket, deretter nynorsk/no, engelsk som reserve) |
| `snl` | **P4342** (Store norske leksikon-ID) |
| `bibsys` | P1015 (BIBSYS/NORAF-ID) |
| `viaf` | P214 (VIAF-ID) |
| `dewey` | P1036 (Dewey Decimal Classification) — flere verdier (f.eks. to Dewey-koder på samme entitet) lagres som en YAML-liste, ikke bare den første |

**Humord har ingen tilsvarende Wikidata-egenskap** og må derfor fylles inn manuelt, f.eks. ved
oppslag på [data.ub.uio.no/skosmos/humord](https://data.ub.uio.no/skosmos/humord/).

Felt utover de kjente lagres under `autoritetsdata` med Wikidata-egenskapens etikett som
nøkkel (f.eks. `Fødselsdato (P569): 1889-04-20`).

**Lenker bygges på samme måte som Wikidata selv gjør det**: for hver egenskap slås dens egen
«formatter URL» (Wikidata-egenskap P1630) opp og brukes til å konstruere den faktiske lenken
(f.eks. VIAF-IDen `12345` blir `https://viaf.org/viaf/12345`), og entitetsreferanser (f.eks.
«instans av») lenkes til den refererte entitetens egen Wikidata-side. Har en egenskap ingen
formatter-URL på Wikidata, vises verdien uten lenke (unntak: SNL og VIAF har en innebygd
reservelenke, og Dewey bruker alltid [Dewey-fallback-URL-en](#finjustering) fordi Wikidatas
offisielle mønster peker til nedlagte `dewey.info`). Alle lenkede verdier lagres i formatet
**`[verdi](lenke)`** — samme mønster som Wikidata selv bruker — f.eks.
`wikidata: "[Q114403](https://www.wikidata.org/wiki/Q114403)"`.

I motsetning til den stille artikkelmal-utfyllingen ellers, **overskriver** Wikidata-importen
eksisterende verdier for feltene du haker av — det er en bevisst, manuelt igangsatt handling. Et
kjent felt (Wikipedia/SNL/BIBSYS/VIAF/Dewey) som *ikke* importeres i en gitt kjøring — enten fordi
det ble avhaket, eller fordi Wikidata ikke har noen verdi for det på denne entiteten — **fjernes**
fra siden i stedet for å stå igjen tomt. Det samme gjelder `beskrivelse` og de enkelte
språknøklene under `Oversettelser`. Bruker Obsidians `requestUrl` (ingen egen
frontend-avhengighet) mot Wikidatas offentlige API.

**Flere lagrede grupper** («Wikidata-felt-grupper» i innstillingene): du kan ha flere navngitte
feltlister samtidig (f.eks. «Personer» og «Steder»), hver med sitt eget sett med felt i egen
rekkefølge. Én gruppe er alltid markert **aktiv** (forhåkes automatisk ved import); resten
velges manuelt fra dropdownen «Bruk gruppe» i import-vinduet. Håndteres fra innstillingene:
velg hvilken gruppe du redigerer i «Rediger gruppe»-dropdownen, gi den et navn, sett den som
aktiv, eller slett den (minst én gruppe må alltid finnes). «Ny gruppe» oppretter en tom en.

**Rekkefølgen på feltene** (som blir rekkefølgen de skrives inn i `autoritetsdata`) kan
justeres to steder, begge med **dra-og-slipp** i tillegg til opp/ned-piler:

- **Gruppens feltliste** i innstillingene: legg til med «wikipedia» eller en Pxxx-ID —
  feltnavnet slås automatisk opp og vises, f.eks. skriver du inn `P8370` og listen viser
  «P8370 — UN Thesaurus ID».
- **Import-vinduet**: viser en «Valgte felt»-liste til høyre for avkrysningslisten, i
  importrekkefølge, med et kryss for å fjerne — oppdateres live etter hvert som du haker av/på
  felt til venstre.

### Beskrivelse, alias og oversettelser

I tillegg til vanlige Wikidata-egenskaper kan importen hente tre ting fra entitetens egne
språkdata. Alle tre er avslått som standard og slås på i
[innstillingene](#wikidata-beskrivelse-alias-og-oversettelser):

| Rad i import-vinduet | Skrives til | Merknad |
|---|---|---|
| **Beskrivelse** | `beskrivelse` (øverste nivå) | Første språk i listen som har en verdi. |
| **Alias** | `forkortelser` og/eller `aliases` | Går via [alias-triage](#alias-triage) — se under. |
| **Oversettelse (`<språk>`)** | `Oversettelser.<språk>` (nestet) | Én rad per språk i listen som har en etikett. |

Disse vises i en egen bolk øverst i import-vinduet («Beskrivelse, alias og oversettelser»), over
de vanlige Wikidata-egenskapene, og kan legges inn i en feltgruppe som `description`, `alias`
eller `translation:<språk>`.

### Alias-triage

Wikidata skiller ikke mellom «forkortelse» og «alternativt navn» — begge er bare alias. Velger
du å importere alias, åpnes derfor et eget vindu der du for hvert alias trykker **Forkortelse**
eller **Alias**:

- **Forkortelse** → legges til i `forkortelser`, og får dermed sin egen redirect-/pekerside ved
  neste regenerering.
- **Alias** → legges til i Obsidians eget `aliases`-felt, som kun brukes til søk og
  autofullføring.

Forhåndsvalget er et rent gjetteforsøk: alias uten mellomrom som er like korte eller kortere enn
[terskelen](#finjustering) (standard 6 tegn) foreslås som forkortelse, resten som alias. Begge
listene **utvides** (union med eksisterende verdier) — i motsetning til autoritetsdata-feltene
blir ingenting overskrevet eller fjernet her, siden disse feltene brukes andre steder i hvelvet.

---

## Interne ID-serier

En **ID-serie** deler ut interne løpenummer til artikler, f.eks. `DEF-0001`, `DEF-0002` … Serier
settes opp i innstillingene (**Interne ID-serier**), og hver serie har:

| Felt | Betydning |
|---|---|
| **Navn** | Vises i velgeren og i kjøreloggen. |
| **Prefiks** | Tekst foran nummeret, f.eks. `DEF-`. Kan være tomt. |
| **Antall siffer** | Nullutfylling — `4` gir `0007`. |
| **Neste nummer** | Nummeret som deles ut neste gang. Økes automatisk etter hver tildeling, men kan settes manuelt (f.eks. hvis du starter midt i en eksisterende nummerserie). |
| **Frontmatter-felt** | Hvilket felt ID-en skrives til, f.eks. `uid`. |
| **Kilde** | `Manuelt` (velges alltid eksplisitt), `Mappe` (matcher sider i mappen og undermapper) eller `Tag` (matcher sider med taggen). |

Brukes med to kommandoer/panelknapper:

- **Generer internt ID-nummer (aktiv side)** — finnes bare én serie, brukes den direkte.
  Ellers vises en velger der serier som matcher sidens mappe/tag er merket «(anbefalt)», og
  hver serie viser hvilket nummer og felt som står for tur.
- **Masse-generer ID-numre for en serie** — velg serie, få opp en bekreftelsesdialog med antall
  sider og startnummer, og en full liste over tildelte numre etterpå.

Sikkerhetsregler:

- Et felt som **allerede har en verdi overskrives aldri** — verken enkeltvis eller i massevis.
  Ved enkelttildeling får du en melding om at verdien allerede finnes.
- Autogenererte sider hoppes alltid over ved masse-tildeling.
- Serier med kilde «manuelt» kan ikke masse-tildeles — de har ingen mappe/tag å skanne. Sett
  kilde til mappe eller tag, eller bruk enkeltkommandoen.
- Hver tildeling logges i [kjøreloggen](#kjørelogger).

---

## Claude-integrasjon

Kommandoen **«Foreslå omskriving med Claude (aktiv side)»** sender hele den aktive siden
(frontmatter + brødtekst) til [Claude Code CLI](#claude-code-cli) sammen med en valgt prompt, og
viser svaret i et forslagsvindu du selv bestemmer hva som skal skje med.

**Forutsetninger:** Obsidian desktop (CLI-en kjøres som en lokal underprosess), og en installert,
innlogget Claude Code CLI. Ingenting sendes noe sted før du selv kjører kommandoen.

**Slik virker det:**

1. Har du flere prompter, velger du én i en liste (navn, om den gir «omskriving» eller
   «rapport», og selve prompteteksten). Er det bare én, brukes den direkte.
2. Prompten sendes som instruksjon, sideinnholdet via stdin (kommandoen som kjøres er
   `<cli> -p "<prompt>" --output-format text`, med hvelvroten som arbeidsmappe).
3. Svaret vises i et forslagsvindu med knappene:
   - **Kopier til utklippstavle** — alltid tilgjengelig.
   - **Legg til som artikkelnotat** — lagrer svaret som et eget notat i
     `02 Notater/021 Artikkelnotater`, og lenker til det fra artikkelens `notat`-felt (som
     alltid holdes som en liste, så en artikkel kan samle flere notater over tid).
   - **Bruk (erstatt hele siden)** — kun for prompter med «Full sideerstatning» på. Erstatter
     hele filinnholdet, inkludert frontmatter.
   - **Avbryt / Lukk** — siden røres ikke.

Siden endres altså **aldri** automatisk — «Bruk» er alltid et bevisst valg etter at du har lest
forslaget.

### Prompter

Prompter redigeres fritt i innstillingene. Hver prompt har et navn, selve prompteteksten (der
`{{tittel}}` erstattes med filnavnet uten filendelse) og en bryter:

- **Full sideerstatning på** — Claude bes returnere hele den oppdaterte filen, og
  forslagsvinduet får «Bruk (erstatt hele siden)»-knappen.
- **Full sideerstatning av** — for prompter som skal gi en rapport eller liste i stedet for en
  omskriving. Da tilbys bare «Kopier» og «Legg til som artikkelnotat», siden det ikke gir mening
  å erstatte artikkelen med en rapport om den.

Utvidelsen kommer med 11 ferdige prompter, som alle kan endres eller slettes:

| Prompt | Type |
|---|---|
| Skriv om for lesbarhet | omskriving |
| Rett skrivefeil og grammatikk | omskriving |
| Forkort til kjernen | omskriving |
| Formaliser tonen | omskriving |
| Utvid stubb-artikkel (fyller ut `[…]`-markører) | omskriving |
| Generer et innledende definisjonsavsnitt | omskriving |
| Oversett til bokmål (eller motsatt) | omskriving |
| Lenk artikkelen til andre relaterte artikler med wikilenker | omskriving |
| Foreslå «Se også»-kandidater (klare for `relatert`-feltet) | rapport |
| Sjekk for foreldet/faktisk tvilsom informasjon | rapport |
| Sjekk sitering/kilder for innholdet | rapport |

### Feilsøking

- **«Fant ikke Claude CLI på …»** — kommandoen finnes ikke i PATH. Sett full sti (inkludert
  filendelse) i innstillingene. På Windows prøver utvidelsen automatisk `.cmd`-varianten hvis
  det første forsøket feiler, siden npm-installerte CLI-er ofte ligger som `claude.cmd`.
- **«Claude CLI avsluttet med feilkode …»** — typisk manglende innlogging. Feilmeldingen viser
  både stdout og stderr fra CLI-en.
- **Tidsavbrudd** — juster «Tidsavbrudd (sekunder)» i innstillingene (standard 120).
- Bruk **«Test Claude CLI-tilkobling»** for å se det rå svaret/feilmeldingen uten å røre en side.

---

## Brukermanual / typiske arbeidsflyter

### Sette opp for første gang
1. Innstillinger → Ordbok → sett **Leksikon-rotmappe** til den mappen som skal
   inneholde det alfabetiske leksikonet.
2. Reload Obsidian (eller vent — mappene opprettes automatisk).
3. Kjør **«Organiser alle sider»** for å samle eksisterende, spredte artikler i riktige
   bokstavmapper (se oppdelingen i bekreftelsesdialogen — sider med gjenværende `[…]` flyttes
   ikke automatisk, avbryt og rydd opp først hvis mye av innholdet er uferdige importer).
4. Kjør **«Migrer aliases til forkortelser»** hvis artiklene har `aliases` fra før.
5. Kjør **«Bruk artikkelmal på eksisterende sider»** for å fylle inn standardfeltene på alt som
   mangler dem.
6. Kjør **«Regenerer peker- og redirect-sider»**.
7. Valgfritt: installer [Nested Properties](#nested-properties) hvis du vil redigere
   `autoritetsdata` i egenskapspanelet, og sett opp [ID-serier](#interne-id-serier) og
   [Claude](#claude-integrasjon).

### Legge til en ny artikkel
1. Nytt notat i `00 Innboks`.
2. Fyll ut innhold, sett `forkortelser` ved behov.
3. Sett `publiser: true` når klar.
4. Kjør **«Publiser sider fra innboks»**.

### Legge til en forkortelse på en eksisterende artikkel
1. Legg forkortelsen til i `forkortelser`-feltet.
2. Kjør **«Regenerer peker- og redirect-sider»**.

### Berike en artikkel med autoritetsdata
1. Åpne artikkelen.
2. Kjør **«Hent autoritetsdata fra Wikidata»**, søk opp og velg riktig entitet.
3. Juster avkryssing og rekkefølge, klassifiser eventuelle alias, og importer.

### Rydde opp / vedlikehold
- **«Vis manglende artikler»** — finn ødelagte lenker.
- **«Vis mulige duplikater»** — finn sannsynlige dubletter fra import.
- **«Vis foreldreløse artikler»** — finn artikler ingen lenker til.
- **«Vis leksikon-statistikk»** — rask oversikt over tilstanden.

### Angre / gå tilbake
Alle skrive-/sletteoperasjoner viser en bekreftelsesdialog med tydelig sammendrag først. Hvis
noe likevel blir feil: autogenererte sider er trygt å slette (**«Slett alle autogenererte
sider»**) og lage på nytt (**«Regenerer»**) — ekte artikler flyttes bare med Obsidians egen
`renameFile`, som oppdaterer alle lenker automatisk og kan angres manuelt ved å flytte tilbake.
Claude-forslag og Wikidata-import endrer ekte innhold, men bare etter at du har bekreftet i
vinduet — og hva som ble gjort står i [kjøreloggen](#kjørelogger).

---

## Teknisk oppsummering

- **Byggekommandoer**: `npm install`, `npm run dev` (esbuild watch), `npm run build`
  (typesjekk + produksjonsbygg).
- **Kildekode**: alt i [main.ts](main.ts) (én fil, ingen eksterne kjøretidsavhengigheter utover
  Obsidian-API-et). Bygges til én `main.js` med esbuild.
- **Obsidian-API-er i bruk**: `processFrontMatter` (all frontmatter-skriving, også nestet),
  `renameFile` (flytting, med automatisk lenkeoppdatering), `metadataCache`, `requestUrl`
  (Wikidata), `AbstractInputSuggest` (mappevelgere), `ItemView` (sidepanel), `Platform`
  (desktop-sjekk) og `FileSystemAdapter` (hvelvsti til Claude CLI).
- **Node-API-er**: kun `child_process` (Claude CLI), som er grunnen til at Claude-funksjonene
  er desktop-only. Resten av utvidelsen fungerer på mobil (`isDesktopOnly: false`).
- **Styling**: injiseres av pluginet selv ved `onload()` (ikke en separat `styles.css`-fil) —
  gir `cssclass: redirect`-siders nedtonede visning, de to egendefinerte callout-typene
  (`disambiguering` med lenke-ikon, `pekerside` med info-ikon, begge i samme blåfarge som
  Obsidians innebygde `note`), og oppsettet i sidepanelet/import-vinduene.
- **Installasjon lokalt**: kopier `manifest.json` og `main.js` (bygget fra `main.ts`) til
  `.obsidian/plugins/ordbok-pekersider/` i hvelvet, og aktiver under Community plugins.

---

## Versjonshistorikk

Se [CHANGELOG.md](CHANGELOG.md) for hva som er endret i hver versjon.
