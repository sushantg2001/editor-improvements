// A small DevTools Protocol client for the isolated test instance.
import type { KeyParams } from "./keys";

export interface Target {
	id: string;
	type: string;
	url: string;
	title: string;
	webSocketDebuggerUrl: string;
}

interface Message {
	id?: number;
	method?: string;
	params?: { exceptionDetails?: ExceptionDetails };
	result?: unknown;
	error?: unknown;
}

interface ExceptionDetails {
	text?: string;
	exception?: { description?: string };
}

interface EvalResult {
	result: { value?: unknown };
	exceptionDetails?: ExceptionDetails;
}

const REQUEST_TIMEOUT_MS = 20_000;

export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Lists the debugging targets of the instance on `port`. */
export async function listTargets(port: number): Promise<Target[]> {
	const response = await fetch(`http://127.0.0.1:${port}/json/list`);
	return (await response.json()) as Target[];
}

const describe = (details: ExceptionDetails): string => details.exception?.description ?? details.text ?? "unknown error";

/** One connected page: the main window or a popout. */
export class Page {
	/** Uncaught exceptions seen in this page since it was connected. */
	readonly exceptions: string[] = [];
	private nextId = 0;
	private readonly pending = new Map<number, { resolve: (m: Message) => void; reject: (e: Error) => void }>();

	private constructor(private readonly ws: WebSocket) {
		ws.onmessage = (event) => this.receive(JSON.parse(String(event.data)) as Message);
		ws.onclose = () => {
			for (const { reject } of this.pending.values()) reject(new Error("page connection closed"));
			this.pending.clear();
		};
	}

	/** Connects to the first page target that `match` accepts. */
	static async connect(port: number, match: (target: Target) => boolean): Promise<Page> {
		const target = (await listTargets(port)).find((t) => t.type === "page" && match(t));
		if (!target) throw new Error("no matching page target");
		const ws = new WebSocket(target.webSocketDebuggerUrl);
		await new Promise<void>((resolve, reject) => {
			ws.onopen = () => resolve();
			ws.onerror = () => reject(new Error("could not connect to the page"));
		});
		const page = new Page(ws);
		await page.send("Runtime.enable");
		await page.send("Page.enable");
		// Lets checks run while another window holds the OS focus.
		await page.setFocusEmulation(true);
		return page;
	}

	private receive(message: Message): void {
		if (message.method === "Runtime.exceptionThrown" && message.params?.exceptionDetails) {
			this.exceptions.push(describe(message.params.exceptionDetails));
		}
		if (message.id === undefined) return;
		const waiter = this.pending.get(message.id);
		if (!waiter) return;
		this.pending.delete(message.id);
		waiter.resolve(message);
	}

	/** Sends one protocol command and returns its result. */
	async send<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
		const id = ++this.nextId;
		const reply = new Promise<Message>((resolve, reject) => {
			this.pending.set(id, { resolve, reject });
			this.ws.send(JSON.stringify({ id, method, params }));
		});
		let timer: ReturnType<typeof setTimeout> | undefined;
		const timeout = new Promise<never>((_, reject) => {
			timer = setTimeout(() => {
				this.pending.delete(id);
				reject(new Error(`${method}: timed out`));
			}, REQUEST_TIMEOUT_MS);
		});
		try {
			const message = await Promise.race([reply, timeout]);
			if (message.error) throw new Error(`${method}: ${JSON.stringify(message.error)}`);
			return message.result as T;
		} finally {
			clearTimeout(timer);
		}
	}

	/** Evaluates an expression in the page and awaits it. */
	async eval<T = unknown>(expression: string): Promise<T> {
		const reply = await this.send<EvalResult>("Runtime.evaluate", {
			expression,
			awaitPromise: true,
			returnByValue: true,
		});
		if (reply.exceptionDetails) throw new Error(`eval: ${describe(reply.exceptionDetails)}`);
		return reply.result.value as T;
	}

	/** A trusted key press: down, then up. */
	async key(params: KeyParams, options: { repeat?: boolean; commands?: string[] } = {}): Promise<void> {
		const base = {
			key: params.key,
			code: params.code,
			windowsVirtualKeyCode: params.vk,
			nativeVirtualKeyCode: params.vk,
			modifiers: params.mods,
		};
		await this.send("Input.dispatchKeyEvent", {
			type: params.text ? "keyDown" : "rawKeyDown",
			...base,
			text: params.text,
			unmodifiedText: params.text,
			autoRepeat: options.repeat ?? false,
			commands: options.commands,
		});
		await this.send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
	}

	/** Makes the page believe it has focus. Real-key checks switch this off. */
	async setFocusEmulation(enabled: boolean): Promise<void> {
		await this.send("Emulation.setFocusEmulationEnabled", { enabled });
	}

	close(): void {
		this.ws.close();
	}
}
