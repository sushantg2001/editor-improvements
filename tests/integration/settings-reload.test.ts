import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import EditorImprovementsPlugin from "../../src/main";
import { EditorImprovementsSettingTab } from "../../src/settings";
import { App, Setting } from "../mocks/obsidian";

beforeEach(() => {
	Setting.created.length = 0;
});

afterEach(() => {
	Setting.created.length = 0;
});

async function open() {
	const plugin = new EditorImprovementsPlugin(new App() as never, {} as never);
	await plugin.onload();
	const tab = (plugin as unknown as { settingTab: EditorImprovementsSettingTab }).settingTab;
	(tab as unknown as { display(): void }).display();
	const reload = vi.spyOn(plugin, "reloadScripts").mockResolvedValue();
	const field = (name: string) => {
		const setting = Setting.created.find((s) => s.name === name);
		if (!setting) {
			throw new Error(`no setting "${name}"`);
		}
		const component = setting.components[0]!;
		return {
			type: async (text: string) => {
				for (let end = 1; end <= text.length; end++) {
					component.changeHandler?.(text.slice(0, end));
				}
				await Promise.resolve();
			},
			leave: () => component.inputEl.dispatchEvent(new Event("change")),
			component,
		};
	};
	return { plugin, tab, reload, field };
}

describe("typing a scripts folder", () => {
	it("does not run the scripts for each character, or in the folders on the way", async () => {
		const { plugin, reload, field } = await open();

		await field("Scripts folder").type("Scripts/vim");

		expect(plugin.settings.scriptsFolder).toBe("Scripts/vim");
		expect(reload).not.toHaveBeenCalled();
	});

	it("runs them once when the field is left", async () => {
		const { reload, field } = await open();
		const folder = field("Scripts folder");

		await folder.type("Scripts/vim");
		folder.leave();
		await Promise.resolve();

		expect(reload).toHaveBeenCalledOnce();
	});

	it("runs them when the settings are closed with the field still focused", async () => {
		const { tab, reload, field } = await open();

		await field("Scripts folder").type("Scripts/vim");
		tab.hide();

		expect(reload).toHaveBeenCalledOnce();
	});

	it("does not run them again for leaving a field that did not change", async () => {
		const { tab, reload, field } = await open();

		field("Scripts folder").leave();
		tab.hide();

		expect(reload).not.toHaveBeenCalled();
	});

	it("runs them once for a folder and a leader changed together", async () => {
		const { reload, field } = await open();

		await field("Scripts folder").type("a");
		await field("Leader key").type(",");
		field("Leader key").leave();
		await Promise.resolve();
		field("Scripts folder").leave();
		await Promise.resolve();

		expect(reload).toHaveBeenCalledOnce();
	});
});

describe("typing a leader", () => {
	it("is saved at once and applied when the field is left", async () => {
		const { plugin, reload, field } = await open();
		const leader = field("Leader key");

		await leader.type(",");
		expect(plugin.settings.leader).toBe(",");
		expect(reload).not.toHaveBeenCalled();

		leader.leave();
		await Promise.resolve();
		expect(reload).toHaveBeenCalledOnce();
	});
});

describe("the scripts switch", () => {
	it("still takes effect at once", async () => {
		const { plugin, reload } = await open();
		const setting = Setting.created.find((s) => s.name === "Run scripts from the vault");

		setting?.components[0]?.changeHandler?.(true);
		await Promise.resolve();
		await Promise.resolve();

		expect(plugin.settings.scriptsEnabled).toBe(true);
		expect(reload).toHaveBeenCalledOnce();
	});
});
