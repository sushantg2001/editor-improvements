// The only file in the actions that touches Electron. Nothing here runs on mobile.

interface ElectronRemote {
	getCurrentWebContents(): { paste(): void };
}

interface ElectronShell {
	openPath(path: string): Promise<string>;
}

function nodeRequire<T>(name: string): T {
	return (window as unknown as { require(module: string): T }).require(name);
}

/** Pastes through Electron, which fires a real paste event. */
export function pasteClipboard(): void {
	nodeRequire<ElectronRemote>("@electron/remote").getCurrentWebContents().paste();
}

export function canPaste(): boolean {
	try {
		return typeof nodeRequire<ElectronRemote>("@electron/remote").getCurrentWebContents().paste === "function";
	} catch {
		return false;
	}
}

/** Opens a file in the system's default app. */
export function openExternally(path: string): void {
	void nodeRequire<{ shell: ElectronShell }>("electron").shell.openPath(path);
}
