import { EditorView, Decoration, DecorationSet, PluginValue, ViewUpdate } from "@codemirror/view";
import { App, editorLivePreviewField } from "obsidian";
import { LinkRangeSettings } from "./settings";
import { RangeSetBuilder } from "@codemirror/state";
import { replaceEmbed } from "./embeds";

export class LifePreviewEmbedReplacer implements PluginValue {
	decorations: DecorationSet = Decoration.none;
	settings: LinkRangeSettings;
	app: App;
	// Debounce timer to avoid hammering replaceEmbed on rapid typing
	private debounceTimer: ReturnType<typeof setTimeout> | null = null;
	private pendingView: EditorView | null = null;

	constructor(view: EditorView, settings: LinkRangeSettings, app: App) {
		this.settings = settings;
		this.app = app;
		// Eagerly render once on construction so embeds appear immediately
		// when opening a note or switching to live preview mode, without
		// requiring a doc change or scroll.
		this.decorations = this.buildDecorations(view);
	}

	buildDecorations(view: EditorView): DecorationSet {
		const buffer = new RangeSetBuilder<Decoration>()
		const embeds = view.contentDOM.querySelectorAll("div.markdown-embed");

		embeds.forEach(embed => {
			replaceEmbed(this.app, embed, this.settings)
		})

		return buffer.finish();
	}

	update(update: ViewUpdate) {
		if (!update.state.field(editorLivePreviewField)) {
			// live preview only, not rendered in strict source code view
			this.decorations = Decoration.none;
			return;
		}

		// Only rebuild on doc changes or viewport changes — NOT focusChanged.
		// focusChanged fires on every keystroke and caused the viewport to
		// jump because replaceEmbed() destroys and recreates the entire DOM.
		if (update.docChanged || update.viewportChanged) {
			// Debounce to avoid re-rendering embeds on every single keystroke.
			// This lets the user type freely without the viewport jumping around.
			if (this.debounceTimer) {
				clearTimeout(this.debounceTimer);
			}
			this.pendingView = update.view;
			this.debounceTimer = setTimeout(() => {
				if (this.pendingView) {
					this.decorations = this.buildDecorations(this.pendingView);
					this.pendingView = null;
				}
				this.debounceTimer = null;
			}, 300);
		}
	}

	destroy() {
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
		}
	}
}
