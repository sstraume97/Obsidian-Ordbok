import {
	AbstractInputSuggest,
	App,
	Modal,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	TFile,
	TFolder,
	parseFrontMatterAliases,
} from "obsidian";

const AUTO_GENERATED_KEY = "auto-generated";
const REDIRECT_CSSCLASS = "redirect";
const PEKERSIDE_CALLOUT_TYPE = "disambiguering";
const EMBED_CALLOUT_TYPE = "pekerside";
const FORKORTELSER_KEY = "forkortelser";
const PUBLISER_KEY = "publiser";
const RELATERT_KEY = "relatert";
const INDEX_FOR_KEY = "index-for";
const INBOX_FOLDER_NAME = "00 Inboks";
const INDEX_FILENAME = "Index";
const INCOMPLETE_MARKER = "[…]";
const NON_LETTER_FOLDER = "#";
const SE_OGSÅ_START = "<!-- ordbok:se-også:start -->";
const SE_OGSÅ_END = "<!-- ordbok:se-også:end -->";
const EXCERPT_MAX_LENGTH = 140;
const ILLEGAL_FILENAME_CHARS = /[\\/:*?"<>|#^[\]]/g;
const STYLE_EL_ID = "ordbok-pekersider-styles";

const TEMPLATE_FOLDER_NAME = "01 mal";
const REDIRECT_TEMPLATE_NAME = "Redirect.md";
const REDIRECT_EMBED_TEMPLATE_NAME = "Redirect (innebygd).md";
const DISAMBIGUERING_TEMPLATE_NAME = "Disambiguering.md";

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

interface OrdbokSettings {
	scopedFolders: FolderScope[];
	caseSensitiveAliases: boolean;
	embedArticleInRedirect: boolean;
	leksikonRoot: string;
}

const DEFAULT_SETTINGS: OrdbokSettings = {
	scopedFolders: [],
	caseSensitiveAliases: false,
	embedArticleInRedirect: false,
	leksikonRoot: "",
};

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

export default class OrdbokPekersiderPlugin extends Plugin {
	settings: OrdbokSettings = DEFAULT_SETTINGS;

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

		this.addSettingTab(new OrdbokSettingTab(this.app, this));

		this.addRibbonIcon(
			"refresh-cw",
			"Regenerer peker- og redirect-sider",
			() => this.regenerate()
		);
	}

	private injectStyles() {
		const styleEl = document.createElement("style");
		styleEl.id = STYLE_EL_ID;
		styleEl.textContent = PLUGIN_STYLES;
		document.head.appendChild(styleEl);
		this.register(() => styleEl.remove());
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
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

	private async runMigration() {
		const scopedRealFiles = this.app.vault
			.getMarkdownFiles()
			.filter((f) => this.isInScope(f) && !this.isAutoGenerated(f));

		const migrated = await this.migrateAliasesToForkortelser(scopedRealFiles);

		new Notice(
			migrated.size > 0
				? `Ordbok: ${migrated.size} notat(er) migrert fra aliases til forkortelser`
				: "Ordbok: ingen notater å migrere"
		);
	}

	private confirmDeleteAllAutoGenerated() {
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
		let deleted = 0;
		for (const file of this.app.vault.getMarkdownFiles()) {
			if (!this.isInScope(file)) continue;
			if (!this.isAutoGenerated(file)) continue;
			await this.app.vault.delete(file);
			deleted++;
		}
		new Notice(`Ordbok: ${deleted} autogenererte side(r) slettet`);
	}

	private async publishFromInbox() {
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
	): Promise<{ moved: number; skipped: string[] }> {
		const root = this.settings.leksikonRoot;
		let moved = 0;
		const skipped: string[] = [];

		for (const file of files) {
			const folderPath = `${root}/${this.letterFor(file.basename)}`;
			await this.ensureFolder(folderPath);
			const destPath = `${folderPath}/${file.name}`;

			if (this.app.vault.getAbstractFileByPath(destPath)) {
				skipped.push(file.path);
				continue;
			}

			await this.app.fileManager.renameFile(file, destPath);
			moved++;
		}

		return { moved, skipped };
	}

	private async executePublishFromInbox(files: TFile[]) {
		const { moved, skipped } = await this.moveFilesToLetterFolders(files);

		new Notice(
			`Ordbok: ${moved} side(r) publisert` +
				(skipped.length > 0
					? `, ${skipped.length} hoppet over (finnes allerede i målmappen)`
					: "")
		);

		if (moved > 0) {
			const items = this.buildRegeneratePlan();
			await this.executeRegenerate(items);
		}
	}

	private organizeAllPages() {
		const root = this.settings.leksikonRoot;
		if (!root) {
			new Notice("Ordbok: sett leksikon-rotmappe i innstillingene først");
			return;
		}

		if (!(this.app.vault.getAbstractFileByPath(root) instanceof TFolder)) {
			new Notice(`Ordbok: fant ikke leksikon-rotmappen «${root}»`);
			return;
		}

		const inboxPath = `${root}/${INBOX_FOLDER_NAME}`;
		const templatePath = `${root}/${TEMPLATE_FOLDER_NAME}`;

		const candidates = this.app.vault.getMarkdownFiles().filter((f) => {
			if (!this.folderUnderLeksikonRoot(f)) return false;
			if (this.isAutoGenerated(f)) return false;

			const folderPath = this.folderPathOf(f);
			if (folderPath === inboxPath || folderPath.startsWith(inboxPath + "/")) return false;
			if (folderPath === templatePath || folderPath.startsWith(templatePath + "/")) return false;

			return folderPath !== `${root}/${this.letterFor(f.basename)}`;
		});

		if (candidates.length === 0) {
			new Notice("Ordbok: alle sider ligger allerede i riktig bokstavmappe");
			return;
		}

		const bySource = new Map<string, number>();
		for (const f of candidates) {
			const src = this.folderPathOf(f) || "(rot)";
			bySource.set(src, (bySource.get(src) ?? 0) + 1);
		}
		const breakdown = [...bySource.entries()]
			.sort((a, b) => b[1] - a[1])
			.map(([folder, count]) => `${folder}: ${count}`)
			.join(", ");

		new ConfirmModal(
			this.app,
			"Organiser alle sider",
			`Dette flytter ${candidates.length} side(r) til riktig bokstavmappe under ` +
				`«${root}» (${breakdown}). Innboksen («${INBOX_FOLDER_NAME}») er ikke inkludert ` +
				"– bruk «Publiser sider fra innboks» for den. Fortsette?",
			"Organiser",
			() => this.executeOrganizeAllPages(candidates)
		).open();
	}

	private async executeOrganizeAllPages(files: TFile[]) {
		const { moved, skipped } = await this.moveFilesToLetterFolders(files);

		new Notice(
			`Ordbok: ${moved} side(r) organisert` +
				(skipped.length > 0
					? `, ${skipped.length} hoppet over (finnes allerede i målmappen)`
					: "")
		);

		if (moved > 0) {
			const items = this.buildRegeneratePlan();
			await this.executeRegenerate(items);
		}
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

	private showMissingLinks() {
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

	private showDuplicates() {
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

	private showOrphanArticles() {
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

	private async updateSeOgsåSections() {
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
				for (const { file, newContent } of changes) {
					await this.app.vault.modify(file, newContent);
				}
				new Notice(`Ordbok: ${changes.length} «Se også»-seksjon(er) oppdatert`);
			}
		).open();
	}

	private showStats() {
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
					if (child.name === INBOX_FOLDER_NAME || child.name === TEMPLATE_FOLDER_NAME) continue;
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
		return cleaned.length > EXCERPT_MAX_LENGTH
			? cleaned.slice(0, EXCERPT_MAX_LENGTH).trimEnd() + "…"
			: cleaned;
	}

	/** Oppretter mal-mappen og standardmalene der, hvis de ikke finnes fra før.
	 * Rører aldri en mal som allerede finnes – brukerens redigeringer bevares. */
	/** Oppretter innboks- og mal-mappen (med standardmaler) hvis de ikke
	 * finnes fra før. Rører aldri en mal som allerede finnes. */
	async ensureLeksikonScaffold(): Promise<void> {
		const root = this.settings.leksikonRoot;
		if (!root) return;

		await this.ensureFolder(`${root}/${INBOX_FOLDER_NAME}`);

		const templateFolder = `${root}/${TEMPLATE_FOLDER_NAME}`;
		await this.ensureFolder(templateFolder);

		const defaults: [string, string][] = [
			[REDIRECT_TEMPLATE_NAME, DEFAULT_REDIRECT_TEMPLATE],
			[REDIRECT_EMBED_TEMPLATE_NAME, DEFAULT_REDIRECT_EMBED_TEMPLATE],
			[DISAMBIGUERING_TEMPLATE_NAME, DEFAULT_DISAMBIGUERING_TEMPLATE],
		];

		for (const [name, content] of defaults) {
			const path = `${templateFolder}/${name}`;
			if (!this.app.vault.getAbstractFileByPath(path)) {
				await this.app.vault.create(path, content);
			}
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
			if (child.name === INBOX_FOLDER_NAME || child.name === TEMPLATE_FOLDER_NAME) continue;

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
			() => this.executeRegenerate(items)
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
			() => this.executeRegenerate(items, (f) => this.isIndexPage(f))
		).open();
	}

	private async executeRegenerate(
		items: RegeneratePlanItem[],
		cleanupPredicate: (f: TFile) => boolean = (f) => this.isAutoGenerated(f)
	) {
		await this.ensureLeksikonScaffold();

		const writtenPaths = new Set<string>();
		let redirectsWritten = 0;
		let pekersiderWritten = 0;
		let indexesWritten = 0;
		const conflicts: string[] = [];

		for (const item of items) {
			if (item.conflict) {
				conflicts.push(item.path);
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
			} else {
				const lastSlash = item.path.lastIndexOf("/");
				if (lastSlash > 0) await this.ensureFolder(item.path.slice(0, lastSlash));
				await this.app.vault.create(item.path, content);
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
	}
}

class OrdbokSettingTab extends PluginSettingTab {
	plugin: OrdbokPekersiderPlugin;

	constructor(app: App, plugin: OrdbokPekersiderPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "Ordbok pekersider" });

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
					"bokstavmapper (A–Å) opprettes automatisk ved behov (aldri på " +
					"forhånd), og forkortelse-/disambigueringssider for artikler i " +
					"denne mappen (rekursivt) plasseres etter forkortelsens egen " +
					"forbokstav i stedet for artikkelens mappe. Gjør også kommandoen " +
					`«Publiser sider fra innboks» tilgjengelig for undermappen ` +
					`«${INBOX_FOLDER_NAME}». Tomt felt = av.`
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
