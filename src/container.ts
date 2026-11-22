import { ItemView, Platform, type Plugin } from "obsidian";
import { ActionRegistry } from "./actions/registry";
import { DeviceState } from "./device-state";
import { ForkEngine } from "./engine/fork";
import { Lifecycle } from "./lifecycle/lifecycle";
import { KeyRouter } from "./router/dispatch";
import { ScopeInstaller } from "./router/install";
import { isWorkspaceBelow } from "./router/obsidian-internals";
import { notifyOnce } from "./ui/notices";

/** Creates every long-lived object once and wires them together. */
export function createLifecycle(plugin: Plugin): Lifecycle {
	const { app } = plugin;
	const engine = new ForkEngine();
	const actions = new ActionRegistry(app, engine, (_, message) => notifyOnce(message));
	const device = new DeviceState((app as unknown as { appId: string }).appId, window.localStorage);
	let lifecycle: Lifecycle | null = null;
	const router = new KeyRouter({
		engine,
		actions,
		mac: Platform.isMacOS,
		workspaceBelow: (win) => isWorkspaceBelow(app, win),
		activeViewType: () => app.workspace.getActiveViewOfType(ItemView)?.getViewType() ?? null,
		onPanic: () => lifecycle?.toggleSafeMode(),
		onError: () => lifecycle?.reportError(),
		onChange: () => lifecycle?.onKeyHandled(),
	});
	const installer = new ScopeInstaller(app, router.handle);
	lifecycle = new Lifecycle({ plugin, engine, actions, router, installer, device });
	return lifecycle;
}
