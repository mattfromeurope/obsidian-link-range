import { App, MarkdownRenderer, setIcon, TFile } from "obsidian";
import { LinkRangeSettings } from "./settings";
import { checkLink } from "./utils";

// Simple string hash for cache key generation (djb2)
function hashString(str: string): string {
	let hash = 5381;
	for (let i = 0; i < str.length; i++) {
		hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
	}
	return hash.toString(36);
}

export async function replaceEmbed(app: App, embed: Node, settings: LinkRangeSettings, isMarkdownPost = false) {
	let embedHtml = embed as HTMLElement
	// Keep a reference to the original outer element for cache key storage
	const outerElement = embedHtml;

	const res = checkLink(app, embedHtml, settings, true, "src");

	const isLinkRange = res !== null && res.h2 !== undefined;
	const file = res?.file
	if (isLinkRange && file !== undefined) {
		const { vault } = app;

		// Read file content first so we can include a content hash in the
		// cache key. This ensures we re-render when the source text changes
		// even if the heading line numbers stay the same.
		const fileContent = await vault.cachedRead(file);
		let lines = fileContent.split("\n");
		lines = lines.slice(res.h1Line, res.h2Line);
		const contentText = lines.join("\n");

		const cacheKey = `${file.path}:${res.h1Line}:${res.h2Line}:${hashString(contentText)}`;
		// Check the cache key on the outer element (works for both live preview
		// and markdown post-processor paths)
		const prevKey = outerElement.getAttribute("data-link-range-key");
		if (prevKey === cacheKey) {
			// Already rendered with the same content — bail out
			return;
		}

		// Guard against async race: another call may have started rendering
		// while we were awaiting cachedRead. If so, let the newer one win.
		// We use a generation counter stored on the element.
		const generation = (parseInt(outerElement.getAttribute("data-link-range-gen") || "0") || 0) + 1;
		outerElement.setAttribute("data-link-range-gen", generation.toString());

		embedHtml.childNodes.forEach(x => {
			x.remove()
		})

		const linkRange = embedHtml.querySelectorAll("div.link-range-embed")

		linkRange.forEach(x => {
			x.remove()
		})

		if (isMarkdownPost) {
			// prevent default embed functionality for markdown post processor
			embedHtml.removeClasses(["internal-embed"])
			// create a child div under embedHtml to place content inside
			embedHtml = embedHtml.createDiv({
				cls: ["internal-embed", "markdown-embed", "inline-embed", "is-loaded", "link-range-embed"]
			})
		}

		embedHtml.setText("")

		embedHtml.createEl("h2", {
			text: res.altText
		})

		const linkDiv = embedHtml.createDiv({
			cls: ["markdown-embed-link"],
		});

		setIcon(linkDiv, 'link')

		linkDiv.onClickEvent((ev: MouseEvent) => {
			const leaf = app.workspace.getMostRecentLeaf();
			leaf?.openFile(file, {
				state: {
					scroll: res.h1Line
				}
			});
		})

		// Post-await race guard: if a newer render kicked off while we were
		// waiting, abort this one so the newer render wins.
		const currentGen = parseInt(outerElement.getAttribute("data-link-range-gen") || "0") || 0;
		if (currentGen !== generation) {
			return;
		}

		const contentDiv = embedHtml.createDiv({
			cls: ["markdown-embed-content"]
		})

		await MarkdownRenderer.renderMarkdown(contentText, contentDiv, "", null!)

		// Tag the outer element with the cache key so subsequent calls can
		// skip re-rendering (works for both live preview and post-processor)
		outerElement.setAttribute("data-link-range-key", cacheKey);
	}
}
