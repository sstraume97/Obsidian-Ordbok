import {
	AbstractInputSuggest,
	App,
	FileSystemAdapter,
	ItemView,
	Modal,
	Notice,
	Platform,
	Plugin,
	PluginSettingTab,
	Setting,
	TFile,
	TFolder,
	WorkspaceLeaf,
	getAllTags,
	parseFrontMatterAliases,
	requestUrl,
} from "obsidian";

const VIEW_TYPE_ORDBOK = "ordbok-sidebar-view";

const AUTO_GENERATED_KEY = "auto-generated";
const REDIRECT_CSSCLASS = "redirect";
const PEKERSIDE_CALLOUT_TYPE = "disambiguering";
const EMBED_CALLOUT_TYPE = "pekerside";
const FORKORTELSER_KEY = "forkortelser";
const PUBLISER_KEY = "publiser";
const RELATERT_KEY = "relatert";
const INDEX_FOR_KEY = "index-for";
/** Frontmatter-feltet på artikkelen som lenker til dens artikkelnotater
 * (se ARTICLE_NOTES_FOLDER_NAME) - alltid en liste, siden en artikkel kan
 * ha flere notater over tid. */
const NOTAT_KEY = "notat";
const INBOX_FOLDER_NAME = "00 Innboks";
const OLD_INBOX_FOLDER_NAME = "00 Inboks";
const INDEX_FILENAME = "Index";
const INCOMPLETE_MARKER = "[…]";
const NON_LETTER_FOLDER = "#";
const SE_OGSÅ_START = "<!-- ordbok:se-også:start -->";
const SE_OGSÅ_END = "<!-- ordbok:se-også:end -->";
const ILLEGAL_FILENAME_CHARS = /[\\/:*?"<>|#^[\]]/g;
const STYLE_EL_ID = "ordbok-pekersider-styles";

const TEMPLATE_FOLDER_NAME = "01 Maler";
const OLD_TEMPLATE_FOLDER_NAME = "01 mal";
const REDIRECT_TEMPLATE_NAME = "Redirect.md";
const REDIRECT_EMBED_TEMPLATE_NAME = "Redirect (innebygd).md";
const DISAMBIGUERING_TEMPLATE_NAME = "Disambiguering.md";
const ARTICLE_TEMPLATE_NAME = "Artikkel.md";

const NOTES_FOLDER_NAME = "02 Notater";
/** Undermappe av NOTES_FOLDER_NAME der artikkelnotater (f.eks. lagrede
 * Claude-forslag som ikke skal erstatte selve artikkelen) samles - lenket
 * fra artikkelen via frontmatter-feltet NOTAT_KEY. */
const ARTICLE_NOTES_FOLDER_NAME = "021 Artikkelnotater";

const DEFAULT_ARTICLE_TEMPLATE = `---
Kontrollert: false
def-type: atomic
aliases:
Kategori:
kilde:
KI: false
uid:
forkortelser:
publiser:
autoritetsdata:
  wikidata:
  wikipedia:
  snl:
  bibsys:
  viaf:
  dewey:
  humord:
---
`;

const DEFAULT_ARTICLE_FRONTMATTER: Record<string, unknown> = {
	Kontrollert: false,
	"def-type": "atomic",
	aliases: null,
	Kategori: null,
	kilde: null,
	KI: false,
	uid: null,
	forkortelser: null,
	publiser: null,
	autoritetsdata: {
		wikidata: null,
		wikipedia: null,
		snl: null,
		bibsys: null,
		viaf: null,
		dewey: null,
		humord: null,
	},
};

/** Wikidata-egenskaper brukt av autoritetsdata-importen. P4342 (SNL),
 * P1015 (BIBSYS/NORAF), P214 (VIAF) og P1036 (Dewey) er verifiserte,
 * etablerte Wikidata-egenskaper. Humord har ingen tilsvarende egenskap på
 * Wikidata og må derfor fylles inn manuelt. */
const WIKIDATA_PROPS = {
	snl: "P4342",
	bibsys: "P1015",
	viaf: "P214",
	dewey: "P1036",
} as const;

/** Lenker bygges primært fra Wikidatas egen "formatter URL"-egenskap (P1630) på
 * hver property - samme mekanisme Wikidata selv bruker til å vise eksterne
 * lenker. `fallbackFormat` brukes kun hvis P1630 mangler på propertyen. */
const WIKIDATA_KNOWN_FIELDS: {
	knownKey: "snl" | "bibsys" | "viaf" | "dewey";
	prop: string;
	label: string;
	fallbackFormat: ((value: string) => string) | null;
	/** Når satt, ignoreres Wikidatas egen "formatter URL" (P1630) helt - brukes
	 * for felt der Wikidatas offisielle lenkemønster viser seg å være dødt/ustabilt. */
	forceFallback?: boolean;
}[] = [
	{
		knownKey: "snl",
		prop: WIKIDATA_PROPS.snl,
		label: "Store norske leksikon",
		fallbackFormat: (v) => `https://snl.no/${encodeURIComponent(v)}`,
	},
	{
		knownKey: "bibsys",
		prop: WIKIDATA_PROPS.bibsys,
		label: "Felles autoritetsregister / NORAF",
		fallbackFormat: null,
	},
	{
		knownKey: "viaf",
		prop: WIKIDATA_PROPS.viaf,
		label: "VIAF",
		fallbackFormat: (v) => `https://viaf.org/viaf/${encodeURIComponent(v)}`,
	},
	{
		knownKey: "dewey",
		prop: WIKIDATA_PROPS.dewey,
		label: "Dewey Decimal Classification",
		// Wikidatas egen formatter-URL (P1630) peker til dewey.info, som ikke
		// finnes lenger. Faktisk lenke bygges i stedet fra
		// settings.deweyFallbackUrlTemplate (se buildWikidataFieldRows).
		fallbackFormat: null,
		forceFallback: true,
	},
];

const WIKIDATA_FORMATTER_URL_PROP = "P1630";

const DEFAULT_WIKIDATA_DEFAULT_FIELDS = `wikipedia,${WIKIDATA_KNOWN_FIELDS.map((f) => f.prop).join(",")}`;

const WIKIDATA_API = "https://www.wikidata.org/w/api.php";

const DEFAULT_REDIRECT_TEMPLATE = `---
# IKKE fjern "${AUTO_GENERATED_KEY}: true" - utvidelsen bruker det til å gjenkjenne egne sider
${AUTO_GENERATED_KEY}: true
cssclass: ${REDIRECT_CSSCLASS}
redirect-target: "[[{{artikkel}}]]"
---

Se [[{{artikkel}}]].
`;

const DEFAULT_REDIRECT_EMBED_TEMPLATE = `---
# IKKE fjern "${AUTO_GENERATED_KEY}: true" - utvidelsen bruker det til å gjenkjenne egne sider
${AUTO_GENERATED_KEY}: true
cssclass: ${REDIRECT_CSSCLASS}
redirect-target: "[[{{artikkel}}]]"
---

> [!${EMBED_CALLOUT_TYPE}]+ Dette er en innebygd kopi av artikkelen.
> Gå til artikkelen her: [[{{artikkel}}]]
>
> *Det anbefales å dele selve artikkelen – ikke denne pekersiden!*

![[{{artikkel}}]]
`;

const DEFAULT_DISAMBIGUERING_TEMPLATE = `---
# IKKE fjern "${AUTO_GENERATED_KEY}: true" - utvidelsen bruker det til å gjenkjenne egne sider
${AUTO_GENERATED_KEY}: true
cssclass: ${REDIRECT_CSSCLASS}
peker-til:
{{peker-til-liste}}
---

> [!${PEKERSIDE_CALLOUT_TYPE}] «{{alias}}» finnes på flere sider. Velg riktig betydning:
{{liste}}
`;

const PLUGIN_STYLES = `
.markdown-source-view.mod-cm6.${REDIRECT_CSSCLASS} .cm-content,
.markdown-reading-view.${REDIRECT_CSSCLASS} .markdown-preview-view {
	opacity: 0.85;
}

.markdown-reading-view.${REDIRECT_CSSCLASS} .markdown-preview-view::before {
	content: "Generert peker-/redirect-side";
	display: block;
	font-size: 0.8em;
	font-style: italic;
	color: var(--text-muted);
	margin-bottom: 1em;
}

.callout[data-callout="${PEKERSIDE_CALLOUT_TYPE}"] {
	--callout-color: 68, 138, 255;
	--callout-icon: link;
}

.callout[data-callout="${EMBED_CALLOUT_TYPE}"] {
	--callout-color: 68, 138, 255;
	--callout-icon: info;
}

.ordbok-sidebar {
	padding: var(--size-4-3);
}

.ordbok-sidebar h4 {
	margin: var(--size-4-4) 0 var(--size-4-1) 0;
	font-size: var(--font-ui-small);
	text-transform: uppercase;
	letter-spacing: 0.04em;
	color: var(--text-muted);
}

.ordbok-sidebar h4:first-child {
	margin-top: 0;
}

.ordbok-sidebar-group {
	display: flex;
	flex-direction: column;
	gap: var(--size-2-2);
}

.ordbok-sidebar-btn {
	width: 100%;
	text-align: left;
	white-space: normal;
	height: auto;
	padding: var(--size-4-2) var(--size-4-3);
}

.ordbok-wikidata-search-row {
	display: flex;
	gap: var(--size-2-2);
	margin-bottom: var(--size-4-2);
}

.ordbok-wikidata-search-row input {
	flex: 1;
}

.ordbok-wikidata-results {
	max-height: 50vh;
	overflow-y: auto;
	display: flex;
	flex-direction: column;
	gap: var(--size-2-2);
}

.ordbok-wikidata-result {
	padding: var(--size-4-2);
	border: 1px solid var(--background-modifier-border);
	border-radius: var(--radius-s);
	cursor: pointer;
}

.ordbok-wikidata-result:hover {
	background-color: var(--background-modifier-hover);
}

.ordbok-wikidata-desc {
	color: var(--text-muted);
	font-size: var(--font-ui-small);
}

.ordbok-wikidata-checkbox-row {
	display: flex;
	align-items: center;
	gap: var(--size-2-2);
	padding: var(--size-2-2) 0;
}

.ordbok-wikidata-fields-left h4 {
	margin: var(--size-4-3) 0 var(--size-2-1) 0;
	font-size: var(--font-ui-small);
	text-transform: uppercase;
	letter-spacing: 0.04em;
	color: var(--text-muted);
	border-bottom: 1px solid var(--background-modifier-border);
	padding-bottom: var(--size-2-1);
}

.ordbok-wikidata-fields-left h4:first-child {
	margin-top: 0;
}

.ordbok-wikidata-fields-layout {
	display: flex;
	gap: var(--size-4-3);
	align-items: flex-start;
}

.ordbok-wikidata-fields-left {
	flex: 3;
	min-width: 0;
	max-height: 55vh;
	overflow-y: auto;
}

.ordbok-wikidata-fields-right {
	flex: 2;
	min-width: 0;
	max-height: 55vh;
	overflow-y: auto;
	border-left: 1px solid var(--background-modifier-border);
	padding-left: var(--size-4-3);
	position: sticky;
	top: 0;
}

.ordbok-wikidata-selected-list {
	display: flex;
	flex-direction: column;
	gap: var(--size-2-2);
}

.ordbok-wikidata-selected-item {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: var(--size-2-2);
	padding: var(--size-2-2);
	border: 1px solid var(--background-modifier-border);
	border-radius: var(--radius-s);
}

.ordbok-draggable {
	cursor: grab;
}

.ordbok-dragging {
	opacity: 0.4;
}

.ordbok-wikidata-selected-item span {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.ordbok-wikidata-selected-controls {
	display: flex;
	gap: var(--size-2-1);
	flex-shrink: 0;
}

.ordbok-wikidata-selected-controls button {
	padding: 0 var(--size-2-2);
}

.ordbok-wikidata-import-modal {
	width: min(96vw, 1400px) !important;
}

.ordbok-wikidata-import-modal .modal-button-container {
	position: sticky;
	bottom: 0;
	background: var(--background-primary);
	margin-top: var(--size-4-3);
	padding-top: var(--size-4-3);
	padding-bottom: var(--size-4-1);
	border-top: 1px solid var(--background-modifier-border);
}

.ordbok-alias-triage-list {
	max-height: 55vh;
	overflow-y: auto;
}

.ordbok-alias-triage-list .setting-item-control {
	gap: var(--size-2-2);
}

.ordbok-id-series-card {
	border: 1px solid var(--background-modifier-border);
	border-radius: var(--radius-s);
	padding: 0 var(--size-4-3);
	margin-bottom: var(--size-4-3);
}

.ordbok-id-series-card .setting-item {
	border-top: none;
}

.ordbok-claude-suggestion {
	width: 100%;
	min-height: 45vh;
	font-family: var(--font-monospace);
	font-size: var(--font-ui-small);
	resize: vertical;
}

.ordbok-claude-prompt-card textarea {
	width: 100%;
	min-height: 5em;
}
`;

interface AliasEntry {
	alias: string;
	files: TFile[];
}

type PlanKind = "redirect" | "pekerside" | "index";

interface RegeneratePlanItem {
	kind: PlanKind;
	/** Alias-tekst for redirect/pekerside, bokstav/mappenavn for index. */
	alias: string;
	files: TFile[];
	path: string;
	existing: TFile | null;
	conflict: boolean;
}

interface FolderScope {
	path: string; // "" = vaultroten
	includeSubfolders: boolean;
}

interface WikidataFieldPreset {
	id: string;
	name: string;
	/** "wikipedia" og/eller Wikidata-egenskaps-ID-er (Pxxx), i importrekkefølge. */
	fields: string[];
}

/** En egendefinert serie for interne ID-nummer (f.eks. «DEF-0001»). Kan
 * matches automatisk mot en mappe eller en tag, eller settes til "manual"
 * og velges eksplisitt hver gang. */
interface IdSeries {
	id: string;
	name: string;
	prefix: string;
	/** Antall siffer nummeret nullutfylles til, f.eks. 4 -> "0007". */
	padding: number;
	/** Neste nummer som deles ut - økes automatisk etter hver generering. */
	nextNumber: number;
	/** Frontmatter-feltet ID-en skrives til, f.eks. "uid". */
	frontmatterKey: string;
	matchType: "folder" | "tag" | "manual";
	/** Mappesti (uten ledende/etterslep skråstrek) eller tag-navn (uten "#"). Ubrukt for "manual". */
	matchValue: string;
}

/** En egendefinert Claude-prompt for "foreslå omskriving"-funksjonen. Siden
 * sendes alltid som råinnhold (frontmatter + brødtekst) via stdin til
 * Claude CLI - selve prompten er instruksjonen som følger med. */
interface ClaudePrompt {
	id: string;
	name: string;
	/** Kan bruke "{{tittel}}" for filnavnet (uten filendelse). */
	prompt: string;
	/** true: Claude bes returnere hele den oppdaterte filen, og forslagsvinduet
	 * viser en "Bruk (erstatt hele siden)"-knapp. false: Claude bes svare med en
	 * fritekst-rapport/liste - kun "Kopier" tilbys, siden det ikke finnes noe
	 * fornuftig "erstatt siden med denne rapporten"-handling. */
	expectsFullFileReplacement: boolean;
}

interface OrdbokSettings {
	scopedFolders: FolderScope[];
	caseSensitiveAliases: boolean;
	embedArticleInRedirect: boolean;
	leksikonRoot: string;
	/** Forhåndsdefinerte grupper av standardfelt for Wikidata-import. */
	wikidataPresets: WikidataFieldPreset[];
	/** ID-en til gruppen som forhåkes når du åpner et nytt import-vindu. */
	activeWikidataPresetId: string;
	/** Gjør entitetens Wikidata-beskrivelse valgbar som eget felt i import-vinduet. */
	wikidataImportDescription: boolean;
	/** Kommaseparerte språkkoder i prioritert rekkefølge - første med treff brukes. */
	wikidataDescriptionLanguages: string;
	/** Gjør entitetens Wikidata-alias valgbare som eget felt i import-vinduet. */
	wikidataImportAlias: boolean;
	/** Kommaseparerte språkkoder i prioritert rekkefølge - første med treff brukes. */
	wikidataAliasLanguages: string;
	/** Gjør entitetens etiketter på andre språk valgbare som egne felt (én rad per språk). */
	wikidataImportTranslations: boolean;
	/** Kommaseparerte språkkoder - én rad per språk som har en etikett. */
	wikidataTranslationLanguages: string;
	/** Egendefinerte serier for interne ID-nummer (prefiks + løpenummer). */
	idSeries: IdSeries[];
	/** Maks lengde på utdragene som vises på pekersider (disambiguering). */
	excerptMaxLength: number;
	/** Maks lengde et Wikidata-alias kan ha for å forhåndsvelges som "forkortelse" i triage-vinduet. */
	aliasAbbreviationMaxLength: number;
	/** Fallback-URL-mal for Dewey Decimal Classification, med "$1" som plassholder for tallet. */
	deweyFallbackUrlTemplate: string;
	/** Egendefinerte prompter for "foreslå omskriving med Claude". */
	claudePrompts: ClaudePrompt[];
	/** Kommandoen/stien til Claude Code CLI-en, f.eks. "claude" (må finnes i PATH) eller en full sti. */
	claudeCliPath: string;
	/** Maks antall sekunder å vente på svar fra CLI-en før kallet avbrytes. */
	claudeCliTimeoutSeconds: number;
}

const DEFAULT_WIKIDATA_PRESET_ID = "standard";

const DEFAULT_SETTINGS: OrdbokSettings = {
	scopedFolders: [],
	caseSensitiveAliases: false,
	embedArticleInRedirect: false,
	leksikonRoot: "",
	wikidataPresets: [
		{
			id: DEFAULT_WIKIDATA_PRESET_ID,
			name: "Standard",
			fields: DEFAULT_WIKIDATA_DEFAULT_FIELDS.split(","),
		},
	],
	activeWikidataPresetId: DEFAULT_WIKIDATA_PRESET_ID,
	wikidataImportDescription: false,
	wikidataDescriptionLanguages: "nb,en",
	wikidataImportAlias: false,
	wikidataAliasLanguages: "nb,en",
	wikidataImportTranslations: false,
	wikidataTranslationLanguages: "en",
	idSeries: [],
	excerptMaxLength: 140,
	aliasAbbreviationMaxLength: 6,
	deweyFallbackUrlTemplate: "https://data.ub.uio.no/skosmos/ddc/nb/search?clang=nb&q=$1",
	claudePrompts: [
		{
			id: "claude-skriv-om-lesbarhet",
			name: "Skriv om for lesbarhet",
			prompt:
				"Skriv om artikkelen «{{tittel}}» under for å være klarere og lettere å lese, " +
				"uten å endre den faktiske betydningen eller fjerne informasjon. Behold samme " +
				"struktur og omtrent samme lengde som originalen.",
			expectsFullFileReplacement: true,
		},
		{
			id: "claude-rett-skrivefeil",
			name: "Rett skrivefeil og grammatikk",
			prompt:
				"Korrekturles artikkelen «{{tittel}}» under. Rett kun stave- og grammatikkfeil " +
				"og åpenbare skrivefeil - ikke endre ordvalg, stil eller innhold utover det.",
			expectsFullFileReplacement: true,
		},
		{
			id: "claude-forkort",
			name: "Forkort til kjernen",
			prompt:
				"Skriv en kortere, mer konsis versjon av artikkelen «{{tittel}}» under. Behold " +
				"kjerneinnholdet og alle viktige fakta, men fjern gjentakelser og unødvendige " +
				"utdypinger.",
			expectsFullFileReplacement: true,
		},
		{
			id: "claude-formaliser-tonen",
			name: "Formaliser tonen",
			prompt:
				"Skriv om artikkelen «{{tittel}}» under slik at tonen blir mer leksikon-aktig, " +
				"formell og nøytral - fjern muntlige uttrykk, subjektive vurderinger og " +
				"uformelt språk, uten å endre den faktiske betydningen eller fjerne " +
				"informasjon.",
			expectsFullFileReplacement: true,
		},
		{
			id: "claude-utvid-stubb",
			name: "Utvid stubb-artikkel",
			prompt:
				"Artikkelen «{{tittel}}» under er en ufullstendig stubb. Der du finner " +
				"markøren «[…]», eller andre tydelig tynne/mangelfulle avsnitt, utvid med " +
				"relevant, faktisk korrekt innhold som passer emnet og stilen ellers i " +
				"artikkelen - fjern «[…]»-markøren der du fyller den inn. Ikke finn på " +
				"detaljer du er usikker på; skriv heller generelt der du mangler sikker " +
				"kunnskap. Ikke omskriv avsnitt som allerede er fullstendige.",
			expectsFullFileReplacement: true,
		},
		{
			id: "claude-innledende-definisjon",
			name: "Generer et innledende definisjonsavsnitt",
			prompt:
				"Artikkelen «{{tittel}}» under mangler en tydelig åpningssetning. Skriv (eller " +
				"omskriv) kun det aller første avsnittet til en presis, leksikon-aktig " +
				"definisjon av «{{tittel}}» - i stil med «{{tittel}} er/betyr …». Ikke endre " +
				"resten av artikkelen.",
			expectsFullFileReplacement: true,
		},
		{
			id: "claude-se-ogsaa-kandidater",
			name: "Foreslå «Se også»-kandidater",
			prompt:
				"List opp 3-8 begreper som er tydelig relatert til «{{tittel}}» og som med " +
				"rimelig sannsynlighet er egne oppslagsord i samme oppslagsverk, basert kun " +
				"på innholdet i artikkelen under. Svar med én linje per forslag, formatert " +
				"nøyaktig som «- Begrep», klare til å limes inn i frontmatter-feltet " +
				"«relatert» (som senere brukes til å generere en «Se også»-seksjon " +
				"automatisk). Ikke inkluder begreper som allerede er wikilenket i " +
				"artikkelen, og ikke inkluder «{{tittel}}» selv.",
			expectsFullFileReplacement: false,
		},
		{
			id: "claude-sjekk-foreldet",
			name: "Sjekk for foreldet/faktisk tvilsom informasjon",
			prompt:
				"Les gjennom artikkelen «{{tittel}}» under som en faktasjekk. List opp " +
				"konkrete påstander som virker foreldede, upresise, eller som du er usikker " +
				"på om fortsatt stemmer (f.eks. lovhenvisninger, beløpsgrenser, " +
				"institusjonsnavn eller praksis som endres over tid) - med en kort " +
				"begrunnelse for hver. Ikke list opp noe du ikke har en konkret innvending " +
				"mot. Hvis du ikke finner noe å bemerke, si det uttrykkelig i én setning.",
			expectsFullFileReplacement: false,
		},
		{
			id: "claude-oversett-malform",
			name: "Oversett til bokmål (eller motsatt)",
			prompt:
				"Sjekk hvilken norsk målform artikkelen «{{tittel}}» under er skrevet på. " +
				"Hvis den er skrevet på bokmål, oversett hele artikkelen til nynorsk. Hvis " +
				"den er skrevet på nynorsk, oversett hele artikkelen til bokmål. Behold " +
				"fagterminologi presis og korrekt for målformen. Ikke oversett verdier i " +
				"frontmatter-feltene som er URL-er, ID-er eller egennavn - men oversett " +
				"norske fritekst-verdier som «beskrivelse» og «Kategori».",
			expectsFullFileReplacement: true,
		},
		{
			id: "claude-wikilenker",
			name: "Lenk artikkelen til andre relaterte artikler med wikilenker",
			prompt:
				"Gå gjennom brødteksten i artikkelen «{{tittel}}» under, og sett wikilenker " +
				"(dobbel hakeparentes, f.eks. «[[Begrep]]») rundt spesifikke fagbegreper som " +
				"med rimelig sannsynlighet er egne oppslagsord i samme oppslagsverk. Vær " +
				"forsiktig og selektiv - lenk kun presise, sentrale begreper (ikke generiske " +
				"ord), og lenk hver forekomst av et gitt begrep kun første gang det nevnes i " +
				"artikkelen. Ikke endre noe annet i teksten, og rør ikke frontmatter eller en " +
				"eventuell «Se også»-seksjon (mellom kommentarene " +
				"«<!-- ordbok:se-også:start -->» og «<!-- ordbok:se-også:end -->», hvis den " +
				"finnes) - den vedlikeholdes automatisk et annet sted.",
			expectsFullFileReplacement: true,
		},
		{
			id: "claude-sjekk-kilder",
			name: "Sjekk sitering/kilder for innholdet",
			prompt:
				"Vurder om påstandene i artikkelen «{{tittel}}» under virker tilstrekkelig " +
				"kildebelagte. Se spesielt på frontmatter-feltet «kilde» (om det er utfylt, " +
				"og om det gir en troverdig, sporbar kilde for innholdet) og på om konkrete " +
				"tall, lovhenvisninger eller sitater i brødteksten har en tydelig opprinnelse. " +
				"List opp konkrete svakheter (manglende kilde, vage referanser, påstander som " +
				"bør dobbeltsjekkes) med kort begrunnelse. Hvis kildegrunnlaget virker solid, " +
				"si det uttrykkelig i én setning.",
			expectsFullFileReplacement: false,
		},
	],
	claudeCliPath: "claude",
	claudeCliTimeoutSeconds: 120,
};

/** Renser en kommaseparert liste med språkkoder til en ren, ikke-tom array. */
function parseLangCodes(raw: string): string[] {
	return raw
		.split(",")
		.map((s) => s.trim().toLowerCase())
		.filter((s) => s.length > 0);
}

/** Enkel, tilstrekkelig unik ID for nye grupper (kun brukt lokalt i innstillingene). */
function generatePresetId(): string {
	return `preset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Enkel, tilstrekkelig unik ID for nye ID-serier (kun brukt lokalt i innstillingene). */
function generateSeriesId(): string {
	return `series-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Enkel, tilstrekkelig unik ID for nye Claude-prompter (kun brukt lokalt i innstillingene). */
function generateClaudePromptId(): string {
	return `claude-prompt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Gjør et element drabart for å endre rekkefølgen i en liste, som et
 * supplement til opp/ned-knapper (ikke en erstatning - knappene er en
 * garantert fungerende, tastaturvennlig fallback). `onDrop` kalles med
 * (fra-indeks, til-indeks) når elementet slippes over et annet. */
function attachDragReorder(
	el: HTMLElement,
	index: number,
	onDrop: (fromIndex: number, toIndex: number) => void
): void {
	el.setAttribute("draggable", "true");
	el.addClass("ordbok-draggable");

	el.addEventListener("dragstart", (evt) => {
		evt.dataTransfer?.setData("text/plain", String(index));
		el.addClass("ordbok-dragging");
	});
	el.addEventListener("dragend", () => el.removeClass("ordbok-dragging"));
	el.addEventListener("dragover", (evt) => evt.preventDefault());
	el.addEventListener("drop", (evt) => {
		evt.preventDefault();
		const from = Number(evt.dataTransfer?.getData("text/plain"));
		if (!Number.isNaN(from) && from !== index) onDrop(from, index);
	});
}

class FolderSuggest extends AbstractInputSuggest<TFolder> {
	constructor(
		app: App,
		private inputEl: HTMLInputElement,
		private onChoose: (folder: TFolder) => void
	) {
		super(app, inputEl);
	}

	getSuggestions(query: string): TFolder[] {
		const lower = query.toLowerCase();
		const folders: TFolder[] = [];

		const walk = (folder: TFolder) => {
			if (folder.path === "/" || folder.path.toLowerCase().includes(lower)) {
				folders.push(folder);
			}
			for (const child of folder.children) {
				if (child instanceof TFolder) walk(child);
			}
		};
		walk(this.app.vault.getRoot());

		return folders.slice(0, 50);
	}

	renderSuggestion(folder: TFolder, el: HTMLElement): void {
		el.setText(folder.path === "/" ? "/ (vaultroten)" : folder.path);
	}

	selectSuggestion(folder: TFolder): void {
		this.inputEl.value = folder.path === "/" ? "" : folder.path;
		this.onChoose(folder);
		this.close();
	}
}

class ConfirmModal extends Modal {
	constructor(
		app: App,
		private title: string,
		private message: string,
		private confirmLabel: string,
		private onConfirm: () => void,
		private warning = false
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl("h2", { text: this.title });
		contentEl.createEl("p", { text: this.message });

		const buttonRow = contentEl.createDiv({ cls: "modal-button-container" });
		buttonRow
			.createEl("button", { text: "Avbryt" })
			.addEventListener("click", () => this.close());

		const confirmButton = buttonRow.createEl("button", {
			text: this.confirmLabel,
			cls: this.warning ? "mod-warning" : "mod-cta",
		});
		confirmButton.addEventListener("click", () => {
			this.close();
			this.onConfirm();
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

class ListModal extends Modal {
	constructor(
		app: App,
		private title: string,
		private intro: string,
		private items: string[]
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl("h2", { text: this.title });
		if (this.intro) contentEl.createEl("p", { text: this.intro });

		const listEl = contentEl.createEl("ul");
		listEl.style.maxHeight = "50vh";
		listEl.style.overflowY = "auto";
		for (const item of this.items) {
			listEl.createEl("li", { text: item });
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

interface WikidataSearchResult {
	id: string;
	label: string;
	description: string;
}

interface WikidataFieldRow {
	/** "wikipedia" eller en Wikidata-egenskaps-ID (Pxxx) - unik nøkkel for avkrysning. */
	id: string;
	label: string;
	/** Menneskelesbar visning (f.eks. "Norge (Q20)" for entitetsreferanser). */
	values: string[];
	/** Det som faktisk skrives til frontmatter - lenke der Wikidata selv viser en lenke. */
	storedValues: string[];
	knownKey: "wikipedia" | "snl" | "bibsys" | "viaf" | "dewey" | null;
}

class WikidataImportModal extends Modal {
	constructor(
		app: App,
		private plugin: OrdbokPekersiderPlugin,
		private file: TFile
	) {
		super(app);
	}

	onOpen(): void {
		this.modalEl.addClass("ordbok-wikidata-import-modal");
		this.renderSearchStep(this.file.basename);
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private renderSearchStep(initialQuery: string): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: "Hent autoritetsdata fra Wikidata" });
		contentEl.createEl("p", {
			text: `Søker for: ${this.file.basename}. Juster søketeksten ved behov.`,
		});

		const searchRow = contentEl.createDiv({ cls: "ordbok-wikidata-search-row" });
		const input = searchRow.createEl("input", { type: "text" });
		input.value = initialQuery;
		const searchBtn = searchRow.createEl("button", { text: "Søk", cls: "mod-cta" });

		const resultsEl = contentEl.createDiv({ cls: "ordbok-wikidata-results" });

		const doSearch = async () => {
			const query = input.value.trim();
			if (!query) return;
			resultsEl.empty();
			resultsEl.createEl("p", { text: "Søker …" });
			try {
				const results = await this.plugin.searchWikidata(query);
				resultsEl.empty();
				if (results.length === 0) {
					resultsEl.createEl("p", { text: "Ingen treff." });
					return;
				}
				for (const result of results) {
					const item = resultsEl.createDiv({ cls: "ordbok-wikidata-result" });
					item.createEl("strong", { text: `${result.label} (${result.id})` });
					if (result.description) {
						item.createEl("div", {
							text: result.description,
							cls: "ordbok-wikidata-desc",
						});
					}
					item.addEventListener("click", () => void this.renderFieldsStep(result));
				}
			} catch (e) {
				resultsEl.empty();
				resultsEl.createEl("p", {
					text: `Søket feilet: ${e instanceof Error ? e.message : String(e)}`,
				});
			}
		};

		searchBtn.addEventListener("click", () => void doSearch());
		input.addEventListener("keydown", (evt) => {
			if (evt.key === "Enter") {
				evt.preventDefault();
				void doSearch();
			}
		});

		void doSearch();
	}

	private async renderFieldsStep(result: WikidataSearchResult): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: `${result.label} (${result.id})` });
		if (result.description) contentEl.createEl("p", { text: result.description });
		contentEl.createEl("p", { text: "Henter felt fra Wikidata …" });

		let rows: WikidataFieldRow[];
		try {
			rows = await this.plugin.buildWikidataFieldRows(result.id);
		} catch (e) {
			contentEl.empty();
			contentEl.createEl("h2", { text: `${result.label} (${result.id})` });
			contentEl.createEl("p", {
				text: `Klarte ikke å hente felt: ${e instanceof Error ? e.message : String(e)}`,
			});
			return;
		}

		contentEl.empty();
		contentEl.createEl("h2", { text: `${result.label} (${result.id})` });
		if (result.description) contentEl.createEl("p", { text: result.description });
		contentEl.createEl("p", {
			text:
				"Wikidata-ID importeres alltid. Til venstre: alle felt Wikidata har for denne " +
				"entiteten - forhåkede felt er den valgte gruppens standardfelt. Til høyre: " +
				"valgte felt i den rekkefølgen de skrives til siden - dra dem, eller bruk " +
				"pilene, for å endre rekkefølgen. Verdier som allerede finnes overskrives med " +
				"det som hentes; forhåkede felt uten treff her fjernes fra siden.",
		});

		if (rows.length === 0) {
			contentEl.createEl("p", { text: "Ingen ytterligere felt funnet på denne entiteten." });
		}

		const rowById = new Map(rows.map((r) => [r.id, r]));

		const orderFromPreset = (preset: WikidataFieldPreset): string[] =>
			preset.fields.filter((id) => rowById.has(id));

		let checkedOrder: string[] = orderFromPreset(this.plugin.getActiveWikidataPreset());
		const checkboxByRowId = new Map<string, HTMLInputElement>();

		const presetRow = new Setting(contentEl)
			.setName("Bruk gruppe")
			.setDesc("Erstatter valgte felt med denne gruppens felt (kan justeres etterpå).");
		let selectedPresetId = this.plugin.settings.activeWikidataPresetId;
		presetRow.addDropdown((dropdown) => {
			for (const preset of this.plugin.settings.wikidataPresets) {
				dropdown.addOption(preset.id, preset.name);
			}
			dropdown.setValue(selectedPresetId);
			dropdown.onChange((value) => {
				selectedPresetId = value;
			});
		});
		presetRow.addButton((button) =>
			button.setButtonText("Bruk").onClick(() => {
				const preset = this.plugin.settings.wikidataPresets.find(
					(p) => p.id === selectedPresetId
				);
				if (!preset) return;
				checkedOrder = orderFromPreset(preset);
				for (const [id, checkbox] of checkboxByRowId) {
					checkbox.checked = checkedOrder.includes(id);
				}
				renderSelectedList();
			})
		);

		const layout = contentEl.createDiv({ cls: "ordbok-wikidata-fields-layout" });
		const leftCol = layout.createDiv({ cls: "ordbok-wikidata-fields-left" });
		const rightCol = layout.createDiv({ cls: "ordbok-wikidata-fields-right" });

		rightCol.createEl("h4", { text: "Valgte felt" });
		const selectedListEl = rightCol.createDiv({ cls: "ordbok-wikidata-selected-list" });

		const moveInArray = (arr: string[], from: number, to: number) => {
			const [item] = arr.splice(from, 1);
			arr.splice(to, 0, item);
		};

		const renderSelectedList = () => {
			selectedListEl.empty();
			if (checkedOrder.length === 0) {
				selectedListEl.createEl("p", {
					text: "Ingen felt valgt (Wikidata-ID importeres uansett).",
					cls: "ordbok-wikidata-desc",
				});
				return;
			}
			checkedOrder.forEach((id, index) => {
				const row = rowById.get(id);
				if (!row) return;
				const item = selectedListEl.createDiv({ cls: "ordbok-wikidata-selected-item" });
				attachDragReorder(item, index, (from, to) => {
					moveInArray(checkedOrder, from, to);
					renderSelectedList();
				});
				item.createSpan({ text: row.label });
				const controls = item.createDiv({ cls: "ordbok-wikidata-selected-controls" });

				const upBtn = controls.createEl("button", { text: "↑", attr: { "aria-label": "Flytt opp" } });
				upBtn.disabled = index === 0;
				upBtn.addEventListener("click", () => {
					moveInArray(checkedOrder, index, index - 1);
					renderSelectedList();
				});

				const downBtn = controls.createEl("button", { text: "↓", attr: { "aria-label": "Flytt ned" } });
				downBtn.disabled = index === checkedOrder.length - 1;
				downBtn.addEventListener("click", () => {
					moveInArray(checkedOrder, index, index + 1);
					renderSelectedList();
				});

				const removeBtn = controls.createEl("button", { text: "✕", attr: { "aria-label": "Fjern" } });
				removeBtn.addEventListener("click", () => {
					checkedOrder = checkedOrder.filter((x) => x !== id);
					const checkbox = checkboxByRowId.get(id);
					if (checkbox) checkbox.checked = false;
					renderSelectedList();
				});
			});
		};

		const renderCheckboxRow = (container: HTMLElement, row: WikidataFieldRow) => {
			const rowEl = container.createEl("label", { cls: "ordbok-wikidata-checkbox-row" });
			const checkbox = rowEl.createEl("input", { type: "checkbox" });
			checkbox.checked = checkedOrder.includes(row.id);
			checkboxByRowId.set(row.id, checkbox);
			checkbox.addEventListener("change", () => {
				if (checkbox.checked) {
					if (!checkedOrder.includes(row.id)) checkedOrder.push(row.id);
				} else {
					checkedOrder = checkedOrder.filter((id) => id !== row.id);
				}
				renderSelectedList();
			});
			const textEl = rowEl.createDiv();
			textEl.createEl("strong", { text: row.label });
			textEl.createEl("div", {
				text: row.values.join(" · "),
				cls: "ordbok-wikidata-desc",
			});
		};

		const isSpecialFieldRow = (row: WikidataFieldRow) =>
			row.id === "description" || row.id === "alias" || row.id.startsWith("translation:");
		const specialRows = rows.filter(isSpecialFieldRow);
		const propertyRows = rows.filter((r) => !isSpecialFieldRow(r));

		if (specialRows.length > 0) {
			leftCol.createEl("h4", { text: "Beskrivelse, alias og oversettelser" });
			for (const row of specialRows) renderCheckboxRow(leftCol, row);
			leftCol.createEl("h4", { text: "Wikidata-egenskaper" });
		}
		for (const row of propertyRows) renderCheckboxRow(leftCol, row);

		renderSelectedList();

		const buttonRow = contentEl.createDiv({ cls: "modal-button-container" });
		buttonRow
			.createEl("button", { text: "Tilbake" })
			.addEventListener("click", () => this.renderSearchStep(result.label));

		const importBtn = buttonRow.createEl("button", { text: "Importer", cls: "mod-cta" });
		importBtn.addEventListener("click", () => {
			const aliasRow = checkedOrder.includes("alias") ? rowById.get("alias") : undefined;
			if (aliasRow && aliasRow.values.length > 0) {
				new AliasTriageModal(
					this.app,
					aliasRow.values,
					this.plugin.settings.aliasAbbreviationMaxLength,
					(classification) => {
						void this.finishImport(result, rows, checkedOrder, importBtn, classification);
					}
				).open();
				return;
			}
			void this.finishImport(result, rows, checkedOrder, importBtn);
		});
	}

	private async finishImport(
		result: WikidataSearchResult,
		rows: WikidataFieldRow[],
		checkedOrder: string[],
		importBtn: HTMLButtonElement,
		aliasClassification?: { forkortelser: string[]; aliases: string[] }
	): Promise<void> {
		importBtn.disabled = true;
		importBtn.setText("Importerer …");
		try {
			const finalOrder = checkedOrder.filter((id) => id !== "alias");
			const applied = await this.plugin.applyWikidataImport(
				this.file,
				result.id,
				rows,
				finalOrder,
				aliasClassification
			);
			new Notice(`Ordbok: autoritetsdata importert fra Wikidata (${applied.join(", ")})`);
			this.close();
		} catch (e) {
			new Notice(`Ordbok: import feilet – ${e instanceof Error ? e.message : String(e)}`);
			importBtn.disabled = false;
			importBtn.setText("Importer");
		}
	}
}

class AliasTriageModal extends Modal {
	private choices = new Map<string, "forkortelse" | "alias">();

	constructor(
		app: App,
		private aliases: string[],
		abbreviationMaxLength: number,
		private onConfirm: (result: { forkortelser: string[]; aliases: string[] }) => void
	) {
		super(app);
		for (const alias of aliases) {
			const looksLikeAbbreviation = alias.length <= abbreviationMaxLength && !alias.includes(" ");
			this.choices.set(alias, looksLikeAbbreviation ? "forkortelse" : "alias");
		}
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: "Klassifiser Wikidata-alias" });
		contentEl.createEl("p", {
			text:
				"Wikidata skiller ikke mellom forkortelser og faktiske alias - velg for hvert " +
				"av dem om det skal inn i «forkortelser» (får sin egen pekerside) eller «aliases» " +
				"(Obsidians eget alias-felt, brukes til søk/autofullføring). Forhåndsvalget er " +
				"kun et gjetteforsøk basert på lengde (terskelen kan justeres i innstillingene) " +
				"- se over.",
		});

		const listEl = contentEl.createDiv({ cls: "ordbok-alias-triage-list" });

		for (const alias of this.aliases) {
			const row = new Setting(listEl).setName(alias);
			const forkortelseBtn = row.controlEl.createEl("button", { text: "Forkortelse" });
			const aliasBtn = row.controlEl.createEl("button", { text: "Alias" });

			const refresh = () => {
				const choice = this.choices.get(alias);
				forkortelseBtn.toggleClass("mod-cta", choice === "forkortelse");
				aliasBtn.toggleClass("mod-cta", choice === "alias");
			};
			forkortelseBtn.addEventListener("click", () => {
				this.choices.set(alias, "forkortelse");
				refresh();
			});
			aliasBtn.addEventListener("click", () => {
				this.choices.set(alias, "alias");
				refresh();
			});
			refresh();
		}

		const buttonRow = contentEl.createDiv({ cls: "modal-button-container" });
		buttonRow
			.createEl("button", { text: "Avbryt" })
			.addEventListener("click", () => this.close());

		buttonRow
			.createEl("button", { text: "Bruk valgene", cls: "mod-cta" })
			.addEventListener("click", () => {
				const forkortelser: string[] = [];
				const aliasesOut: string[] = [];
				for (const [alias, choice] of this.choices) {
					(choice === "forkortelse" ? forkortelser : aliasesOut).push(alias);
				}
				this.onConfirm({ forkortelser, aliases: aliasesOut });
				this.close();
			});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

class IdSeriesPickerModal extends Modal {
	constructor(
		app: App,
		private series: IdSeries[],
		private recommended: IdSeries[],
		private onChoose: (series: IdSeries) => void
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl("h2", { text: "Velg ID-serie" });

		const recommendedIds = new Set(this.recommended.map((s) => s.id));
		const listEl = contentEl.createDiv({ cls: "ordbok-wikidata-results" });

		for (const series of this.series) {
			const item = listEl.createDiv({ cls: "ordbok-wikidata-result" });
			const nextPreview = `${series.prefix}${String(series.nextNumber).padStart(
				series.padding,
				"0"
			)}`;
			item.createEl("strong", {
				text: recommendedIds.has(series.id) ? `${series.name} (anbefalt)` : series.name,
			});
			item.createEl("div", {
				text: `Neste: ${nextPreview} · felt: ${series.frontmatterKey}`,
				cls: "ordbok-wikidata-desc",
			});
			item.addEventListener("click", () => {
				this.onChoose(series);
				this.close();
			});
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

class ClaudePromptPickerModal extends Modal {
	constructor(
		app: App,
		private prompts: ClaudePrompt[],
		private onChoose: (prompt: ClaudePrompt) => void
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl("h2", { text: "Velg Claude-prompt" });

		const listEl = contentEl.createDiv({ cls: "ordbok-wikidata-results" });
		for (const prompt of this.prompts) {
			const item = listEl.createDiv({ cls: "ordbok-wikidata-result" });
			const kind = prompt.expectsFullFileReplacement ? "omskriving" : "rapport";
			item.createEl("strong", { text: `${prompt.name} (${kind})` });
			item.createEl("div", {
				text: prompt.prompt,
				cls: "ordbok-wikidata-desc",
			});
			item.addEventListener("click", () => {
				this.onChoose(prompt);
				this.close();
			});
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

class ClaudeSuggestionModal extends Modal {
	constructor(
		app: App,
		private file: TFile,
		private promptDef: ClaudePrompt,
		private suggestion: string,
		private onDecide: (accepted: boolean) => void,
		private onSaveAsArticleNote: () => void
	) {
		super(app);
	}

	onOpen(): void {
		this.modalEl.addClass("ordbok-wikidata-import-modal");
		const { contentEl } = this;
		contentEl.createEl("h2", { text: `Claude-forslag: ${this.promptDef.name}` });
		contentEl.createEl("p", {
			text: this.promptDef.expectsFullFileReplacement
				? `Side: ${this.file.path}. Gjennomgå forslaget under før du eventuelt bruker det - det erstatter hele sideinnholdet, inkludert frontmatter.`
				: `Side: ${this.file.path}. Dette er en rapport/liste, ikke en omskriving - ` +
				  "siden endres ikke automatisk. Bruk «Kopier» for å ta vare på teksten.",
		});

		const textarea = contentEl.createEl("textarea", { cls: "ordbok-claude-suggestion" });
		textarea.readOnly = true;
		textarea.value = this.suggestion;

		const buttonRow = contentEl.createDiv({ cls: "modal-button-container" });
		buttonRow
			.createEl("button", { text: this.promptDef.expectsFullFileReplacement ? "Avbryt" : "Lukk" })
			.addEventListener("click", () => {
				this.onDecide(false);
				this.close();
			});

		buttonRow
			.createEl("button", {
				text: "Kopier til utklippstavle",
				cls: this.promptDef.expectsFullFileReplacement ? "" : "mod-cta",
			})
			.addEventListener("click", () => {
				void navigator.clipboard.writeText(this.suggestion);
				new Notice("Ordbok: forslag kopiert til utklippstavlen");
			});

		buttonRow
			.createEl("button", { text: "Legg til som artikkelnotat" })
			.addEventListener("click", () => {
				this.onSaveAsArticleNote();
			});

		if (this.promptDef.expectsFullFileReplacement) {
			buttonRow
				.createEl("button", { text: "Bruk (erstatt hele siden)", cls: "mod-cta" })
				.addEventListener("click", () => {
					this.onDecide(true);
					this.close();
				});
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

class OrdbokSidebarView extends ItemView {
	constructor(leaf: WorkspaceLeaf, private plugin: OrdbokPekersiderPlugin) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_ORDBOK;
	}

	getDisplayText(): string {
		return "Ordbok";
	}

	getIcon(): string {
		return "book-open";
	}

	async onOpen(): Promise<void> {
		this.render();
	}

	async onClose(): Promise<void> {
		this.contentEl.empty();
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("ordbok-sidebar");

		const addSection = (title: string, buttons: [string, () => void][]) => {
			contentEl.createEl("h4", { text: title });
			const group = contentEl.createDiv({ cls: "ordbok-sidebar-group" });
			for (const [label, action] of buttons) {
				const btn = group.createEl("button", {
					text: label,
					cls: "ordbok-sidebar-btn",
				});
				btn.addEventListener("click", () => action());
			}
		};

		addSection("Leksikon-arbeidsflyt", [
			["Publiser sider fra innboks", () => this.plugin.publishFromInbox()],
			["Organiser alle sider", () => this.plugin.organizeAllPages()],
		]);

		addSection("Regenerering", [
			["Regenerer peker- og redirect-sider", () => this.plugin.regenerate()],
			["Regenerer indekssider", () => this.plugin.regenerateIndexes()],
		]);

		addSection("Vedlikehold", [
			["Migrer aliases til forkortelser", () => this.plugin.runMigration()],
			[
				"Bruk artikkelmal på eksisterende sider",
				() => this.plugin.applyArticleTemplateToExisting(),
			],
			[
				"Hent autoritetsdata fra Wikidata (aktiv side)",
				() => this.plugin.openWikidataImport(),
			],
			["Oppdater «Se også»-seksjoner", () => this.plugin.updateSeOgsåSections()],
			["Slett alle autogenererte sider", () => this.plugin.confirmDeleteAllAutoGenerated()],
		]);

		addSection("Interne ID-numre", [
			["Generer internt ID-nummer (aktiv side)", () => this.plugin.generateIdForActiveFile()],
			["Masse-generer ID-numre for en serie", () => this.plugin.generateIdsForSeriesBulk()],
		]);

		addSection("Claude", [
			[
				"Foreslå omskriving med Claude (aktiv side)",
				() => this.plugin.generateClaudeSuggestionForActiveFile(),
			],
		]);

		addSection("Rapporter", [
			["Vis leksikon-statistikk", () => this.plugin.showStats()],
			["Vis manglende artikler", () => this.plugin.showMissingLinks()],
			["Vis mulige duplikater", () => this.plugin.showDuplicates()],
			["Vis foreldreløse artikler", () => this.plugin.showOrphanArticles()],
		]);
	}
}

export default class OrdbokPekersiderPlugin extends Plugin {
	settings: OrdbokSettings = DEFAULT_SETTINGS;
	private wikidataLabelCache = new Map<string, string>();

	async onload() {
		await this.loadSettings();
		this.injectStyles();
		await this.ensureLeksikonScaffold();

		this.addCommand({
			id: "regenerer-pekersider",
			name: "Regenerer peker- og redirect-sider",
			callback: () => this.regenerate(),
		});

		this.addCommand({
			id: "regenerer-indekssider",
			name: "Regenerer indekssider",
			callback: () => this.regenerateIndexes(),
		});

		this.addCommand({
			id: "migrer-aliases-til-forkortelser",
			name: "Migrer aliases til forkortelser",
			callback: () => this.runMigration(),
		});

		this.addCommand({
			id: "slett-autogenererte-sider",
			name: "Slett alle autogenererte sider",
			callback: () => this.confirmDeleteAllAutoGenerated(),
		});

		this.addCommand({
			id: "publiser-fra-innboks",
			name: "Publiser sider fra innboks",
			callback: () => this.publishFromInbox(),
		});

		this.addCommand({
			id: "organiser-alle-sider",
			name: "Organiser alle sider",
			callback: () => this.organizeAllPages(),
		});

		this.addCommand({
			id: "vis-manglende-artikler",
			name: "Vis manglende artikler",
			callback: () => this.showMissingLinks(),
		});

		this.addCommand({
			id: "vis-mulige-duplikater",
			name: "Vis mulige duplikater",
			callback: () => this.showDuplicates(),
		});

		this.addCommand({
			id: "vis-foreldrelose-artikler",
			name: "Vis foreldreløse artikler",
			callback: () => this.showOrphanArticles(),
		});

		this.addCommand({
			id: "oppdater-se-ogsaa",
			name: "Oppdater «Se også»-seksjoner",
			callback: () => this.updateSeOgsåSections(),
		});

		this.addCommand({
			id: "vis-leksikon-statistikk",
			name: "Vis leksikon-statistikk",
			callback: () => this.showStats(),
		});

		this.addCommand({
			id: "bruk-artikkelmal-pa-eksisterende",
			name: "Bruk artikkelmal på eksisterende sider",
			callback: () => this.applyArticleTemplateToExisting(),
		});

		this.addCommand({
			id: "hent-autoritetsdata-fra-wikidata",
			name: "Hent autoritetsdata fra Wikidata",
			callback: () => this.openWikidataImport(),
		});

		this.addCommand({
			id: "generer-internt-id-aktiv-side",
			name: "Generer internt ID-nummer (aktiv side)",
			callback: () => this.generateIdForActiveFile(),
		});

		this.addCommand({
			id: "masse-generer-id-numre",
			name: "Masse-generer ID-numre for en serie",
			callback: () => this.generateIdsForSeriesBulk(),
		});

		this.addCommand({
			id: "foresla-omskriving-med-claude",
			name: "Foreslå omskriving med Claude (aktiv side)",
			callback: () => this.generateClaudeSuggestionForActiveFile(),
		});

		this.addCommand({
			id: "test-claude-cli",
			name: "Test Claude CLI-tilkobling",
			callback: () => void this.testClaudeCliConnection(),
		});

		this.registerEvent(
			this.app.vault.on("create", (file) => {
				if (!(file instanceof TFile) || file.extension !== "md") return;
				const root = this.settings.leksikonRoot;
				if (!root) return;
				if (this.folderPathOf(file) !== `${root}/${INBOX_FOLDER_NAME}`) return;
				void this.applyArticleTemplateOnCreate(file);
			})
		);

		this.addSettingTab(new OrdbokSettingTab(this.app, this));

		this.addRibbonIcon(
			"refresh-cw",
			"Regenerer peker- og redirect-sider",
			() => this.regenerate()
		);

		this.registerView(VIEW_TYPE_ORDBOK, (leaf) => new OrdbokSidebarView(leaf, this));

		this.addRibbonIcon("book-open", "Åpne Ordbok-panel", () => this.activateView());

		this.addCommand({
			id: "apne-ordbok-panel",
			name: "Åpne Ordbok-panel",
			callback: () => this.activateView(),
		});
	}

	async activateView(): Promise<void> {
		const { workspace } = this.app;

		let leaf = workspace.getLeavesOfType(VIEW_TYPE_ORDBOK)[0];
		if (!leaf) {
			leaf = workspace.getRightLeaf(false) ?? workspace.getLeaf(true);
			await leaf.setViewState({ type: VIEW_TYPE_ORDBOK, active: true });
		}
		workspace.revealLeaf(leaf);
	}

	private injectStyles() {
		const styleEl = document.createElement("style");
		styleEl.id = STYLE_EL_ID;
		styleEl.textContent = PLUGIN_STYLES;
		document.head.appendChild(styleEl);
		this.register(() => styleEl.remove());
	}

	async loadSettings() {
		const loaded: unknown = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded ?? {});

		// Migrer fra en eldre versjon der standardfeltene lå direkte i
		// wikidataDefaultFields (som streng eller array) i stedet for i en
		// navngitt gruppe.
		const legacy = (loaded as Record<string, unknown> | undefined)?.wikidataDefaultFields;
		if (legacy !== undefined) {
			const fields =
				typeof legacy === "string"
					? legacy
							.split(",")
							.map((s) => s.trim())
							.filter((s) => s.length > 0)
					: Array.isArray(legacy)
					  ? legacy.filter((s): s is string => typeof s === "string")
					  : [];

			if (fields.length > 0) {
				this.settings.wikidataPresets = [
					{ id: DEFAULT_WIKIDATA_PRESET_ID, name: "Standard", fields },
				];
				this.settings.activeWikidataPresetId = DEFAULT_WIKIDATA_PRESET_ID;
			}
			delete (this.settings as { wikidataDefaultFields?: unknown }).wikidataDefaultFields;
			await this.saveSettings();
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	private sanitizeFilename(name: string): string {
		return name
			.replace(ILLEGAL_FILENAME_CHARS, "-")
			.replace(/\s+/g, " ")
			.trim()
			.replace(/\.+$/, "");
	}

	private isAutoGenerated(file: TFile): boolean {
		const cache = this.app.metadataCache.getFileCache(file);
		return cache?.frontmatter?.[AUTO_GENERATED_KEY] === true;
	}

	private folderPathOf(file: TFile): string {
		return file.parent && file.parent.path !== "/" ? file.parent.path : "";
	}

	private isInScope(file: TFile): boolean {
		const scopes = this.settings.scopedFolders;
		if (scopes.length === 0) return true;

		const folderPath = this.folderPathOf(file);

		return scopes.some((scope) => {
			const scopePath = scope.path === "/" ? "" : scope.path;

			if (scopePath === "") {
				return scope.includeSubfolders || folderPath === "";
			}
			if (folderPath === scopePath) return true;
			return scope.includeSubfolders && folderPath.startsWith(scopePath + "/");
		});
	}

	/** Første bokstav (stor forbokstav) i en tekst, brukt som mappenavn i
	 * leksikon-strukturen. Tekst som ikke starter på en bokstav havner i en
	 * felles «#»-mappe. */
	private letterFor(text: string): string {
		const ch = text.trim().charAt(0).toUpperCase();
		return /[A-ZÆØÅ]/.test(ch) ? ch : NON_LETTER_FOLDER;
	}

	private folderUnderLeksikonRoot(file: TFile): boolean {
		const root = this.settings.leksikonRoot;
		if (!root) return false;
		const folderPath = this.folderPathOf(file);
		return folderPath === root || folderPath.startsWith(root + "/");
	}

	private newLog(title: string): string[] {
		return [`# ${title}`, `Tidspunkt: ${new Date().toLocaleString("no-NO")}`, ""];
	}

	/** Skriver en loggfil til `<leksikon-rot>/02 Notater/ÅÅÅÅ-MM-DD/`, navngitt med
	 * dato og klokkeslett. Gjør ingenting hvis leksikon-rot ikke er satt. */
	private async writeLog(lines: string[]): Promise<void> {
		const root = this.settings.leksikonRoot;
		if (!root) return;

		const now = new Date();
		const pad = (n: number) => String(n).padStart(2, "0");
		const dateFolder = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
		const timePart = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;

		const folderPath = `${root}/${NOTES_FOLDER_NAME}/${dateFolder}`;
		await this.ensureFolder(folderPath);

		let path = `${folderPath}/${dateFolder} ${timePart}.md`;
		if (this.app.vault.getAbstractFileByPath(path)) {
			path = `${folderPath}/${dateFolder} ${timePart} (${Date.now()}).md`;
		}
		await this.app.vault.create(path, lines.join("\n") + "\n");
	}

	/** Oppretter mappen (og eventuelle manglende foreldremapper) hvis den
	 * ikke finnes fra før. Kalles kun rett før en fil faktisk skal skrives
	 * dit, slik at vi aldri oppretter tomme bokstavmapper spekulativt. */
	private async ensureFolder(path: string): Promise<void> {
		if (!path) return;
		if (this.app.vault.getAbstractFileByPath(path) instanceof TFolder) return;

		let current = "";
		for (const segment of path.split("/")) {
			current = current === "" ? segment : `${current}/${segment}`;
			if (!this.app.vault.getAbstractFileByPath(current)) {
				await this.app.vault.createFolder(current);
			}
		}
	}

	private readForkortelser(frontmatter: Record<string, unknown>): string[] {
		const raw = frontmatter[FORKORTELSER_KEY];
		if (raw === undefined || raw === null) return [];
		const arr = Array.isArray(raw) ? raw : [raw];
		return arr.map((v) => String(v).trim()).filter((v) => v.length > 0);
	}

	/**
	 * Kopierer eksisterende `aliases`-verdier inn i `forkortelser`-feltet for
	 * notater som ikke allerede har det feltet satt. Rører aldri `aliases`,
	 * så Obsidians egen alias-oppførsel (søk/autocomplete) påvirkes ikke.
	 * Returnerer verdiene som ble skrevet, siden metadataCache ikke
	 * nødvendigvis har rukket å indeksere dem når vi trenger dem videre.
	 */
	private async migrateAliasesToForkortelser(
		files: TFile[]
	): Promise<Map<string, string[]>> {
		const migrated = new Map<string, string[]>();

		for (const file of files) {
			const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
			if (!frontmatter || frontmatter[FORKORTELSER_KEY] !== undefined) continue;

			const aliases = parseFrontMatterAliases(frontmatter);
			if (!aliases || aliases.length === 0) continue;

			await this.app.fileManager.processFrontMatter(file, (fm) => {
				if (fm[FORKORTELSER_KEY] === undefined) {
					fm[FORKORTELSER_KEY] = aliases;
				}
			});
			migrated.set(file.path, aliases);
		}

		return migrated;
	}

	async runMigration() {
		const scopedRealFiles = this.app.vault
			.getMarkdownFiles()
			.filter((f) => this.isInScope(f) && !this.isAutoGenerated(f));

		const migrated = await this.migrateAliasesToForkortelser(scopedRealFiles);

		new Notice(
			migrated.size > 0
				? `Ordbok: ${migrated.size} notat(er) migrert fra aliases til forkortelser`
				: "Ordbok: ingen notater å migrere"
		);

		if (migrated.size > 0) {
			const log = this.newLog("Migrer aliases til forkortelser");
			for (const [path, aliases] of migrated) {
				log.push(`Migrert: ${path} -> forkortelser: ${aliases.join(", ")}`);
			}
			await this.writeLog(log);
		}
	}

	confirmDeleteAllAutoGenerated() {
		const count = this.app.vault
			.getMarkdownFiles()
			.filter((f) => this.isInScope(f) && this.isAutoGenerated(f)).length;

		if (count === 0) {
			new Notice("Ordbok: ingen autogenererte sider å slette");
			return;
		}

		new ConfirmModal(
			this.app,
			"Slett autogenererte sider",
			`Dette sletter ${count} peker-/redirect-side(r) laget av denne utvidelsen ` +
				"innenfor valgt mappe-scope. De kan lages på nytt med «Regenerer " +
				"peker- og redirect-sider». Fortsette?",
			"Slett",
			() => this.deleteAllAutoGenerated(),
			true
		).open();
	}

	private async deleteAllAutoGenerated() {
		const log = this.newLog("Slett alle autogenererte sider");
		let deleted = 0;
		for (const file of this.app.vault.getMarkdownFiles()) {
			if (!this.isInScope(file)) continue;
			if (!this.isAutoGenerated(file)) continue;
			log.push(`Slettet: ${file.path}`);
			await this.app.vault.delete(file);
			deleted++;
		}
		new Notice(`Ordbok: ${deleted} autogenererte side(r) slettet`);
		if (deleted > 0) await this.writeLog(log);
	}

	async publishFromInbox() {
		const root = this.settings.leksikonRoot;
		if (!root) {
			new Notice("Ordbok: sett leksikon-rotmappe i innstillingene først");
			return;
		}

		const inboxPath = `${root}/${INBOX_FOLDER_NAME}`;
		const inboxFolder = this.app.vault.getAbstractFileByPath(inboxPath);
		if (!(inboxFolder instanceof TFolder)) {
			new Notice(`Ordbok: fant ikke innboksmappen «${inboxPath}»`);
			return;
		}

		const candidates = inboxFolder.children.filter(
			(f): f is TFile =>
				f instanceof TFile &&
				f.extension === "md" &&
				this.app.metadataCache.getFileCache(f)?.frontmatter?.[PUBLISER_KEY] === true
		);

		if (candidates.length === 0) {
			new Notice("Ordbok: ingen sider i innboksen er markert for publisering");
			return;
		}

		const ready: TFile[] = [];
		const blocked: TFile[] = [];
		for (const file of candidates) {
			const content = await this.app.vault.cachedRead(file);
			if (content.includes(INCOMPLETE_MARKER)) blocked.push(file);
			else ready.push(file);
		}

		if (ready.length === 0) {
			new Notice(
				`Ordbok: ${blocked.length} side(r) markert for publisering, men inneholder ` +
					`«${INCOMPLETE_MARKER}» (ufullstendig import) – ingen ble publisert`
			);
			return;
		}

		const message =
			`Dette flytter ${ready.length} side(r) fra «${INBOX_FOLDER_NAME}» til riktig ` +
			"bokstavmappe, og oppdaterer peker-/redirect-sider deretter." +
			(blocked.length > 0
				? ` ${blocked.length} side(r) hoppes over fordi de inneholder ` +
				  `«${INCOMPLETE_MARKER}» (ufullstendig import).`
				: "") +
			" Fortsette?";

		new ConfirmModal(
			this.app,
			"Publiser sider fra innboks",
			message,
			"Publiser",
			() => this.executePublishFromInbox(ready)
		).open();
	}

	private async moveFilesToLetterFolders(
		files: TFile[]
	): Promise<{ moved: number; skipped: string[]; log: string[] }> {
		const root = this.settings.leksikonRoot;
		let moved = 0;
		const skipped: string[] = [];
		const log: string[] = [];

		for (const file of files) {
			const folderPath = `${root}/${this.letterFor(file.basename)}`;
			await this.ensureFolder(folderPath);
			const destPath = `${folderPath}/${file.name}`;

			if (this.app.vault.getAbstractFileByPath(destPath)) {
				skipped.push(file.path);
				log.push(`Hoppet over (finnes allerede i målmappen): ${file.path}`);
				continue;
			}

			await this.app.fileManager.renameFile(file, destPath);
			log.push(`Flyttet: ${file.path} -> ${destPath}`);
			moved++;
		}

		return { moved, skipped, log };
	}

	private async executePublishFromInbox(files: TFile[]) {
		const log = this.newLog("Publiser sider fra innboks");
		const { moved, skipped, log: moveLog } = await this.moveFilesToLetterFolders(files);
		log.push(...moveLog);

		new Notice(
			`Ordbok: ${moved} side(r) publisert` +
				(skipped.length > 0
					? `, ${skipped.length} hoppet over (finnes allerede i målmappen)`
					: "")
		);

		if (moved > 0) {
			const items = this.buildRegeneratePlan();
			log.push("", "## Etterfølgende regenerering", "");
			log.push(...(await this.executeRegenerate(items)));
		}

		await this.writeLog(log);
	}

	async organizeAllPages() {
		const root = this.settings.leksikonRoot;
		if (!root) {
			new Notice("Ordbok: sett leksikon-rotmappe i innstillingene først");
			return;
		}

		if (!(this.app.vault.getAbstractFileByPath(root) instanceof TFolder)) {
			new Notice(`Ordbok: fant ikke leksikon-rotmappen «${root}»`);
			return;
		}

		const excludedPaths = [
			`${root}/${INBOX_FOLDER_NAME}`,
			`${root}/${TEMPLATE_FOLDER_NAME}`,
			`${root}/${NOTES_FOLDER_NAME}`,
		];

		const candidates = this.app.vault.getMarkdownFiles().filter((f) => {
			if (!this.folderUnderLeksikonRoot(f)) return false;
			if (this.isAutoGenerated(f)) return false;

			const folderPath = this.folderPathOf(f);
			if (excludedPaths.some((p) => folderPath === p || folderPath.startsWith(p + "/"))) {
				return false;
			}

			return folderPath !== `${root}/${this.letterFor(f.basename)}`;
		});

		if (candidates.length === 0) {
			new Notice("Ordbok: alle sider ligger allerede i riktig bokstavmappe");
			return;
		}

		const ready: TFile[] = [];
		const blocked: TFile[] = [];
		for (const file of candidates) {
			const content = await this.app.vault.cachedRead(file);
			if (content.includes(INCOMPLETE_MARKER)) blocked.push(file);
			else ready.push(file);
		}

		if (ready.length === 0) {
			new Notice(
				`Ordbok: ${blocked.length} side(r) trenger organisering, men inneholder alle ` +
					`«${INCOMPLETE_MARKER}» (ufullstendig import) – ingen ble flyttet`
			);
			return;
		}

		const bySource = new Map<string, number>();
		for (const f of ready) {
			const src = this.folderPathOf(f) || "(rot)";
			bySource.set(src, (bySource.get(src) ?? 0) + 1);
		}
		const breakdown = [...bySource.entries()]
			.sort((a, b) => b[1] - a[1])
			.map(([folder, count]) => `${folder}: ${count}`)
			.join(", ");

		const message =
			`Dette flytter ${ready.length} side(r) til riktig bokstavmappe under «${root}» ` +
			`(${breakdown}). Innboksen («${INBOX_FOLDER_NAME}») er ikke inkludert – bruk ` +
			"«Publiser sider fra innboks» for den." +
			(blocked.length > 0
				? ` ${blocked.length} side(r) hoppes over fordi de inneholder ` +
				  `«${INCOMPLETE_MARKER}» (ufullstendig import).`
				: "") +
			" Fortsette?";

		new ConfirmModal(
			this.app,
			"Organiser alle sider",
			message,
			"Organiser",
			() => this.executeOrganizeAllPages(ready)
		).open();
	}

	private async executeOrganizeAllPages(files: TFile[]) {
		const log = this.newLog("Organiser alle sider");
		const { moved, skipped, log: moveLog } = await this.moveFilesToLetterFolders(files);
		log.push(...moveLog);

		new Notice(
			`Ordbok: ${moved} side(r) organisert` +
				(skipped.length > 0
					? `, ${skipped.length} hoppet over (finnes allerede i målmappen)`
					: "")
		);

		if (moved > 0) {
			const items = this.buildRegeneratePlan();
			log.push("", "## Etterfølgende regenerering", "");
			log.push(...(await this.executeRegenerate(items)));
		}

		await this.writeLog(log);
	}

	/** Lenketekst -> filer som refererer til et lenkemål uten noen faktisk side. */
	private computeMissingLinks(): Map<string, TFile[]> {
		const scopedRealFiles = this.app.vault
			.getMarkdownFiles()
			.filter((f) => this.isInScope(f) && !this.isAutoGenerated(f));

		const missing = new Map<string, TFile[]>();

		for (const file of scopedRealFiles) {
			const cache = this.app.metadataCache.getFileCache(file);
			const links = [...(cache?.links ?? []), ...(cache?.embeds ?? [])];

			for (const link of links) {
				if (this.app.metadataCache.getFirstLinkpathDest(link.link, file.path)) {
					continue;
				}
				const list = missing.get(link.link);
				if (list) list.push(file);
				else missing.set(link.link, [file]);
			}
		}

		return missing;
	}

	showMissingLinks() {
		const missing = this.computeMissingLinks();

		if (missing.size === 0) {
			new Notice("Ordbok: ingen manglende lenkemål funnet");
			return;
		}

		const items = [...missing.entries()]
			.sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
			.map(([link, files]) => `${link} — nevnt i ${files.length} fil(er)`);

		new ListModal(
			this.app,
			"Manglende artikler",
			`${missing.size} unike lenkemål mangler en side (innenfor valgt mappe-scope):`,
			items
		).open();
	}

	/** Grupperer artikler med (nesten) samme tittel – kun forskjell i store/små
	 * bokstaver og/eller et tall-suffiks (f.eks. «DBT» og «DBT 2») regnes som
	 * mulige duplikater. */
	private computeDuplicateGroups(): TFile[][] {
		const scopedRealFiles = this.app.vault
			.getMarkdownFiles()
			.filter((f) => this.isInScope(f) && !this.isAutoGenerated(f));

		const groups = new Map<string, TFile[]>();
		for (const file of scopedRealFiles) {
			const normalized = file.basename
				.trim()
				.toLowerCase()
				.replace(/\s+\d+$/, "");
			const list = groups.get(normalized);
			if (list) list.push(file);
			else groups.set(normalized, [file]);
		}

		return [...groups.values()].filter((files) => files.length > 1);
	}

	showDuplicates() {
		const duplicateGroups = this.computeDuplicateGroups();

		if (duplicateGroups.length === 0) {
			new Notice("Ordbok: ingen mulige duplikater funnet");
			return;
		}

		const items = duplicateGroups
			.sort((a, b) => b.length - a.length)
			.map((files) => files.map((f) => f.path).join("  vs.  "));

		new ListModal(
			this.app,
			"Mulige duplikater",
			`${duplicateGroups.length} gruppe(r) med sannsynlig samme artikkel (innenfor ` +
				"valgt mappe-scope):",
			items
		).open();
	}

	/** Ekte artikler ingen andre sider (heller ikke autogenererte) lenker til. */
	private computeOrphanArticles(): TFile[] {
		const scopedRealFiles = this.app.vault
			.getMarkdownFiles()
			.filter((f) => this.isInScope(f) && !this.isAutoGenerated(f));

		const linkedTargets = new Set<string>();
		for (const targets of Object.values(this.app.metadataCache.resolvedLinks)) {
			for (const targetPath of Object.keys(targets)) {
				linkedTargets.add(targetPath);
			}
		}

		return scopedRealFiles.filter((f) => !linkedTargets.has(f.path));
	}

	showOrphanArticles() {
		const orphans = this.computeOrphanArticles();

		if (orphans.length === 0) {
			new Notice("Ordbok: ingen foreldreløse artikler funnet");
			return;
		}

		const items = orphans.map((f) => f.path).sort((a, b) => a.localeCompare(b, "no"));

		new ListModal(
			this.app,
			"Foreldreløse artikler",
			`${orphans.length} artikkel/artikler uten innkommende lenker (innenfor valgt ` +
				"mappe-scope):",
			items
		).open();
	}

	private escapeRegExp(text: string): string {
		return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	}

	private readRelatert(frontmatter: Record<string, unknown>): string[] {
		const raw = frontmatter[RELATERT_KEY];
		if (raw === undefined || raw === null) return [];
		const arr = Array.isArray(raw) ? raw : [raw];
		return arr.map((v) => String(v).trim()).filter((v) => v.length > 0);
	}

	private seOgsåBlock(relatert: string[]): string {
		return [
			SE_OGSÅ_START,
			"## Se også",
			"",
			...relatert.map((r) => `- [[${r}]]`),
			SE_OGSÅ_END,
		].join("\n");
	}

	private applySeOgsåSection(content: string, relatert: string[]): string {
		const blockRegex = new RegExp(
			`\\n*${this.escapeRegExp(SE_OGSÅ_START)}[\\s\\S]*?${this.escapeRegExp(SE_OGSÅ_END)}\\n*`
		);
		const hasBlock = blockRegex.test(content);

		if (relatert.length === 0) {
			return hasBlock ? content.replace(blockRegex, "\n").trimEnd() + "\n" : content;
		}

		const block = this.seOgsåBlock(relatert);
		if (hasBlock) {
			return content.replace(blockRegex, `\n\n${block}\n`);
		}
		return content.trimEnd() + `\n\n${block}\n`;
	}

	async updateSeOgsåSections() {
		const scopedRealFiles = this.app.vault
			.getMarkdownFiles()
			.filter((f) => this.isInScope(f) && !this.isAutoGenerated(f));

		const changes: { file: TFile; newContent: string }[] = [];
		for (const file of scopedRealFiles) {
			const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
			const relatert = this.readRelatert(frontmatter);

			const content = await this.app.vault.cachedRead(file);
			const newContent = this.applySeOgsåSection(content, relatert);
			if (newContent !== content) changes.push({ file, newContent });
		}

		if (changes.length === 0) {
			new Notice("Ordbok: ingen «Se også»-seksjoner å oppdatere");
			return;
		}

		new ConfirmModal(
			this.app,
			"Oppdater «Se også»-seksjoner",
			`Dette oppdaterer «Se også»-seksjonen i ${changes.length} artikkel(er) ut fra ` +
				"«relatert»-feltet i frontmatter (fjernes helt der «relatert» er tomt). Fortsette?",
			"Oppdater",
			async () => {
				const log = this.newLog("Oppdater «Se også»-seksjoner");
				for (const { file, newContent } of changes) {
					log.push(`Oppdatert: ${file.path}`);
					await this.app.vault.modify(file, newContent);
				}
				new Notice(`Ordbok: ${changes.length} «Se også»-seksjon(er) oppdatert`);
				await this.writeLog(log);
			}
		).open();
	}

	showStats() {
		const root = this.settings.leksikonRoot;
		const lines: string[] = [];

		if (!root) {
			lines.push("Leksikon-rotmappe er ikke satt (se innstillinger).");
		} else {
			const rootFolder = this.app.vault.getAbstractFileByPath(root);
			if (!(rootFolder instanceof TFolder)) {
				lines.push(`Fant ikke leksikon-rotmappen «${root}».`);
			} else {
				let totalArticles = 0;
				const perLetter: string[] = [];

				for (const child of rootFolder.children) {
					if (!(child instanceof TFolder)) continue;
					if (child.name === INBOX_FOLDER_NAME || child.name === TEMPLATE_FOLDER_NAME || child.name === NOTES_FOLDER_NAME) continue;
					const count = child.children.filter(
						(f): f is TFile =>
							f instanceof TFile && f.extension === "md" && !this.isAutoGenerated(f)
					).length;
					if (count > 0) {
						perLetter.push(`${child.name}: ${count}`);
						totalArticles += count;
					}
				}

				lines.push(`Artikler totalt: ${totalArticles}`);
				lines.push(...perLetter.sort((a, b) => a.localeCompare(b, "no")));

				const inboxFolder = this.app.vault.getAbstractFileByPath(
					`${root}/${INBOX_FOLDER_NAME}`
				);
				if (inboxFolder instanceof TFolder) {
					const inboxFiles = inboxFolder.children.filter(
						(f): f is TFile => f instanceof TFile && f.extension === "md"
					);
					const ready = inboxFiles.filter(
						(f) =>
							this.app.metadataCache.getFileCache(f)?.frontmatter?.[
								PUBLISER_KEY
							] === true
					).length;
					lines.push(`Innboks: ${inboxFiles.length} totalt, ${ready} klare for publisering`);
				}
			}
		}

		const items = this.buildRegeneratePlan();
		const preview = this.previewRegenerate(items);
		lines.push(
			`Peker-/redirect-/indekssider som trenger handling: ${preview.newCount} ny(e), ` +
				`${preview.modifyCount} oppdatert(e), ${preview.deleteCount} foreldreløse`
		);
		if (preview.conflictCount > 0) {
			lines.push(`Kollisjoner (eksisterende, ikke-genererte filer i veien): ${preview.conflictCount}`);
		}

		const missing = this.computeMissingLinks();
		lines.push(`Manglende lenkemål (røde lenker): ${missing.size} unike`);

		new ListModal(this.app, "Leksikon-statistikk", "", lines).open();
	}

	private aliasKey(alias: string): string {
		// Når case-sensitivitet er av, slås også skrivemåter med/uten mellomrom
		// sammen (f.eks. «Adm. dir.» og «adm.dir.»), ikke bare store/små bokstaver.
		return this.settings.caseSensitiveAliases
			? alias
			: alias.toLowerCase().replace(/\s+/g, "");
	}

	/** Ved flere skrivemåter (kun mulig når case-sensitivitet er av) velges
	 * den som forekommer oftest; ved likt antall vinner alfabetisk først, for
	 * et deterministisk filnavn. */
	private canonicalSpelling(spellings: string[]): string {
		const counts = new Map<string, number>();
		for (const s of spellings) counts.set(s, (counts.get(s) ?? 0) + 1);

		return [...counts.entries()].sort(
			(a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
		)[0][0];
	}

	private collectAliasEntries(files: TFile[]): Map<string, AliasEntry> {
		const groups = new Map<
			string,
			{ files: Map<string, TFile>; spellings: string[] }
		>();

		for (const file of files) {
			const forkortelser = this.readForkortelser(
				this.app.metadataCache.getFileCache(file)?.frontmatter ?? {}
			);

			for (const rawAlias of forkortelser) {
				const alias = rawAlias.trim();
				if (!alias || alias === file.basename) continue;

				const key = this.aliasKey(alias);
				const group = groups.get(key);
				if (group) {
					group.files.set(file.path, file);
					group.spellings.push(alias);
				} else {
					groups.set(key, {
						files: new Map([[file.path, file]]),
						spellings: [alias],
					});
				}
			}
		}

		const entries = new Map<string, AliasEntry>();
		for (const [key, group] of groups) {
			entries.set(key, {
				alias: this.canonicalSpelling(group.spellings),
				files: [...group.files.values()],
			});
		}

		return entries;
	}

	private commonFolder(files: TFile[]): TFolder {
		const root = this.app.vault.getRoot();
		if (files.length === 0) return root;

		const segmentLists = files.map((f) =>
			f.parent && f.parent.path !== "/"
				? f.parent.path.split("/")
				: []
		);

		let common = segmentLists[0];
		for (const segments of segmentLists.slice(1)) {
			let i = 0;
			while (i < common.length && i < segments.length && common[i] === segments[i]) {
				i++;
			}
			common = common.slice(0, i);
		}

		if (common.length === 0) return root;

		const folder = this.app.vault.getAbstractFileByPath(common.join("/"));
		return folder instanceof TFolder ? folder : root;
	}

	private async excerptFor(file: TFile): Promise<string> {
		const content = await this.app.vault.cachedRead(file);
		const body = content.replace(/^---\n[\s\S]*?\n---\n/, "");
		const firstLine = body
			.split("\n")
			.map((l) => l.trim())
			.find((l) => l.length > 0);

		if (!firstLine) return "";

		const cleaned = firstLine
			.replace(/\[\^[^\]]+\]/g, "") // fotnotereferanser
			.replace(/\[\[[^\]|]+\|([^\]]+)\]\]/g, "$1") // [[mål|visning]] -> visning
			.replace(/\[\[([^\]]+)\]\]/g, "$1") // [[mål]] -> mål
			.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // [tekst](url) -> tekst
			.replace(/\s+/g, " ")
			.trim();

		if (!cleaned) return "";
		const maxLength = this.settings.excerptMaxLength;
		return cleaned.length > maxLength
			? cleaned.slice(0, maxLength).trimEnd() + "…"
			: cleaned;
	}

	/** Oppretter mal-mappen og standardmalene der, hvis de ikke finnes fra før.
	 * Rører aldri en mal som allerede finnes – brukerens redigeringer bevares. */
	/** Oppretter innboks- og mal-mappen (med standardmaler) hvis de ikke
	 * finnes fra før. Rører aldri en mal som allerede finnes. */
	/** Flytter en gammelt navngitt mappe til sitt nye navn, hvis den gamle
	 * finnes og den nye ikke allerede gjør det. Bevarer alt innhold. */
	private async renameFolderIfNeeded(oldPath: string, newPath: string): Promise<void> {
		const oldFolder = this.app.vault.getAbstractFileByPath(oldPath);
		const newExists = this.app.vault.getAbstractFileByPath(newPath);
		if (oldFolder instanceof TFolder && !newExists) {
			await this.app.fileManager.renameFile(oldFolder, newPath);
		}
	}

	async ensureLeksikonScaffold(): Promise<void> {
		const root = this.settings.leksikonRoot;
		if (!root) return;

		await this.renameFolderIfNeeded(
			`${root}/${OLD_INBOX_FOLDER_NAME}`,
			`${root}/${INBOX_FOLDER_NAME}`
		);
		await this.renameFolderIfNeeded(
			`${root}/${OLD_TEMPLATE_FOLDER_NAME}`,
			`${root}/${TEMPLATE_FOLDER_NAME}`
		);

		await this.ensureFolder(`${root}/${INBOX_FOLDER_NAME}`);
		await this.ensureFolder(`${root}/${NOTES_FOLDER_NAME}`);
		await this.ensureFolder(`${root}/${NOTES_FOLDER_NAME}/${ARTICLE_NOTES_FOLDER_NAME}`);

		const templateFolder = `${root}/${TEMPLATE_FOLDER_NAME}`;
		await this.ensureFolder(templateFolder);

		const defaults: [string, string][] = [
			[REDIRECT_TEMPLATE_NAME, DEFAULT_REDIRECT_TEMPLATE],
			[REDIRECT_EMBED_TEMPLATE_NAME, DEFAULT_REDIRECT_EMBED_TEMPLATE],
			[DISAMBIGUERING_TEMPLATE_NAME, DEFAULT_DISAMBIGUERING_TEMPLATE],
			[ARTICLE_TEMPLATE_NAME, DEFAULT_ARTICLE_TEMPLATE],
		];

		for (const [name, content] of defaults) {
			const path = `${templateFolder}/${name}`;
			if (!this.app.vault.getAbstractFileByPath(path)) {
				await this.app.vault.create(path, content);
			}
		}

		await this.applyArticleTemplateToInboxFiles();
	}

	/** Sikrer at alle sider som allerede ligger i innboksen har artikkelmalens
	 * felt, uansett hvordan de havnet der (ikke bare helt nyopprettede sider). */
	private async applyArticleTemplateToInboxFiles(): Promise<void> {
		const root = this.settings.leksikonRoot;
		if (!root) return;

		const inboxFolder = this.app.vault.getAbstractFileByPath(`${root}/${INBOX_FOLDER_NAME}`);
		if (!(inboxFolder instanceof TFolder)) return;

		const files = inboxFolder.children.filter(
			(f): f is TFile => f instanceof TFile && f.extension === "md"
		);
		if (files.length === 0) return;

		const templateFrontmatter = await this.readArticleTemplateFrontmatter();
		const log: string[] = [];

		for (const file of files) {
			const addedKeys = await this.applyArticleTemplateToFile(file, templateFrontmatter);
			if (addedKeys.length > 0) {
				log.push(`Malfelt lagt til: ${file.path} (${addedKeys.join(", ")})`);
			}
		}

		if (log.length > 0) {
			await this.writeLog([...this.newLog("Artikkelmal brukt på innboks-sider"), ...log]);
		}
	}

	private async readTemplate(name: string, fallback: string): Promise<string> {
		const root = this.settings.leksikonRoot;
		if (!root) return fallback;

		const file = this.app.vault.getAbstractFileByPath(
			`${root}/${TEMPLATE_FOLDER_NAME}/${name}`
		);
		return file instanceof TFile ? this.app.vault.cachedRead(file) : fallback;
	}

	private fillTemplate(template: string, values: Record<string, string>): string {
		return Object.entries(values).reduce(
			(text, [key, value]) => text.split(`{{${key}}}`).join(value),
			template
		);
	}

	/** Leser artikkelmalens frontmatter-felt (fra `01 Maler/Artikkel.md`). Faller
	 * tilbake til standardfeltene hvis leksikon-rot ikke er satt eller malfilen
	 * ennå ikke er indeksert. */
	private async readArticleTemplateFrontmatter(): Promise<Record<string, unknown>> {
		const root = this.settings.leksikonRoot;
		if (!root) return DEFAULT_ARTICLE_FRONTMATTER;

		const file = this.app.vault.getAbstractFileByPath(
			`${root}/${TEMPLATE_FOLDER_NAME}/${ARTICLE_TEMPLATE_NAME}`
		);
		if (!(file instanceof TFile)) return DEFAULT_ARTICLE_FRONTMATTER;

		const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
		if (!frontmatter) return DEFAULT_ARTICLE_FRONTMATTER;

		// "position" er Obsidians eget metadata om hvor frontmatter-blokken ligger
		// i filen, ikke et faktisk felt - må filtreres bort før vi kopierer feltene.
		const { position: _position, ...fields } = frontmatter as Record<string, unknown>;
		return fields;
	}

	/** Legger til felt fra malen som mangler på siden. Rører aldri felt som
	 * allerede finnes, selv om verdien er tom. Returnerer hvilke felt som ble
	 * lagt til. */
	private isPlainObject(value: unknown): value is Record<string, unknown> {
		return typeof value === "object" && value !== null && !Array.isArray(value);
	}

	/** Legger til manglende felt fra malen. For nestede objekt-felt (som
	 * `autoritetsdata`) slås det sammen ett nivå ned - manglende underfelt
	 * legges til uten å røre underfelt som allerede finnes. */
	private async applyArticleTemplateToFile(
		file: TFile,
		templateFrontmatter: Record<string, unknown>
	): Promise<string[]> {
		const addedKeys: string[] = [];
		await this.app.fileManager.processFrontMatter(file, (fm) => {
			for (const [key, value] of Object.entries(templateFrontmatter)) {
				if (fm[key] === undefined) {
					fm[key] = value;
					addedKeys.push(key);
				} else if (this.isPlainObject(value) && this.isPlainObject(fm[key])) {
					for (const [subKey, subValue] of Object.entries(value)) {
						if (fm[key][subKey] === undefined) {
							fm[key][subKey] = subValue;
							addedKeys.push(`${key}.${subKey}`);
						}
					}
				}
			}
		});
		return addedKeys;
	}

	private async applyArticleTemplateOnCreate(file: TFile): Promise<void> {
		const templateFrontmatter = await this.readArticleTemplateFrontmatter();
		const addedKeys = await this.applyArticleTemplateToFile(file, templateFrontmatter);
		if (addedKeys.length === 0) return;

		await this.writeLog([
			...this.newLog("Artikkelmal brukt på ny side"),
			`Side: ${file.path}`,
			`Felt lagt til: ${addedKeys.join(", ")}`,
		]);
	}

	async applyArticleTemplateToExisting() {
		const scopedRealFiles = this.app.vault
			.getMarkdownFiles()
			.filter((f) => this.isInScope(f) && !this.isAutoGenerated(f));

		const templateFrontmatter = await this.readArticleTemplateFrontmatter();
		const templateKeys = Object.keys(templateFrontmatter);

		const candidates = scopedRealFiles.filter((f) => {
			const fm = this.app.metadataCache.getFileCache(f)?.frontmatter ?? {};
			return templateKeys.some((key) => fm[key] === undefined);
		});

		if (candidates.length === 0) {
			new Notice("Ordbok: alle sider har allerede alle malfeltene");
			return;
		}

		new ConfirmModal(
			this.app,
			"Bruk artikkelmal på eksisterende sider",
			`Dette legger til manglende felt fra artikkelmalen på ${candidates.length} ` +
				"side(r). Eksisterende felt/verdier endres eller slettes aldri. Fortsette?",
			"Bruk mal",
			() => this.executeApplyArticleTemplateToExisting(candidates, templateFrontmatter)
		).open();
	}

	private async executeApplyArticleTemplateToExisting(
		files: TFile[],
		templateFrontmatter: Record<string, unknown>
	) {
		const log = this.newLog("Bruk artikkelmal på eksisterende sider");
		let updated = 0;

		for (const file of files) {
			const addedKeys = await this.applyArticleTemplateToFile(file, templateFrontmatter);
			if (addedKeys.length > 0) {
				log.push(`Oppdatert: ${file.path} (felt lagt til: ${addedKeys.join(", ")})`);
				updated++;
			}
		}

		new Notice(`Ordbok: ${updated} side(r) fikk manglende malfelt lagt til`);
		await this.writeLog(log);
	}

	openWikidataImport(): void {
		const file = this.app.workspace.getActiveFile();
		if (!file || file.extension !== "md") {
			new Notice("Ordbok: åpne en side å hente autoritetsdata for først");
			return;
		}
		new WikidataImportModal(this.app, this, file).open();
	}

	private formatSeriesId(series: IdSeries, n: number): string {
		return `${series.prefix}${String(n).padStart(series.padding, "0")}`;
	}

	/** Sjekker om en side matcher en ID-seriens mappe/tag. "manual"-serier
	 * matcher aldri automatisk - de må velges eksplisitt. */
	private fileMatchesSeries(file: TFile, series: IdSeries): boolean {
		if (series.matchType === "folder") {
			const folder = series.matchValue.trim().replace(/^\/+|\/+$/g, "");
			if (folder === "") return true;
			const folderPath = this.folderPathOf(file);
			return folderPath === folder || folderPath.startsWith(folder + "/");
		}
		if (series.matchType === "tag") {
			const wanted = series.matchValue.trim().replace(/^#/, "").toLowerCase();
			if (!wanted) return false;
			const cache = this.app.metadataCache.getFileCache(file);
			const tags = (cache ? getAllTags(cache) : null) ?? [];
			return tags.some((t) => t.replace(/^#/, "").toLowerCase() === wanted);
		}
		return false;
	}

	private matchingSeriesForFile(file: TFile): IdSeries[] {
		return this.settings.idSeries.filter(
			(s) => s.matchType !== "manual" && this.fileMatchesSeries(file, s)
		);
	}

	private async writeSeriesId(file: TFile, series: IdSeries, value: string): Promise<void> {
		await this.app.fileManager.processFrontMatter(file, (fm) => {
			fm[series.frontmatterKey] = value;
		});
	}

	/** Genererer et internt ID-nummer for den aktive siden. Hopper over
	 * velgeren når det bare finnes én serie totalt - da er det uansett ikke
	 * noe å velge mellom. */
	generateIdForActiveFile(): void {
		const file = this.app.workspace.getActiveFile();
		if (!file || file.extension !== "md") {
			new Notice("Ordbok: åpne en side å generere ID-nummer for først");
			return;
		}
		if (this.settings.idSeries.length === 0) {
			new Notice(
				"Ordbok: ingen ID-serier er satt opp ennå (Innstillinger → Interne ID-serier)"
			);
			return;
		}
		if (this.settings.idSeries.length === 1) {
			void this.assignIdToActiveFile(file, this.settings.idSeries[0]);
			return;
		}
		const recommended = this.matchingSeriesForFile(file);
		new IdSeriesPickerModal(this.app, this.settings.idSeries, recommended, (series) =>
			void this.assignIdToActiveFile(file, series)
		).open();
	}

	private async assignIdToActiveFile(file: TFile, series: IdSeries): Promise<void> {
		const existing = this.app.metadataCache.getFileCache(file)?.frontmatter?.[
			series.frontmatterKey
		];
		if (existing !== undefined && existing !== null && String(existing).trim() !== "") {
			new Notice(
				`Ordbok: «${series.frontmatterKey}» har allerede en verdi (${existing}) - ikke overskrevet`
			);
			return;
		}

		const value = this.formatSeriesId(series, series.nextNumber);
		await this.writeSeriesId(file, series, value);
		series.nextNumber += 1;
		await this.saveSettings();

		new Notice(`Ordbok: ${series.frontmatterKey} = ${value} (${series.name})`);
		await this.writeLog([
			...this.newLog(`Generer internt ID-nummer (${series.name})`),
			`Side: ${file.path}`,
			`Felt: ${series.frontmatterKey}`,
			`Verdi: ${value}`,
		]);
	}

	/** Åpner serievelgeren for masse-generering. Manuelle serier kan ikke
	 * skanne noe sted automatisk, så de avvises med en forklarende melding. */
	generateIdsForSeriesBulk(): void {
		if (this.settings.idSeries.length === 0) {
			new Notice(
				"Ordbok: ingen ID-serier er satt opp ennå (Innstillinger → Interne ID-serier)"
			);
			return;
		}
		new IdSeriesPickerModal(this.app, this.settings.idSeries, [], (series) =>
			void this.runBulkAssign(series)
		).open();
	}

	private async runBulkAssign(series: IdSeries): Promise<void> {
		if (series.matchType === "manual") {
			new Notice(
				"Ordbok: «manuelt»-serier kan ikke masse-tildeles - sett kilde til mappe eller " +
					"tag på serien, eller bruk «Generer internt ID-nummer» på én side om gangen."
			);
			return;
		}

		const candidates = this.app.vault
			.getMarkdownFiles()
			.filter((f) => !this.isAutoGenerated(f) && this.fileMatchesSeries(f, series))
			.filter((f) => {
				const existing = this.app.metadataCache.getFileCache(f)?.frontmatter?.[
					series.frontmatterKey
				];
				return existing === undefined || existing === null || String(existing).trim() === "";
			})
			.sort((a, b) => a.path.localeCompare(b.path, "no"));

		if (candidates.length === 0) {
			new Notice(`Ordbok: fant ingen sider uten «${series.frontmatterKey}» i denne serien.`);
			return;
		}

		new ConfirmModal(
			this.app,
			"Masse-generer ID-numre",
			`${candidates.length} side(r) vil få et nytt ID-nummer i feltet «${series.frontmatterKey}» ` +
				`(serien «${series.name}»), startende på ${this.formatSeriesId(series, series.nextNumber)}.`,
			"Generer",
			() => void this.applyBulkAssign(series, candidates)
		).open();
	}

	private async applyBulkAssign(series: IdSeries, files: TFile[]): Promise<void> {
		const log = this.newLog(`Masse-generer ID-numre (${series.name})`);
		const assigned: string[] = [];

		for (const file of files) {
			const value = this.formatSeriesId(series, series.nextNumber);
			await this.writeSeriesId(file, series, value);
			series.nextNumber += 1;
			assigned.push(`${value} — ${file.path}`);
			log.push(`${file.path} -> ${series.frontmatterKey}: ${value}`);
		}

		await this.saveSettings();
		new Notice(`Ordbok: ${assigned.length} side(r) fikk nytt ID-nummer (${series.name})`);
		await this.writeLog(log);
		new ListModal(this.app, `ID-numre generert (${series.name})`, "", assigned).open();
	}

	/** Åpner prompt-velgeren (eller går rett på hvis det bare finnes én prompt)
	 * for den aktive siden. Krever Obsidian desktop, siden Claude CLI-en
	 * kjøres som en lokal underprosess. */
	generateClaudeSuggestionForActiveFile(): void {
		if (!Platform.isDesktopApp) {
			new Notice("Ordbok: Claude-integrasjonen krever Obsidian desktop (kjører Claude CLI lokalt)");
			return;
		}
		const file = this.app.workspace.getActiveFile();
		if (!file || file.extension !== "md") {
			new Notice("Ordbok: åpne en side å sende til Claude først");
			return;
		}
		if (this.settings.claudePrompts.length === 0) {
			new Notice("Ordbok: ingen Claude-prompter er satt opp ennå (Innstillinger → Claude-prompter)");
			return;
		}
		const proceed = (prompt: ClaudePrompt) => void this.runClaudePrompt(file, prompt);
		if (this.settings.claudePrompts.length === 1) {
			proceed(this.settings.claudePrompts[0]);
			return;
		}
		new ClaudePromptPickerModal(this.app, this.settings.claudePrompts, proceed).open();
	}

	private async runClaudePrompt(file: TFile, promptDef: ClaudePrompt): Promise<void> {
		const content = await this.app.vault.read(file);
		const instruction = promptDef.prompt.split("{{tittel}}").join(file.basename);
		const responseFormatInstruction = promptDef.expectsFullFileReplacement
			? "Filens fullstendige, nåværende innhold følger som input under (via stdin). " +
			  "Svar KUN med hele den oppdaterte filen, inkludert YAML-frontmatteren mellom " +
			  '"---"-linjene (uendret, med mindre instruksjonen over eksplisitt ber om noe ' +
			  "annet der) - ingen forklaring, ingen kodeblokk-markører (```), ingen tekst før " +
			  "eller etter selve filinnholdet."
			: "Filens fullstendige, nåværende innhold følger som input under (via stdin), kun " +
			  "som kontekst. Ikke returner hele filen - svar direkte med det instruksjonen " +
			  "over ber om (en kort rapport/liste), uten kodeblokk-markører (```) og uten " +
			  "innledende eller avsluttende kommentarer om oppgaven.";
		const fullPrompt = `${instruction}\n\n${responseFormatInstruction}`;

		new Notice(`Ordbok: sender «${file.basename}» til Claude (${promptDef.name}) …`);

		let result: string;
		try {
			result = await this.invokeClaudeCli(fullPrompt, content);
		} catch (e) {
			new Notice(`Ordbok: Claude-kallet feilet – ${e instanceof Error ? e.message : String(e)}`);
			return;
		}

		if (!result.trim()) {
			new Notice("Ordbok: Claude returnerte ingen tekst.");
			return;
		}

		new ClaudeSuggestionModal(
			this.app,
			file,
			promptDef,
			result,
			async (accepted) => {
				if (!accepted) return;
				await this.app.vault.modify(file, result);
				new Notice(`Ordbok: «${file.basename}» oppdatert med Claudes forslag (${promptDef.name})`);
				await this.writeLog([
					...this.newLog(`Claude-forslag brukt (${promptDef.name})`),
					`Side: ${file.path}`,
					`Prompt: ${promptDef.name}`,
				]);
			},
			() => void this.saveClaudeSuggestionAsArticleNote(file, promptDef, result)
		).open();
	}

	/** Mappen artikkelnotater lagres i - under leksikon-roten hvis den er
	 * satt (samme mønster som «02 Notater» ellers brukes i), men fungerer
	 * også uten (rett under vaultroten) siden Claude-forslag ikke er
	 * begrenset til et konfigurert leksikon. */
	private articleNotesFolderPath(): string {
		const root = this.settings.leksikonRoot;
		return root
			? `${root}/${NOTES_FOLDER_NAME}/${ARTICLE_NOTES_FOLDER_NAME}`
			: `${NOTES_FOLDER_NAME}/${ARTICLE_NOTES_FOLDER_NAME}`;
	}

	/** Lagrer Claudes svar som et eget artikkelnotat (i stedet for å erstatte
	 * artikkelen), og lenker til det opprettede notatet fra artikkelens
	 * «notat»-felt - som alltid holdes som en liste, slik at en artikkel kan
	 * samle opp flere notater over tid. */
	private async saveClaudeSuggestionAsArticleNote(
		file: TFile,
		promptDef: ClaudePrompt,
		suggestion: string
	): Promise<void> {
		const folderPath = this.articleNotesFolderPath();
		await this.ensureFolder(folderPath);

		const baseName = this.sanitizeFilename(`${file.basename} - ${promptDef.name}`);
		let notePath = `${folderPath}/${baseName}.md`;
		if (this.app.vault.getAbstractFileByPath(notePath)) {
			notePath = `${folderPath}/${baseName} (${Date.now()}).md`;
		}

		const noteFile = await this.app.vault.create(notePath, suggestion);

		await this.app.fileManager.processFrontMatter(file, (fm) => {
			const existing = fm[NOTAT_KEY];
			const list: string[] = Array.isArray(existing)
				? existing.slice()
				: existing !== undefined && existing !== null && existing !== ""
				  ? [String(existing)]
				  : [];
			const link = `[[${noteFile.basename}]]`;
			if (!list.includes(link)) list.push(link);
			fm[NOTAT_KEY] = list;
		});

		new Notice(`Ordbok: Claude-forslag lagret som artikkelnotat (${noteFile.path})`);
		await this.writeLog([
			...this.newLog(`Claude-forslag lagret som artikkelnotat (${promptDef.name})`),
			`Side: ${file.path}`,
			`Notat: ${noteFile.path}`,
		]);
	}

	/** Kjører Claude CLI som en lokal underprosess (`<cli> -p "<prompt>" --output-format text`),
	 * med sideinnholdet sendt via stdin. Kun tilgjengelig på desktop, siden det
	 * krever Node sitt `child_process`-API.
	 *
	 * På Windows er npm-installerte CLI-er ofte en ".cmd"-fil, som `spawn(...,
	 * {shell:false})` kan feile å finne selv om kommandoen fungerer fint i en
	 * vanlig terminal. Hvis første forsøk feiler med ENOENT på Windows og
	 * kommandoen ikke allerede har en filendelse, prøves ".cmd" automatisk. */
	private invokeClaudeCli(promptText: string, stdinContent: string): Promise<string> {
		type ChildProcessModule = typeof import("child_process");
		let cp: ChildProcessModule;
		try {
			cp = require("child_process") as ChildProcessModule;
		} catch (e) {
			return Promise.reject(
				new Error(`Fant ikke Node sitt child_process-API: ${e instanceof Error ? e.message : String(e)}`)
			);
		}

		const cwd = this.getVaultBasePath();

		const attempt = (cliPath: string): Promise<string> =>
			new Promise((resolve, reject) => {
				let child: ReturnType<ChildProcessModule["spawn"]>;
				try {
					child = cp.spawn(cliPath, ["-p", promptText, "--output-format", "text"], {
						shell: false,
						cwd: cwd ?? undefined,
					});
				} catch (e) {
					reject(e instanceof Error ? e : new Error(String(e)));
					return;
				}

				let stdout = "";
				let stderr = "";
				let settled = false;

				const timeoutMs = Math.max(1, this.settings.claudeCliTimeoutSeconds) * 1000;
				const timer = setTimeout(() => {
					if (settled) return;
					settled = true;
					child.kill();
					reject(
						new Error(
							`Claude CLI svarte ikke innen ${this.settings.claudeCliTimeoutSeconds} sekunder (tidsavbrudd)`
						)
					);
				}, timeoutMs);

				child.stdout?.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
				child.stderr?.on("data", (chunk: Buffer) => (stderr += chunk.toString()));

				child.on("error", (err) => {
					if (settled) return;
					settled = true;
					clearTimeout(timer);
					reject(err);
				});

				child.on("close", (code) => {
					if (settled) return;
					settled = true;
					clearTimeout(timer);
					if (code !== 0) {
						// Claude CLI skriver ofte feilmeldinger (f.eks. "Not logged in") til
						// stdout, ikke stderr - begge må derfor tas med her.
						const output = [stdout.trim(), stderr.trim()].filter(Boolean).join(" | ");
						reject(
							new Error(
								`Claude CLI avsluttet med feilkode ${code}${output ? `: ${output}` : " (ingen utdata)"}`
							)
						);
						return;
					}
					resolve(stdout);
				});

				child.stdin?.write(stdinContent);
				child.stdin?.end();
			});

		const cliPath = this.settings.claudeCliPath.trim() || "claude";
		return attempt(cliPath).catch((err: NodeJS.ErrnoException) => {
			const canRetryAsCmd =
				process.platform === "win32" && err.code === "ENOENT" && !/\.[a-z]+$/i.test(cliPath);
			if (canRetryAsCmd) return attempt(`${cliPath}.cmd`);

			if (err.code === "ENOENT") {
				throw new Error(
					`Fant ikke Claude CLI på «${cliPath}». Sjekk at CLI-en er installert og i ` +
						"PATH, eller sett en full sti (inkl. filendelse) i innstillingene."
				);
			}
			throw new Error(err.message);
		});
	}

	/** Vaultens rotmappe på disk, eller null hvis dette ikke er et lokalt
	 * filsystem-hvelv (bør ikke skje på desktop, men FileSystemAdapter er ikke
	 * garantert av typene). Brukes som arbeidsmappe for Claude CLI-kall. */
	private getVaultBasePath(): string | null {
		const adapter = this.app.vault.adapter;
		return adapter instanceof FileSystemAdapter ? adapter.getBasePath() : null;
	}

	/** Kjører et minimalt, ufarlig kall mot Claude CLI og viser hele det rå
	 * svaret (eller den fulle feilmeldingen) i et vindu - til feilsøking av
	 * CLI-sti/innlogging, uten å røre noen side. */
	async testClaudeCliConnection(): Promise<void> {
		if (!Platform.isDesktopApp) {
			new Notice("Ordbok: Claude-integrasjonen krever Obsidian desktop");
			return;
		}
		new Notice("Ordbok: tester Claude CLI …");
		try {
			const result = await this.invokeClaudeCli("Svar med kun ordet OK, ingenting annet.", "");
			new ListModal(
				this.app,
				"Claude CLI-test: OK",
				"Tilkoblingen fungerer. Rått svar fra CLI-en:",
				[result.trim() || "(tomt svar)"]
			).open();
		} catch (e) {
			new ListModal(
				this.app,
				"Claude CLI-test feilet",
				"Full feilmelding:",
				[e instanceof Error ? e.message : String(e)]
			).open();
		}
	}

	async searchWikidata(query: string): Promise<WikidataSearchResult[]> {
		const url =
			`${WIKIDATA_API}?action=wbsearchentities&search=${encodeURIComponent(query)}` +
			"&language=nb&uselang=nb&type=item&limit=10&format=json&origin=*";

		const response = await requestUrl({ url });
		const results: unknown = response.json?.search ?? [];

		return (Array.isArray(results) ? results : []).map((r) => {
			const entry = r as { id: string; label?: string; description?: string };
			return {
				id: entry.id,
				label: entry.label ?? entry.id,
				description: entry.description ?? "",
			};
		});
	}

	getActiveWikidataPreset(): WikidataFieldPreset {
		const active = this.settings.wikidataPresets.find(
			(p) => p.id === this.settings.activeWikidataPresetId
		);
		return active ?? this.settings.wikidataPresets[0];
	}

	getWikidataDefaultFieldIds(): Set<string> {
		return new Set(this.getActiveWikidataPreset()?.fields ?? []);
	}

	/** Slår opp visningsnavnet for ett standardfelt (Pxxx eller "wikipedia").
	 * Foretrekk `resolveWikidataFieldLabels` (batchet) når du slår opp flere
	 * felt samtidig - denne gjør ett separat API-kall per felt. */
	async resolveWikidataFieldLabel(id: string): Promise<string> {
		const result = await this.resolveWikidataFieldLabels([id]);
		return result[id] ?? id;
	}

	/** Slår opp visningsnavn for flere felt i ett batchet kall (maks 50 om
	 * gangen), med cache - unngår at hver rad i en liste feuer sitt eget
	 * separate API-kall (som fort feiler/rate-limiteres ved mange rader). */
	async resolveWikidataFieldLabels(ids: string[]): Promise<Record<string, string>> {
		const result: Record<string, string> = {};
		const toFetch: string[] = [];

		for (const id of ids) {
			if (id === "wikipedia") {
				result[id] = "Wikipedia";
				continue;
			}
			if (id === "description") {
				result[id] = "Beskrivelse";
				continue;
			}
			if (id === "alias") {
				result[id] = "Alias";
				continue;
			}
			if (id.startsWith("translation:")) {
				result[id] = `Oversettelse (${id.slice("translation:".length)})`;
				continue;
			}
			const known = WIKIDATA_KNOWN_FIELDS.find((f) => f.prop === id);
			if (known) {
				result[id] = known.label;
				continue;
			}
			const cached = this.wikidataLabelCache.get(id);
			if (cached !== undefined) {
				result[id] = cached;
				continue;
			}
			toFetch.push(id);
		}

		for (let i = 0; i < toFetch.length; i += 50) {
			const chunk = toFetch.slice(i, i + 50);
			if (chunk.length === 0) continue;
			try {
				const url =
					`${WIKIDATA_API}?action=wbgetentities&ids=${chunk.join("|")}` +
					"&props=labels&languages=nb|en&format=json&origin=*";
				const response = await requestUrl({ url });
				const entities = response.json?.entities ?? {};
				for (const id of chunk) {
					const label = entities[id]?.labels?.nb?.value ?? entities[id]?.labels?.en?.value ?? id;
					this.wikidataLabelCache.set(id, label);
					result[id] = label;
				}
			} catch {
				for (const id of chunk) result[id] = id;
			}
		}

		return result;
	}

	/** Tolker en enkelt Wikidata-datavalue til en visnings-/lagringsstreng.
	 * Håndterer de vanligste datatypene (streng, entitetsreferanse, tid,
	 * mengde, enspråklig tekst) - ukjente typer hoppes over. */
	private extractDatavalue(datavalue: unknown): string | null {
		if (!datavalue || typeof datavalue !== "object") return null;
		const dv = datavalue as { type?: string; value?: unknown };
		const value = dv.value;

		if (dv.type === "string" && typeof value === "string") return value;
		if (dv.type === "wikibase-entityid" && this.isPlainObject(value)) {
			return typeof value.id === "string" ? value.id : null;
		}
		if (dv.type === "time" && this.isPlainObject(value) && typeof value.time === "string") {
			return value.time.replace(/^\+/, "").split("T")[0];
		}
		if (
			dv.type === "quantity" &&
			this.isPlainObject(value) &&
			typeof value.amount === "string"
		) {
			return value.amount.replace(/^\+/, "");
		}
		if (
			dv.type === "monolingualtext" &&
			this.isPlainObject(value) &&
			typeof value.text === "string"
		) {
			return value.text;
		}
		if (typeof value === "string") return value;
		return null;
	}

	/** Er entitetsreferansen selve datavaluen (ikke en streng/tid/mengde)?
	 * Returnerer referert QID, eller null hvis dette ikke er en entitetsreferanse. */
	private extractEntityId(datavalue: unknown): string | null {
		if (!datavalue || typeof datavalue !== "object") return null;
		const dv = datavalue as { type?: string; value?: unknown };
		if (dv.type !== "wikibase-entityid" || !this.isPlainObject(dv.value)) return null;
		return typeof dv.value.id === "string" ? dv.value.id : null;
	}

	/** Henter etikett + "formatter URL" (P1630, brukt til å bygge eksterne
	 * lenker på samme måte som Wikidata selv gjør) for et sett properties. */
	private async fetchPropertyMeta(
		propertyIds: string[]
	): Promise<Record<string, { label: string; formatterUrl: string | null }>> {
		const meta: Record<string, { label: string; formatterUrl: string | null }> = {};
		for (let i = 0; i < propertyIds.length; i += 50) {
			const chunk = propertyIds.slice(i, i + 50);
			if (chunk.length === 0) continue;
			const url =
				`${WIKIDATA_API}?action=wbgetentities&ids=${chunk.join("|")}` +
				`&props=labels|claims&languages=nb|en&format=json&origin=*`;
			const response = await requestUrl({ url });
			const entities = response.json?.entities ?? {};
			for (const pid of chunk) {
				const ent = entities[pid];
				const label = ent?.labels?.nb?.value ?? ent?.labels?.en?.value ?? pid;
				const formatterClaims: unknown[] = ent?.claims?.[WIKIDATA_FORMATTER_URL_PROP] ?? [];
				let formatterUrl: string | null = null;
				for (const claim of formatterClaims) {
					const value = this.extractDatavalue(
						(claim as { mainsnak?: { datavalue?: unknown } })?.mainsnak?.datavalue
					);
					if (value) {
						formatterUrl = value;
						break;
					}
				}
				meta[pid] = { label, formatterUrl };
			}
		}
		return meta;
	}

	private async fetchItemLabels(qids: string[]): Promise<Record<string, string>> {
		const labels: Record<string, string> = {};
		for (let i = 0; i < qids.length; i += 50) {
			const chunk = qids.slice(i, i + 50);
			if (chunk.length === 0) continue;
			const url =
				`${WIKIDATA_API}?action=wbgetentities&ids=${chunk.join("|")}` +
				"&props=labels&languages=nb|en&format=json&origin=*";
			const response = await requestUrl({ url });
			const entities = response.json?.entities ?? {};
			for (const id of chunk) {
				labels[id] = entities[id]?.labels?.nb?.value ?? entities[id]?.labels?.en?.value ?? id;
			}
		}
		return labels;
	}

	/** Løser alle claims for én property til {display, stored}-par. Entitets-
	 * referanser lenkes til Wikidata-siden for målet (med etikett i visningen).
	 * Eksterne ID-er lenkes via propertyens egen formatter-URL når den finnes,
	 * ellers en eventuell fallback, ellers vises verdien uten lenke. */
	/** Formaterer en verdi + lenke som "[verdi](lenke)" - samme mønster som
	 * Wikidatas egen visning, brukt konsekvent for alle lenkede felt. */
	private markdownLink(value: string, url: string): string {
		return `[${value}](${url})`;
	}

	private resolveClaimValues(
		claims: unknown,
		formatterUrl: string | null,
		fallbackFormat: ((value: string) => string) | null,
		itemLabels: Record<string, string>
	): { display: string; stored: string }[] {
		if (!Array.isArray(claims)) return [];
		const results: { display: string; stored: string }[] = [];

		for (const claim of claims) {
			const datavalue = (claim as { mainsnak?: { datavalue?: unknown } })?.mainsnak
				?.datavalue;

			const entityId = this.extractEntityId(datavalue);
			if (entityId) {
				const label = itemLabels[entityId] ?? entityId;
				const linkText = label === entityId ? entityId : `${label} (${entityId})`;
				results.push({
					display: `${label} (${entityId})`,
					stored: this.markdownLink(
						linkText,
						`https://www.wikidata.org/wiki/${entityId}`
					),
				});
				continue;
			}

			const raw = this.extractDatavalue(datavalue);
			if (raw === null) continue;

			const link = formatterUrl
				? formatterUrl.replace("$1", encodeURIComponent(raw))
				: fallbackFormat
				  ? fallbackFormat(raw)
				  : null;
			results.push({ display: raw, stored: link ? this.markdownLink(raw, link) : raw });
		}

		return results;
	}

	/** Henter ALLE felt Wikidata har for entiteten - de fem kjente
	 * autoritetsfeltene (Wikipedia, SNL, BIBSYS/NORAF, VIAF, Dewey) først,
	 * så alle andre egenskaper entiteten har, med resolvte etiketter. */
	async buildWikidataFieldRows(qid: string): Promise<WikidataFieldRow[]> {
		const languages = new Set<string>(["nb", "en"]);
		if (this.settings.wikidataImportDescription) {
			for (const l of parseLangCodes(this.settings.wikidataDescriptionLanguages)) languages.add(l);
		}
		if (this.settings.wikidataImportAlias) {
			for (const l of parseLangCodes(this.settings.wikidataAliasLanguages)) languages.add(l);
		}
		if (this.settings.wikidataImportTranslations) {
			for (const l of parseLangCodes(this.settings.wikidataTranslationLanguages)) languages.add(l);
		}

		const props = ["claims", "sitelinks", "labels"];
		if (this.settings.wikidataImportDescription) props.push("descriptions");
		if (this.settings.wikidataImportAlias) props.push("aliases");

		const url =
			`${WIKIDATA_API}?action=wbgetentities&ids=${encodeURIComponent(qid)}` +
			`&props=${props.join("|")}&languages=${[...languages].join("|")}&format=json&origin=*`;

		const response = await requestUrl({ url });
		const entity = response.json?.entities?.[qid];
		if (!entity) throw new Error(`Fant ikke entiteten ${qid} på Wikidata`);

		const rows: WikidataFieldRow[] = [];
		const claims: Record<string, unknown[]> = entity.claims ?? {};

		const sitelinks = entity.sitelinks ?? {};
		const wikipediaSite = sitelinks.nbwiki ?? sitelinks.nowiki ?? sitelinks.enwiki;
		if (wikipediaSite) {
			const lang = sitelinks.nbwiki || sitelinks.nowiki ? "no" : "en";
			const wpTitle = String(wikipediaSite.title);
			const wpUrl = `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(
				wpTitle.replace(/ /g, "_")
			)}`;
			rows.push({
				id: "wikipedia",
				label: "Wikipedia",
				values: [wpUrl],
				storedValues: [this.markdownLink(wpTitle, wpUrl)],
				knownKey: "wikipedia",
			});
		}

		if (this.settings.wikidataImportDescription) {
			const descriptions = entity.descriptions ?? {};
			for (const lang of parseLangCodes(this.settings.wikidataDescriptionLanguages)) {
				const desc = descriptions[lang]?.value;
				if (typeof desc === "string" && desc.length > 0) {
					rows.push({
						id: "description",
						label: "Beskrivelse",
						values: [desc],
						storedValues: [desc],
						knownKey: null,
					});
					break;
				}
			}
		}

		if (this.settings.wikidataImportAlias) {
			const aliases = entity.aliases ?? {};
			for (const lang of parseLangCodes(this.settings.wikidataAliasLanguages)) {
				const entries: unknown[] = aliases[lang] ?? [];
				const values = entries
					.map((a) => (this.isPlainObject(a) && typeof a.value === "string" ? a.value : null))
					.filter((v): v is string => v !== null);
				if (values.length > 0) {
					rows.push({
						id: "alias",
						label: "Alias",
						values,
						storedValues: values,
						knownKey: null,
					});
					break;
				}
			}
		}

		if (this.settings.wikidataImportTranslations) {
			const labels = entity.labels ?? {};
			for (const lang of parseLangCodes(this.settings.wikidataTranslationLanguages)) {
				const label = labels[lang]?.value;
				if (typeof label === "string" && label.length > 0) {
					rows.push({
						id: `translation:${lang}`,
						label: `Oversettelse (${lang})`,
						values: [label],
						storedValues: [label],
						knownKey: null,
					});
				}
			}
		}

		// Referanserte entiteter (fra "wikibase-entityid"-claims) på tvers av alle
		// properties - løses samlet i ett kall så de får ekte etiketter i visningen.
		const referencedQids = new Set<string>();
		for (const propId of Object.keys(claims)) {
			for (const claim of claims[propId] ?? []) {
				const entityId = this.extractEntityId(
					(claim as { mainsnak?: { datavalue?: unknown } })?.mainsnak?.datavalue
				);
				if (entityId) referencedQids.add(entityId);
			}
		}
		const itemLabels = await this.fetchItemLabels([...referencedQids]);

		const allPropIds = Object.keys(claims);
		const propMeta = await this.fetchPropertyMeta(allPropIds);

		const knownByProp = new Map(WIKIDATA_KNOWN_FIELDS.map((f) => [f.prop, f]));

		for (const propId of allPropIds) {
			const known = knownByProp.get(propId);
			const meta = propMeta[propId];
			const label = known?.label ?? meta?.label ?? propId;

			const fallbackFormat: ((value: string) => string) | null =
				known?.knownKey === "dewey"
					? (v) =>
							(
								this.settings.deweyFallbackUrlTemplate.trim() ||
								DEFAULT_SETTINGS.deweyFallbackUrlTemplate
							).replace("$1", encodeURIComponent(v))
					: known?.fallbackFormat ?? null;

			const resolved = this.resolveClaimValues(
				claims[propId],
				known?.forceFallback ? null : meta?.formatterUrl ?? null,
				fallbackFormat,
				itemLabels
			);
			if (resolved.length === 0) continue;

			rows.push({
				id: propId,
				label: `${label} (${propId})`,
				values: resolved.map((r) => r.display),
				storedValues: resolved.map((r) => r.stored),
				knownKey: known?.knownKey ?? null,
			});
		}

		rows.sort((a, b) => {
			const rank = (r: WikidataFieldRow) => (r.knownKey ? 0 : 1);
			return rank(a) - rank(b) || a.label.localeCompare(b.label, "no");
		});

		return rows;
	}

	/** Skriver de avkryssede feltene inn under `autoritetsdata` i sidens
	 * frontmatter, i rekkefølgen gitt av `orderedIds` (bestemmer YAML-
	 * feltrekkefølgen). Overskriver eksisterende verdier for feltene, siden
	 * dette er en bevisst, manuelt initiert import. Kjente felt (Wikipedia/
	 * SNL/BIBSYS/VIAF/Dewey) som IKKE ble importert nå - fordi de ble
	 * avhaket, eller fordi Wikidata ikke har noen verdi for dem - fjernes fra
	 * siden fremfor å stå igjen som tomme.
	 *
	 * Beskrivelse skrives til det øverste `beskrivelse`-feltet (ikke nestet
	 * under autoritetsdata), og oversettelser samles i sitt eget nestede felt
	 * `Oversettelser` (nøkkel = språkkode) - begge ryddes på samme måte som de
	 * kjente autoritetsdata-feltene når de avhakes/mangler.
	 *
	 * `aliasClassification` (fra alias-triage-vinduet) føyes i stedet til de
	 * eksisterende `forkortelser`/`aliases`-listene - disse feltene brukes
	 * andre steder i hvelvet og skal ikke overskrives slik autoritetsdata gjør. */
	async applyWikidataImport(
		file: TFile,
		qid: string,
		rows: WikidataFieldRow[],
		orderedIds: string[],
		aliasClassification?: { forkortelser: string[]; aliases: string[] }
	): Promise<string[]> {
		const applied: string[] = ["Wikidata-ID"];
		const knownKeysWritten = new Set<string>();
		const translationLangsWritten = new Set<string>();
		let descriptionWritten = false;
		const rowById = new Map(rows.map((r) => [r.id, r]));

		await this.app.fileManager.processFrontMatter(file, (fm) => {
			if (!this.isPlainObject(fm.autoritetsdata)) fm.autoritetsdata = {};
			fm.autoritetsdata.wikidata = this.markdownLink(
				qid,
				`https://www.wikidata.org/wiki/${qid}`
			);

			for (const id of orderedIds) {
				const row = rowById.get(id);
				if (!row) continue;
				const value: string | string[] =
					row.storedValues.length === 1 ? row.storedValues[0] : row.storedValues;

				if (id === "description") {
					fm.beskrivelse = value;
					descriptionWritten = true;
					applied.push(row.label);
					continue;
				}

				if (id.startsWith("translation:")) {
					const lang = id.slice("translation:".length);
					if (!this.isPlainObject(fm.Oversettelser)) fm.Oversettelser = {};
					fm.Oversettelser[lang] = value;
					translationLangsWritten.add(lang);
					applied.push(row.label);
					continue;
				}

				if (row.knownKey) {
					fm.autoritetsdata[row.knownKey] = value;
					knownKeysWritten.add(row.knownKey);
				} else {
					fm.autoritetsdata[row.label] = value;
				}
				applied.push(row.label);
			}

			for (const key of ["wikipedia", "snl", "bibsys", "viaf", "dewey"] as const) {
				if (!knownKeysWritten.has(key)) delete fm.autoritetsdata[key];
			}

			if (!descriptionWritten) delete fm.beskrivelse;

			const candidateTranslationLangs = rows
				.filter((r) => r.id.startsWith("translation:"))
				.map((r) => r.id.slice("translation:".length));
			if (this.isPlainObject(fm.Oversettelser)) {
				for (const lang of candidateTranslationLangs) {
					if (!translationLangsWritten.has(lang)) delete fm.Oversettelser[lang];
				}
				if (Object.keys(fm.Oversettelser).length === 0) delete fm.Oversettelser;
			}

			if (aliasClassification) {
				if (aliasClassification.forkortelser.length > 0) {
					const existing = this.readForkortelser(fm);
					fm[FORKORTELSER_KEY] = [
						...new Set([...existing, ...aliasClassification.forkortelser]),
					];
					applied.push(`Alias → forkortelser (${aliasClassification.forkortelser.length})`);
				}
				if (aliasClassification.aliases.length > 0) {
					const existing = parseFrontMatterAliases(fm) ?? [];
					fm.aliases = [...new Set([...existing, ...aliasClassification.aliases])];
					applied.push(`Alias → aliases (${aliasClassification.aliases.length})`);
				}
			}
		});

		await this.writeLog([
			...this.newLog("Hent autoritetsdata fra Wikidata"),
			`Side: ${file.path}`,
			`Wikidata-entitet: ${qid}`,
			`Felt hentet: ${applied.join(", ")}`,
		]);

		return applied;
	}

	private async redirectContent(target: TFile): Promise<string> {
		const template = await this.readTemplate(
			this.settings.embedArticleInRedirect
				? REDIRECT_EMBED_TEMPLATE_NAME
				: REDIRECT_TEMPLATE_NAME,
			this.settings.embedArticleInRedirect
				? DEFAULT_REDIRECT_EMBED_TEMPLATE
				: DEFAULT_REDIRECT_TEMPLATE
		);

		return this.fillTemplate(template, { artikkel: target.basename });
	}

	private async pekersideContent(alias: string, targets: TFile[]): Promise<string> {
		const sortedTargets = [...targets].sort((a, b) =>
			a.path.localeCompare(b.path)
		);

		const frontmatterList = sortedTargets
			.map((t) => `  - "[[${t.basename}]]"`)
			.join("\n");

		const bulletLines: string[] = [];
		for (const target of sortedTargets) {
			const excerpt = await this.excerptFor(target);
			bulletLines.push(
				excerpt
					? `- [[${target.basename}]] — ${excerpt}`
					: `- [[${target.basename}]]`
			);
		}
		const listBlock = bulletLines.map((l) => `> ${l}`).join("\n");

		const template = await this.readTemplate(
			DISAMBIGUERING_TEMPLATE_NAME,
			DEFAULT_DISAMBIGUERING_TEMPLATE
		);

		return this.fillTemplate(template, {
			alias,
			"peker-til-liste": frontmatterList,
			liste: listBlock,
		});
	}

	private indexContent(letter: string, articles: TFile[]): string {
		const sorted = [...articles].sort((a, b) =>
			a.basename.localeCompare(b.basename, "no")
		);

		return [
			"---",
			`${AUTO_GENERATED_KEY}: true`,
			`cssclass: ${REDIRECT_CSSCLASS}`,
			`${INDEX_FOR_KEY}: ${letter}`,
			"---",
			"",
			`# ${letter}`,
			"",
			...sorted.map((f) => `- [[${f.basename}]]`),
			"",
		].join("\n");
	}

	private buildRegeneratePlan(): RegeneratePlanItem[] {
		const scopedRealFiles = this.app.vault
			.getMarkdownFiles()
			.filter((f) => this.isInScope(f) && !this.isAutoGenerated(f));

		const aliasEntries = this.collectAliasEntries(scopedRealFiles);

		const items: RegeneratePlanItem[] = [];
		for (const { alias, files } of aliasEntries.values()) {
			const isPekerside = files.length > 1;

			const leksikonMode =
				this.settings.leksikonRoot.length > 0 &&
				files.every((f) => this.folderUnderLeksikonRoot(f));

			let folderPath: string;
			if (leksikonMode) {
				folderPath = `${this.settings.leksikonRoot}/${this.letterFor(alias)}`;
			} else if (isPekerside) {
				const folder = this.commonFolder(files);
				folderPath = folder.path === "/" ? "" : folder.path;
			} else {
				folderPath = files[0].parent && files[0].parent.path !== "/"
					? files[0].parent.path
					: "";
			}

			const filename = this.sanitizeFilename(alias);
			if (!filename) continue;

			const path = folderPath === "" ? `${filename}.md` : `${folderPath}/${filename}.md`;

			const existing = this.app.vault.getAbstractFileByPath(path);
			const existingFile = existing instanceof TFile ? existing : null;
			const conflict = existingFile !== null && !this.isAutoGenerated(existingFile);

			items.push({
				kind: isPekerside ? "pekerside" : "redirect",
				alias,
				files,
				path,
				existing: existingFile,
				conflict,
			});
		}

		items.push(...this.buildIndexItems());

		return items;
	}

	private buildIndexItems(): RegeneratePlanItem[] {
		const root = this.settings.leksikonRoot;
		if (!root) return [];

		const rootFolder = this.app.vault.getAbstractFileByPath(root);
		if (!(rootFolder instanceof TFolder)) return [];

		const items: RegeneratePlanItem[] = [];
		for (const child of rootFolder.children) {
			if (!(child instanceof TFolder)) continue;
			if (child.name === INBOX_FOLDER_NAME || child.name === TEMPLATE_FOLDER_NAME || child.name === NOTES_FOLDER_NAME) continue;

			const realFiles = child.children.filter(
				(f): f is TFile =>
					f instanceof TFile && f.extension === "md" && !this.isAutoGenerated(f)
			);
			if (realFiles.length === 0) continue;

			// "00 "-prefiks sikrer at indekssiden sorterer øverst i mappen.
			const path = `${child.path}/00 ${INDEX_FILENAME}.md`;

			const existing = this.app.vault.getAbstractFileByPath(path);
			const existingFile = existing instanceof TFile ? existing : null;
			const conflict = existingFile !== null && !this.isAutoGenerated(existingFile);

			items.push({
				kind: "index",
				alias: child.name,
				files: realFiles,
				path,
				existing: existingFile,
				conflict,
			});
		}

		return items;
	}

	private isIndexPage(file: TFile): boolean {
		const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
		return frontmatter?.[AUTO_GENERATED_KEY] === true && frontmatter?.[INDEX_FOR_KEY] !== undefined;
	}

	private previewRegenerate(
		items: RegeneratePlanItem[],
		cleanupPredicate: (f: TFile) => boolean = (f) => this.isAutoGenerated(f)
	) {
		let newCount = 0;
		let modifyCount = 0;
		let conflictCount = 0;
		const keptPaths = new Set<string>();

		for (const item of items) {
			if (item.conflict) {
				conflictCount++;
				continue;
			}
			keptPaths.add(item.path);
			if (item.existing) modifyCount++;
			else newCount++;
		}

		const deleteCount = this.app.vault
			.getMarkdownFiles()
			.filter(
				(f) => this.isInScope(f) && cleanupPredicate(f) && !keptPaths.has(f.path)
			).length;

		return { newCount, modifyCount, deleteCount, conflictCount };
	}

	regenerate() {
		const items = this.buildRegeneratePlan();
		const preview = this.previewRegenerate(items);

		const total =
			preview.newCount + preview.modifyCount + preview.deleteCount + preview.conflictCount;
		if (total === 0) {
			new Notice("Ordbok: ingen endringer å gjøre");
			return;
		}

		const parts = [
			preview.newCount > 0 ? `${preview.newCount} ny(e)` : null,
			preview.modifyCount > 0 ? `${preview.modifyCount} oppdatert(e)` : null,
			preview.deleteCount > 0 ? `${preview.deleteCount} slettet(e)` : null,
			preview.conflictCount > 0
				? `${preview.conflictCount} kollisjon(er) hoppet over`
				: null,
		]
			.filter(Boolean)
			.join(", ");

		new ConfirmModal(
			this.app,
			"Regenerer peker- og redirect-sider",
			`Dette vil gi: ${parts}. Fortsette?`,
			"Regenerer",
			async () => {
				const log = this.newLog("Regenerer peker- og redirect-sider");
				log.push(...(await this.executeRegenerate(items)));
				await this.writeLog(log);
			}
		).open();
	}

	regenerateIndexes() {
		const items = this.buildIndexItems();
		const preview = this.previewRegenerate(items, (f) => this.isIndexPage(f));

		const total =
			preview.newCount + preview.modifyCount + preview.deleteCount + preview.conflictCount;
		if (total === 0) {
			new Notice("Ordbok: ingen indekssider å oppdatere");
			return;
		}

		const parts = [
			preview.newCount > 0 ? `${preview.newCount} ny(e)` : null,
			preview.modifyCount > 0 ? `${preview.modifyCount} oppdatert(e)` : null,
			preview.deleteCount > 0 ? `${preview.deleteCount} slettet(e)` : null,
			preview.conflictCount > 0
				? `${preview.conflictCount} kollisjon(er) hoppet over`
				: null,
		]
			.filter(Boolean)
			.join(", ");

		new ConfirmModal(
			this.app,
			"Regenerer indekssider",
			`Dette vil gi: ${parts}. Fortsette?`,
			"Regenerer",
			async () => {
				const log = this.newLog("Regenerer indekssider");
				log.push(...(await this.executeRegenerate(items, (f) => this.isIndexPage(f))));
				await this.writeLog(log);
			}
		).open();
	}

	/** Utfører en regenereringsplan og returnerer loggen over hva som ble gjort,
	 * slik at kallere kan skrive den alene eller som del av en større logg. */
	private async executeRegenerate(
		items: RegeneratePlanItem[],
		cleanupPredicate: (f: TFile) => boolean = (f) => this.isAutoGenerated(f)
	): Promise<string[]> {
		await this.ensureLeksikonScaffold();

		const log: string[] = [];
		const writtenPaths = new Set<string>();
		let redirectsWritten = 0;
		let pekersiderWritten = 0;
		let indexesWritten = 0;
		const conflicts: string[] = [];

		for (const item of items) {
			if (item.conflict) {
				conflicts.push(item.path);
				log.push(`Kollisjon (ikke-generert fil i veien, hoppet over): ${item.path}`);
				continue;
			}

			const content =
				item.kind === "pekerside"
					? await this.pekersideContent(item.alias, item.files)
					: item.kind === "index"
					  ? this.indexContent(item.alias, item.files)
					  : await this.redirectContent(item.files[0]);

			if (item.existing) {
				await this.app.vault.modify(item.existing, content);
				log.push(`Oppdatert (${item.kind}): ${item.path}`);
			} else {
				const lastSlash = item.path.lastIndexOf("/");
				if (lastSlash > 0) await this.ensureFolder(item.path.slice(0, lastSlash));
				await this.app.vault.create(item.path, content);
				log.push(`Opprettet (${item.kind}): ${item.path}`);
			}

			writtenPaths.add(item.path);
			if (item.kind === "pekerside") pekersiderWritten++;
			else if (item.kind === "index") indexesWritten++;
			else redirectsWritten++;
		}

		let cleanedUp = 0;
		for (const file of this.app.vault.getMarkdownFiles()) {
			if (!this.isInScope(file)) continue;
			if (!cleanupPredicate(file)) continue;
			if (writtenPaths.has(file.path)) continue;
			log.push(`Ryddet opp (foreldreløs): ${file.path}`);
			await this.app.vault.delete(file);
			cleanedUp++;
		}

		const summary = [
			redirectsWritten > 0 ? `${redirectsWritten} redirect-side(r)` : null,
			pekersiderWritten > 0 ? `${pekersiderWritten} pekerside(r)` : null,
			indexesWritten > 0 ? `${indexesWritten} indeksside(r)` : null,
			cleanedUp > 0 ? `${cleanedUp} ryddet opp` : null,
			conflicts.length > 0 ? `${conflicts.length} kollisjon(er) hoppet over` : null,
		]
			.filter(Boolean)
			.join(", ");

		new Notice(`Ordbok: ${summary}`);

		if (conflicts.length > 0) {
			console.warn(
				"Ordbok pekersider: hoppet over pga. eksisterende, ikke-genererte filer:",
				conflicts
			);
		}

		return log;
	}
}

class OrdbokSettingTab extends PluginSettingTab {
	plugin: OrdbokPekersiderPlugin;
	private editingWikidataPresetId: string | null = null;

	constructor(app: App, plugin: OrdbokPekersiderPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "Ordbok" });

		new Setting(containerEl)
			.setName("Case-sensitive forkortelser")
			.setDesc(
				"Når på, behandles f.eks. «Adm.dir.» og «adm. dir.» som to ulike " +
					"forkortelser med hver sin side. Når av (standard), slås " +
					"skrivemåter som bare skiller seg i store/små bokstaver og/eller " +
					"mellomrom sammen til én side."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.caseSensitiveAliases)
					.onChange(async (value) => {
						this.plugin.settings.caseSensitiveAliases = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Bygg inn artikkelen på redirect-sider")
			.setDesc(
				"Når på, viser redirect-siden for en forkortelse selve artikkelen " +
					"som en innebygd kopi (med en callout øverst som forklarer at " +
					"det er en innebygd kopi og lenker til hovedartikkelen), i " +
					"stedet for bare en lenke. Gjelder ikke disambiguerings-sider " +
					"(der forkortelsen finnes på flere artikler)."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.embedArticleInRedirect)
					.onChange(async (value) => {
						this.plugin.settings.embedArticleInRedirect = value;
						await this.plugin.saveSettings();
					})
			);

		containerEl.createEl("h3", { text: "Leksikon-struktur" });

		new Setting(containerEl)
			.setName("Leksikon-rotmappe")
			.setDesc(
				"Rotmappen for et alfabetisk leksikon (f.eks. «Div 2»). Når satt: " +
					`opprettes «${INBOX_FOLDER_NAME}» (nye artikler), «${TEMPLATE_FOLDER_NAME}» ` +
					`(redigerbare maler) og «${NOTES_FOLDER_NAME}» (kjøreloggar, inkludert ` +
					`undermappen «${ARTICLE_NOTES_FOLDER_NAME}» for artikkelnotater) automatisk. ` +
					"Bokstavmapper (A–Å) opprettes automatisk ved behov (aldri på forhånd), og " +
					"forkortelse-/disambigueringssider for artikler i denne mappen (rekursivt) " +
					"plasseres etter forkortelsens egen forbokstav i stedet for artikkelens " +
					`mappe. Nye sider i «${INBOX_FOLDER_NAME}» får automatisk artikkelmalens ` +
					"frontmatter-felt. Tomt felt = av."
			)
			.addText((text) => {
				text.setValue(this.plugin.settings.leksikonRoot).onChange(async (value) => {
					this.plugin.settings.leksikonRoot = value.trim().replace(/^\/+|\/+$/g, "");
					await this.plugin.saveSettings();
					await this.plugin.ensureLeksikonScaffold();
				});
				new FolderSuggest(this.app, text.inputEl, async (folder) => {
					const path = folder.path === "/" ? "" : folder.path;
					this.plugin.settings.leksikonRoot = path;
					text.setValue(path);
					await this.plugin.saveSettings();
					await this.plugin.ensureLeksikonScaffold();
				});
			});

		containerEl.createEl("h3", { text: "Wikidata-felt-grupper" });
		containerEl.createEl("p", {
			text:
				"Forhåndsdefinerte grupper av felt for Wikidata-import (f.eks. én for personer, " +
				"én for steder). Gruppen merket «aktiv» forhåkes når du åpner et nytt " +
				"import-vindu - der kan du også bytte til en annen gruppe underveis.",
		});

		const presets = this.plugin.settings.wikidataPresets;
		if (this.editingWikidataPresetId === null || !presets.some((p) => p.id === this.editingWikidataPresetId)) {
			this.editingWikidataPresetId = this.plugin.settings.activeWikidataPresetId;
		}
		const editingPreset =
			presets.find((p) => p.id === this.editingWikidataPresetId) ?? presets[0];

		const presetSwitcher = new Setting(containerEl).setName("Rediger gruppe");
		presetSwitcher.addDropdown((dropdown) => {
			for (const preset of presets) {
				const isActive = preset.id === this.plugin.settings.activeWikidataPresetId;
				dropdown.addOption(preset.id, isActive ? `${preset.name} (aktiv)` : preset.name);
			}
			dropdown.setValue(editingPreset.id);
			dropdown.onChange((value) => {
				this.editingWikidataPresetId = value;
				this.display();
			});
		});
		presetSwitcher.addButton((button) =>
			button
				.setButtonText("Sett som aktiv")
				.setDisabled(editingPreset.id === this.plugin.settings.activeWikidataPresetId)
				.onClick(async () => {
					this.plugin.settings.activeWikidataPresetId = editingPreset.id;
					await this.plugin.saveSettings();
					this.display();
				})
		);
		presetSwitcher.addExtraButton((button) =>
			button
				.setIcon("trash")
				.setTooltip("Slett gruppe")
				.setDisabled(presets.length <= 1)
				.onClick(async () => {
					const index = presets.findIndex((p) => p.id === editingPreset.id);
					if (index === -1) return;
					presets.splice(index, 1);
					if (this.plugin.settings.activeWikidataPresetId === editingPreset.id) {
						this.plugin.settings.activeWikidataPresetId = presets[0].id;
					}
					this.editingWikidataPresetId = presets[0].id;
					await this.plugin.saveSettings();
					this.display();
				})
		);

		new Setting(containerEl).setName("Navn på gruppen").addText((text) =>
			text.setValue(editingPreset.name).onChange(async (value) => {
				editingPreset.name = value;
				await this.plugin.saveSettings();
			})
		);

		const fields = editingPreset.fields;
		const fieldSettings: { fieldId: string; setting: Setting }[] = [];

		for (const [index, fieldId] of fields.entries()) {
			const setting = new Setting(containerEl)
				.setName(fieldId)
				.addExtraButton((button) =>
					button
						.setIcon("arrow-up")
						.setTooltip("Flytt opp")
						.setDisabled(index === 0)
						.onClick(async () => {
							[fields[index - 1], fields[index]] = [fields[index], fields[index - 1]];
							await this.plugin.saveSettings();
							this.display();
						})
				)
				.addExtraButton((button) =>
					button
						.setIcon("arrow-down")
						.setTooltip("Flytt ned")
						.setDisabled(index === fields.length - 1)
						.onClick(async () => {
							[fields[index + 1], fields[index]] = [fields[index], fields[index + 1]];
							await this.plugin.saveSettings();
							this.display();
						})
				)
				.addExtraButton((button) =>
					button
						.setIcon("trash")
						.setTooltip("Fjern")
						.onClick(async () => {
							fields.splice(index, 1);
							await this.plugin.saveSettings();
							this.display();
						})
				);
			attachDragReorder(setting.settingEl, index, async (from, to) => {
				const [moved] = fields.splice(from, 1);
				fields.splice(to, 0, moved);
				await this.plugin.saveSettings();
				this.display();
			});
			fieldSettings.push({ fieldId, setting });
		}

		if (fieldSettings.length > 0) {
			void this.plugin.resolveWikidataFieldLabels(fields).then((labels) => {
				for (const { fieldId, setting } of fieldSettings) {
					const label = labels[fieldId];
					if (label && label !== fieldId) setting.setName(`${fieldId} — ${label}`);
				}
			});
		}

		let newFieldId = "";
		new Setting(containerEl)
			.setName("Legg til felt")
			.setDesc(
				"Skriv inn «wikipedia», «description», «alias», «translation:<språk>» " +
					"(f.eks. «translation:en») eller en Wikidata-egenskaps-ID, f.eks. P8370."
			)
			.addText((text) => {
				text.setPlaceholder("F.eks. P8370").onChange((value) => {
					newFieldId = value.trim();
				});
			})
			.addButton((button) =>
				button
					.setButtonText("Legg til")
					.setCta()
					.onClick(async () => {
						const id = newFieldId.trim();
						if (!id) return;
						const isSpecialId =
							id === "wikipedia" ||
							id === "description" ||
							id === "alias" ||
							/^translation:[a-z-]{2,10}$/i.test(id);
						if (!isSpecialId && !/^p\d+$/i.test(id)) {
							new Notice(
								"Ordbok: skriv «wikipedia», «description», «alias», " +
									"«translation:<språk>» eller en gyldig Pxxx-ID."
							);
							return;
						}
						const normalized = /^p\d+$/i.test(id) ? id.toUpperCase() : id.toLowerCase();
						if (fields.includes(normalized)) {
							new Notice("Ordbok: feltet er allerede i listen.");
							return;
						}

						button.setDisabled(true);
						button.setButtonText("Legger til …");
						try {
							const label = await this.plugin.resolveWikidataFieldLabel(normalized);
							if (label === normalized) {
								new Notice(
									`Ordbok: fant ingen egenskap ${normalized} på Wikidata.`
								);
								return;
							}
							fields.push(normalized);
							await this.plugin.saveSettings();
							this.display();
						} catch (e) {
							new Notice(
								`Ordbok: klarte ikke å slå opp feltet – ${
									e instanceof Error ? e.message : String(e)
								}`
							);
						} finally {
							button.setDisabled(false);
							button.setButtonText("Legg til");
						}
					})
			);

		let newPresetName = "";
		new Setting(containerEl)
			.setName("Ny gruppe")
			.setDesc("Oppretter en tom gruppe du kan legge felt til i.")
			.addText((text) => {
				text.setPlaceholder("Navn").onChange((value) => {
					newPresetName = value.trim();
				});
			})
			.addButton((button) =>
				button
					.setButtonText("Opprett")
					.onClick(async () => {
						const name = newPresetName.trim();
						if (!name) return;
						const newPreset: WikidataFieldPreset = {
							id: generatePresetId(),
							name,
							fields: [],
						};
						presets.push(newPreset);
						this.editingWikidataPresetId = newPreset.id;
						await this.plugin.saveSettings();
						this.display();
					})
			);

		containerEl.createEl("h3", { text: "Wikidata: beskrivelse, alias og oversettelser" });
		containerEl.createEl("p", {
			text:
				"Dette er ikke vanlige Wikidata-egenskaper (Pxxx), men hentes fra entitetens " +
				"egne beskrivelse-, alias- og etikettdata. Slå på det du vil ha tilgjengelig i " +
				"import-vinduet, og velg språk. Beskrivelse og alias bruker første språk i " +
				"listen som har en verdi; oversettelser gir én egen rad per språk i listen som " +
				"har en etikett.",
		});

		new Setting(containerEl)
			.setName("Importer beskrivelse")
			.setDesc("Gjør entitetens Wikidata-beskrivelse valgbar som felt i import-vinduet.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.wikidataImportDescription)
					.onChange(async (value) => {
						this.plugin.settings.wikidataImportDescription = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Språk for beskrivelse")
			.setDesc("Kommaseparerte språkkoder i prioritert rekkefølge, f.eks. «nb,en».")
			.addText((text) =>
				text
					.setPlaceholder("nb,en")
					.setValue(this.plugin.settings.wikidataDescriptionLanguages)
					.onChange(async (value) => {
						this.plugin.settings.wikidataDescriptionLanguages = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Importer alias")
			.setDesc("Gjør entitetens Wikidata-alias (alternative navn) valgbare i import-vinduet.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.wikidataImportAlias)
					.onChange(async (value) => {
						this.plugin.settings.wikidataImportAlias = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Språk for alias")
			.setDesc("Kommaseparerte språkkoder i prioritert rekkefølge, f.eks. «nb,en».")
			.addText((text) =>
				text
					.setPlaceholder("nb,en")
					.setValue(this.plugin.settings.wikidataAliasLanguages)
					.onChange(async (value) => {
						this.plugin.settings.wikidataAliasLanguages = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Importer oversettelser")
			.setDesc(
				"Gjør entitetens etiketter på andre språk valgbare som egne rader i " +
					"import-vinduet (én rad per språk)."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.wikidataImportTranslations)
					.onChange(async (value) => {
						this.plugin.settings.wikidataImportTranslations = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Språk for oversettelser")
			.setDesc(
				"Kommaseparerte språkkoder - én rad legges til per språk som har en " +
					"etikett, f.eks. «en,de,fr»."
			)
			.addText((text) =>
				text
					.setPlaceholder("en")
					.setValue(this.plugin.settings.wikidataTranslationLanguages)
					.onChange(async (value) => {
						this.plugin.settings.wikidataTranslationLanguages = value;
						await this.plugin.saveSettings();
					})
			);

		containerEl.createEl("h3", { text: "Interne ID-serier" });
		containerEl.createEl("p", {
			text:
				"Egendefinerte serier for interne ID-nummer, f.eks. «DEF-0001». En serie kan " +
				"matches automatisk mot en mappe eller en tag, eller settes til «manuelt» og " +
				"velges eksplisitt hver gang. Bruk kommandoene/sidepanel-knappene «Generer " +
				"internt ID-nummer (aktiv side)» og «Masse-generer ID-numre for en serie».",
		});

		for (const [index, series] of this.plugin.settings.idSeries.entries()) {
			const card = containerEl.createDiv({ cls: "ordbok-id-series-card" });

			new Setting(card)
				.setName("Navn")
				.addText((text) =>
					text.setValue(series.name).onChange(async (value) => {
						series.name = value;
						await this.plugin.saveSettings();
					})
				)
				.addExtraButton((button) =>
					button
						.setIcon("trash")
						.setTooltip("Slett serie")
						.onClick(async () => {
							this.plugin.settings.idSeries.splice(index, 1);
							await this.plugin.saveSettings();
							this.display();
						})
				);

			new Setting(card)
				.setName("Prefiks")
				.setDesc("F.eks. «DEF-».")
				.addText((text) =>
					text.setValue(series.prefix).onChange(async (value) => {
						series.prefix = value;
						await this.plugin.saveSettings();
					})
				);

			new Setting(card)
				.setName("Antall siffer")
				.setDesc("Nullutfylling, f.eks. 4 gir «0007».")
				.addText((text) =>
					text.setValue(String(series.padding)).onChange(async (value) => {
						const n = parseInt(value, 10);
						series.padding = Number.isFinite(n) && n > 0 ? n : 1;
						await this.plugin.saveSettings();
					})
				);

			new Setting(card)
				.setName("Neste nummer")
				.setDesc("Nummeret som brukes neste gang - økes automatisk etter hver generering.")
				.addText((text) =>
					text.setValue(String(series.nextNumber)).onChange(async (value) => {
						const n = parseInt(value, 10);
						series.nextNumber = Number.isFinite(n) && n > 0 ? n : 1;
						await this.plugin.saveSettings();
					})
				);

			new Setting(card)
				.setName("Frontmatter-felt")
				.setDesc("Hvilket felt ID-en skrives til, f.eks. «uid».")
				.addText((text) =>
					text.setValue(series.frontmatterKey).onChange(async (value) => {
						series.frontmatterKey = value.trim() || "uid";
						await this.plugin.saveSettings();
					})
				);

			new Setting(card)
				.setName("Kilde")
				.setDesc("Hvordan siden matches til denne serien automatisk.")
				.addDropdown((dropdown) =>
					dropdown
						.addOption("manual", "Manuelt (velg alltid selv)")
						.addOption("folder", "Mappe")
						.addOption("tag", "Tag")
						.setValue(series.matchType)
						.onChange(async (value) => {
							series.matchType = value as IdSeries["matchType"];
							await this.plugin.saveSettings();
							this.display();
						})
				);

			if (series.matchType !== "manual") {
				const valueSetting = new Setting(card).setName(
					series.matchType === "folder" ? "Mappe" : "Tag"
				);
				valueSetting.addText((text) => {
					text
						.setPlaceholder(series.matchType === "folder" ? "F.eks. Juss" : "F.eks. lov")
						.setValue(series.matchValue)
						.onChange(async (value) => {
							series.matchValue = value.trim();
							await this.plugin.saveSettings();
						});
					if (series.matchType === "folder") {
						new FolderSuggest(this.app, text.inputEl, async (folder) => {
							const path = folder.path === "/" ? "" : folder.path;
							series.matchValue = path;
							text.setValue(path);
							await this.plugin.saveSettings();
						});
					}
				});
			}
		}

		let newSeriesName = "";
		new Setting(containerEl)
			.setName("Ny ID-serie")
			.setDesc("Oppretter en tom serie du kan konfigurere (prefiks, mappe/tag osv.) under.")
			.addText((text) => {
				text.setPlaceholder("Navn").onChange((value) => {
					newSeriesName = value.trim();
				});
			})
			.addButton((button) =>
				button
					.setButtonText("Opprett")
					.setCta()
					.onClick(async () => {
						const name = newSeriesName.trim();
						if (!name) return;
						const newSeries: IdSeries = {
							id: generateSeriesId(),
							name,
							prefix: "",
							padding: 4,
							nextNumber: 1,
							frontmatterKey: "uid",
							matchType: "manual",
							matchValue: "",
						};
						this.plugin.settings.idSeries.push(newSeries);
						await this.plugin.saveSettings();
						this.display();
					})
			);

		containerEl.createEl("h3", { text: "Finjustering" });

		new Setting(containerEl)
			.setName("Utdragslengde på pekersider")
			.setDesc(
				"Maks antall tegn i utdraget som vises for hver artikkel på en " +
					"disambiguerings-/pekerside, før teksten kuttes med «…»."
			)
			.addText((text) =>
				text.setValue(String(this.plugin.settings.excerptMaxLength)).onChange(async (value) => {
					const n = parseInt(value, 10);
					this.plugin.settings.excerptMaxLength = Number.isFinite(n) && n > 0 ? n : 140;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("Terskel for «ser ut som forkortelse»")
			.setDesc(
				"I alias-triage-vinduet (ved import av Wikidata-alias) forhåndsvelges " +
					"«Forkortelse» for alias uten mellomrom som er kortere enn eller lik dette " +
					"antallet tegn - ellers forhåndsvelges «Alias». Rent gjetteforsøk, alltid " +
					"overstyrbart manuelt."
			)
			.addText((text) =>
				text
					.setValue(String(this.plugin.settings.aliasAbbreviationMaxLength))
					.onChange(async (value) => {
						const n = parseInt(value, 10);
						this.plugin.settings.aliasAbbreviationMaxLength =
							Number.isFinite(n) && n > 0 ? n : 6;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Dewey-fallback-URL")
			.setDesc(
				"URL-mal brukt til å lenke Dewey-tall (P1036), siden Wikidatas egen " +
					"formatter-URL peker til den nedlagte tjenesten dewey.info. Bruk «$1» der " +
					"selve tallet skal settes inn."
			)
			.addText((text) =>
				text
					.setPlaceholder("https://data.ub.uio.no/skosmos/ddc/nb/search?clang=nb&q=$1")
					.setValue(this.plugin.settings.deweyFallbackUrlTemplate)
					.onChange(async (value) => {
						this.plugin.settings.deweyFallbackUrlTemplate = value;
						await this.plugin.saveSettings();
					})
			);

		containerEl.createEl("h3", { text: "Claude-prompter" });
		containerEl.createEl("p", {
			text:
				"«Foreslå omskriving med Claude» kjører Claude Code CLI-en lokalt (krever Obsidian " +
				"desktop, og at CLI-en er installert/innlogget fra før) og sender hele siden som " +
				"input. Bruk «{{tittel}}» i en prompt for å referere til filnavnet. Sett opp så " +
				"mange prompter du vil - du velger blant dem hver gang (eller går rett på hvis " +
				"det bare finnes én).",
		});

		new Setting(containerEl)
			.setName("Claude CLI-kommando")
			.setDesc("Kommandoen som kjøres, f.eks. «claude» (må finnes i PATH), eller en full sti.")
			.addText((text) =>
				text
					.setPlaceholder("claude")
					.setValue(this.plugin.settings.claudeCliPath)
					.onChange(async (value) => {
						this.plugin.settings.claudeCliPath = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Tidsavbrudd (sekunder)")
			.setDesc("Maks ventetid på svar fra Claude før kallet avbrytes.")
			.addText((text) =>
				text
					.setValue(String(this.plugin.settings.claudeCliTimeoutSeconds))
					.onChange(async (value) => {
						const n = parseInt(value, 10);
						this.plugin.settings.claudeCliTimeoutSeconds =
							Number.isFinite(n) && n > 0 ? n : 120;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Test Claude CLI-tilkobling")
			.setDesc(
				"Kjører et minimalt kall mot CLI-en over (uten å røre noen side) og viser hele " +
					"det rå svaret eller den fulle feilmeldingen - nyttig til å feilsøke sti/PATH " +
					"eller innlogging."
			)
			.addButton((button) =>
				button.setButtonText("Test").onClick(() => void this.plugin.testClaudeCliConnection())
			);

		for (const [index, prompt] of this.plugin.settings.claudePrompts.entries()) {
			const card = containerEl.createDiv({ cls: "ordbok-id-series-card ordbok-claude-prompt-card" });

			new Setting(card)
				.setName("Navn")
				.addText((text) =>
					text.setValue(prompt.name).onChange(async (value) => {
						prompt.name = value;
						await this.plugin.saveSettings();
					})
				)
				.addExtraButton((button) =>
					button
						.setIcon("trash")
						.setTooltip("Slett prompt")
						.onClick(async () => {
							this.plugin.settings.claudePrompts.splice(index, 1);
							await this.plugin.saveSettings();
							this.display();
						})
				);

			new Setting(card)
				.setName("Prompt")
				.setDesc("Instruksjonen som sendes til Claude sammen med sidens innhold.")
				.addTextArea((text) =>
					text.setValue(prompt.prompt).onChange(async (value) => {
						prompt.prompt = value;
						await this.plugin.saveSettings();
					})
				);

			new Setting(card)
				.setName("Full sideerstatning")
				.setDesc(
					"På: Claude bes returnere hele den oppdaterte filen, og forslagsvinduet får " +
						"en «Bruk (erstatt hele siden)»-knapp. Av: for prompter som skal gi en " +
						"rapport/liste i stedet for en omskriving - da tilbys kun «Kopier»."
				)
				.addToggle((toggle) =>
					toggle.setValue(prompt.expectsFullFileReplacement).onChange(async (value) => {
						prompt.expectsFullFileReplacement = value;
						await this.plugin.saveSettings();
					})
				);
		}

		let newPromptName = "";
		new Setting(containerEl)
			.setName("Ny Claude-prompt")
			.setDesc("Oppretter en tom prompt du kan skrive inn under.")
			.addText((text) => {
				text.setPlaceholder("Navn").onChange((value) => {
					newPromptName = value.trim();
				});
			})
			.addButton((button) =>
				button
					.setButtonText("Opprett")
					.setCta()
					.onClick(async () => {
						const name = newPromptName.trim();
						if (!name) return;
						const newPrompt: ClaudePrompt = {
							id: generateClaudePromptId(),
							name,
							prompt: "",
							expectsFullFileReplacement: true,
						};
						this.plugin.settings.claudePrompts.push(newPrompt);
						await this.plugin.saveSettings();
						this.display();
					})
			);

		containerEl.createEl("h3", { text: "Mapper" });
		containerEl.createEl("p", {
			text:
				"Begrens hvilke mapper alias-skanningen kjører i. Uten valgte mapper " +
				"skannes hele hvelvet.",
		});

		for (const [index, scope] of this.plugin.settings.scopedFolders.entries()) {
			new Setting(containerEl)
				.setName(scope.path === "" ? "/ (vaultroten)" : scope.path)
				.addToggle((toggle) =>
					toggle
						.setTooltip("Inkluder undermapper")
						.setValue(scope.includeSubfolders)
						.onChange(async (value) => {
							scope.includeSubfolders = value;
							await this.plugin.saveSettings();
						})
				)
				.addExtraButton((button) =>
					button
						.setIcon("trash")
						.setTooltip("Fjern")
						.onClick(async () => {
							this.plugin.settings.scopedFolders.splice(index, 1);
							await this.plugin.saveSettings();
							this.display();
						})
				);
		}

		let newPath = "";
		let newIncludeSubfolders = true;
		let inputEl: HTMLInputElement;

		new Setting(containerEl)
			.setName("Legg til mappe")
			.setDesc("Skriv inn eller velg en mappe fra hvelvet.")
			.addText((text) => {
				inputEl = text.inputEl;
				text.setPlaceholder("F.eks. Definisjoner").onChange((value) => {
					newPath = value;
				});
				new FolderSuggest(this.app, text.inputEl, (folder) => {
					newPath = folder.path === "/" ? "" : folder.path;
				});
			})
			.addToggle((toggle) =>
				toggle
					.setTooltip("Inkluder undermapper")
					.setValue(true)
					.onChange((value) => {
						newIncludeSubfolders = value;
					})
			)
			.addButton((button) =>
				button
					.setButtonText("Legg til")
					.setCta()
					.onClick(async () => {
						const path = newPath.trim().replace(/^\/+|\/+$/g, "");
						const alreadyExists = this.plugin.settings.scopedFolders.some(
							(s) => s.path === path
						);
						if (alreadyExists) {
							new Notice("Mappen er allerede lagt til.");
							return;
						}
						this.plugin.settings.scopedFolders.push({
							path,
							includeSubfolders: newIncludeSubfolders,
						});
						await this.plugin.saveSettings();
						this.display();
					})
			);
	}
}
