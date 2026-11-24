export type SetupDecision = "done" | "declined";

/** What belongs to this device and must not sync with the vault. */
export interface DeviceValues {
	setup: SetupDecision;
	"builtin-vim": { previous: boolean };
	"safe-mode": { reason: string };
}

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export class DeviceState {
	constructor(private readonly appId: string, private readonly store: Store) {}

	private key(name: string): string {
		return `editor-improvements:${this.appId}:${name}`;
	}

	get<K extends keyof DeviceValues>(name: K): DeviceValues[K] | null {
		const text = this.store.getItem(this.key(name));
		if (text === null) return null;
		try {
			return JSON.parse(text) as DeviceValues[K];
		} catch {
			return null;
		}
	}

	set<K extends keyof DeviceValues>(name: K, value: DeviceValues[K]): void {
		this.store.setItem(this.key(name), JSON.stringify(value));
	}

	remove(name: keyof DeviceValues): void {
		this.store.removeItem(this.key(name));
	}
}
