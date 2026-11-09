import { MODE_CLASS_PREFIX, VIM_MODES } from "../constants";
import type { VimMode, VimToolsSettings } from "../types";

/** Status bar item showing the current vim mode. */
export class ModeStatusBar {
	constructor(
		private readonly el: HTMLElement,
		private getSettings: () => VimToolsSettings,
	) {
		this.el.addClass("vim-tools-mode");
		// The label is often a bare glyph, so screen readers need the context.
		this.el.setAttribute("role", "status");
	}

	render(mode: VimMode): void {
		const settings = this.getSettings();
		if (!settings.showModeInStatusBar) {
			this.el.setText("");
			this.el.toggleClass("is-hidden", true);
			return;
		}
		this.el.toggleClass("is-hidden", false);
		this.el.setText(settings.modePrompts[mode]);
		this.el.setAttribute("aria-label", `Vim mode: ${mode}`);
		for (const candidate of VIM_MODES) {
			this.el.toggleClass(`${MODE_CLASS_PREFIX}${candidate}`, candidate === mode);
		}
	}
}
