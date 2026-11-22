const MAX_FILES = 256;
const MAX_FILE = 1024 * 1024;
const MAX_TOTAL = 4 * 1024 * 1024;

export interface FileReader {
	exists(path: string): Promise<boolean>;
	list(path: string): Promise<{ files: string[]; folders: string[] }>;
	read(path: string): Promise<string>;
}

/** Reads every `.lua` file into memory, so `require` can be synchronous. Throws on a limit. */
export async function readConfigFiles(adapter: FileReader, folder: string): Promise<Map<string, string>> {
	if (!(await adapter.exists(`${folder}/init.lua`))) throw new Error(`${folder}/init.lua does not exist`);
	const files = new Map<string, string>();
	let total = 0;
	const walk = async (dir: string): Promise<void> => {
		const listing = await adapter.list(dir);
		for (const path of listing.files) {
			if (!path.endsWith(".lua")) continue;
			const name = path.slice(folder.length + 1);
			if (files.size >= MAX_FILES) throw new Error(`More than ${MAX_FILES} Lua files, at ${name}`);
			const text = await adapter.read(path);
			if (text.length > MAX_FILE) throw new Error(`${name} is larger than 1 MiB`);
			total += text.length;
			if (total > MAX_TOTAL) throw new Error(`The config is larger than 4 MiB, at ${name}`);
			files.set(name, text);
		}
		for (const child of listing.folders) await walk(child);
	};
	await walk(folder);
	return files;
}
