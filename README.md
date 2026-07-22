---
uid: ordbok-pekersider-readme
---
# Ordbok pekersider

Obsidian-utvidelse som automatisk genererer pekersider (disambiguering) for alias/forkortelser
som finnes på flere sider, redirect-sider for alias som finnes på én side, bokstav-indekssider,
og som kan organisere et alfabetisk leksikon i egne bokstavmapper (A–Å) med en innboks-arbeidsflyt
for nye artikler.

Alt utføres via manuelle kommandoer (kommandopalett eller ribbon-ikon) — ingenting kjører
automatisk i bakgrunnen eller ved lagring.

## Innhold

- [Grunnleggende begreper](#grunnleggende-begreper)
- [Frontmatter-felt](#frontmatter-felt)
- [Kommandoer](#kommandoer)
- [Innstillinger](#innstillinger)
- [Leksikon-struktur (mappe-organisering)](#leksikon-struktur-mappe-organisering)
- [Maler](#maler)
- [Brukermanual / typiske arbeidsflyter](#brukermanual--typiske-arbeidsflyter)
- [Teknisk oppsummering](#teknisk-oppsummering)

---

## Grunnleggende begreper

| Begrep                           | Betydning                                                                                                                                                                                                 |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ekte side**                    | Et vanlig, håndskrevet notat/artikkel.                                                                                                                                                                    |
| **Autogenerert side**            | En side laget av utvidelsen (`auto-generated: true` i frontmatter). Blir aldri overskrevet manuelt av deg uten at det oppdages og ryddes opp ved neste kjøring.                                           |
| ↳ **Redirect-side**              | Autogenerert side for et alias/en forkortelse som peker til **én** ekte side. Filnavn = aliaset selv.                                                                                                     |
| ↳ **Pekerside (disambiguering)** | Autogenerert side for et alias/en forkortelse som finnes på **flere** ekte sider. Viser en liste med korte utdrag, så leseren kan velge riktig betydning.                                                 |
| ↳ **Indeksside**                 | Autogenerert side (`00 Index.md`) i hver bokstavmappe, med lenker til alle ekte artikler i mappen.                                                                                                        |
| **Kollisjon**                    | Når et alias/en forkortelse tilfeldigvis har samme navn som en allerede eksisterende, ekte (ikke-autogenerert) fil. Utvidelsen overskriver **aldri** ekte filer — kollisjoner hoppes over og rapporteres. |

---

## Frontmatter-felt

| Felt | Hvor det brukes | Betydning |
|---|---|---|
| `forkortelser` | Ekte sider | Liste over alias/forkortelser som skal få egne redirect-/peker-sider. **Ikke** det samme som Obsidians innebygde `aliases`-felt — de to påvirker ikke hverandre, nettopp for å unngå at samme alias dukker opp dobbelt (én gang via Obsidians native alias-oppløsning, én gang som egen side). |
| `publiser` | Sider i `00 Inboks` | Boolsk (avkrysningsboks). Må være `true` før siden flyttes ut av innboksen. |
| `relatert` | Ekte sider | Liste over notatnavn som skal vises i en auto-oppdatert «Se også»-seksjon nederst i artikkelen. |
| `auto-generated` | Autogenererte sider | Alltid `true`. Dette er nøkkelfeltet utvidelsen bruker til å gjenkjenne sine egne sider — **fjern det aldri** fra en mal. |
| `cssclass: redirect` | Autogenererte sider | Gir en visuell markering (nedtonet + banner) i lesevisning, se [styling](#teknisk-oppsummering). |
| `redirect-target` | Redirect-sider | Wikilenke til målartikkelen. |
| `peker-til` | Pekersider | Liste over wikilenker til de flere målartiklene. |
| `index-for` | Indekssider | Hvilken bokstav/mappe indekssiden hører til. |

---

## Kommandoer

Alle kommandoer nås via kommandopaletten (Ctrl/Cmd+P), søk på «Ordbok» eller kommandonavnet.

### Regenerer peker- og redirect-sider
Hovedkommandoen. Skanner alle ekte sider (innenfor [mappe-scope](#innstillinger)) for `forkortelser`,
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
Ser i `<leksikon-rot>/00 Inboks` etter sider med `publiser: true`. Sider som fortsatt inneholder
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

---

## Innstillinger

Innstillinger → Community plugins → **Ordbok pekersider**.

| Innstilling | Standard | Beskrivelse |
|---|---|---|
| **Case-sensitive forkortelser** | Av | Når av, slås skrivemåter som bare skiller seg i store/små bokstaver og/eller mellomrom sammen til én side (f.eks. «Adm.dir.» og «adm. dir.»). Filnavnet velges ut fra hvilken skrivemåte som forekommer oftest (alfabetisk først ved likt antall). |
| **Bygg inn artikkelen på redirect-sider** | Av | Når på, viser redirect-siden en innebygd kopi av selve artikkelen (med en info-callout øverst), i stedet for bare en lenke. Gjelder ikke pekersider. |
| **Leksikon-rotmappe** | Tom (av) | Rotmappen for et alfabetisk leksikon, se neste seksjon. |
| **Mapper** (liste) | Tom (= hele hvelvet) | Begrenser hvilke mapper alle kommandoer skanner i, med valg om undermapper skal inkluderes per mappe. |

---

## Leksikon-struktur (mappe-organisering)

Når **Leksikon-rotmappe** er satt (f.eks. til `Div 2`), aktiveres et sett med relaterte
funksjoner:

```
Div 2/
├── 00 Inboks/          ← nye artikler starter her
├── 01 mal/             ← redigerbare maler, se under
│   ├── Redirect.md
│   ├── Redirect (innebygd).md
│   └── Disambiguering.md
├── A/
│   ├── 00 Index.md      ← autogenerert, lenker til alt i mappen
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
- `00 Inboks` og `01 mal` opprettes automatisk (med standardmaler i sistnevnte) så snart
  leksikon-rotmappen settes, ved plugin-oppstart, og som sikkerhetsnett ved regenerering.
- Titler som ikke starter på en bokstav (f.eks. tall) havner i en felles `#`-mappe.

**Publiseringsflyt for nye artikler:**
1. Opprett et nytt notat i `00 Inboks`.
2. Skriv artikkelen, sett gjerne `forkortelser` hvis den skal ha egne peker-sider.
3. Sett `publiser: true` i frontmatter når den er klar.
4. Kjør **«Publiser sider fra innboks»**.

---

## Maler

Malfilene i `01 mal` er vanlig Markdown med plassholdere i `{{dobbel krøllparentes}}`-format:

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

---

## Brukermanual / typiske arbeidsflyter

### Sette opp for første gang
1. Innstillinger → Ordbok pekersider → sett **Leksikon-rotmappe** til den mappen som skal
   inneholde det alfabetiske leksikonet.
2. Reload Obsidian (eller vent — mappene opprettes automatisk).
3. Kjør **«Organiser alle sider»** for å samle eksisterende, spredte artikler i riktige
   bokstavmapper (se oppdelingen i bekreftelsesdialogen — inkluderer den mapper med
   uferdig/ufullstendig innhold du ikke vil ha med ennå, avbryt og rydd opp først).
4. Kjør **«Migrer aliases til forkortelser»** hvis artiklene har `aliases` fra før.
5. Kjør **«Regenerer peker- og redirect-sider»**.

### Legge til en ny artikkel
1. Nytt notat i `00 Inboks`.
2. Fyll ut innhold, sett `forkortelser` ved behov.
3. Sett `publiser: true` når klar.
4. Kjør **«Publiser sider fra innboks»**.

### Legge til en forkortelse på en eksisterende artikkel
1. Legg forkortelsen til i `forkortelser`-feltet.
2. Kjør **«Regenerer peker- og redirect-sider»**.

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

---

## Teknisk oppsummering

- **Byggekommandoer**: `npm install`, `npm run dev` (esbuild watch), `npm run build`
  (typesjekk + produksjonsbygg).
- **Kildekode**: alt i [main.ts](main.ts) (én fil, ingen eksterne kjøretidsavhengigheter utover
  Obsidian-API-et).
- **Styling**: injiseres av pluginet selv ved `onload()` (ikke en separat `styles.css`-fil) —
  gir `cssclass: redirect`-siders nedtonede visning og de to egendefinerte callout-typene
  (`disambiguering` med lenke-ikon, `pekerside` med info-ikon, begge i samme blåfarge som
  Obsidians innebygde `note`).
- **Installasjon lokalt**: kopier `manifest.json` og `main.js` (bygget fra `main.ts`) til
  `.obsidian/plugins/ordbok-pekersider/` i hvelvet, og aktiver under Community plugins.
