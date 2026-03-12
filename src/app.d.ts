// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}

	interface EthereumProvider {
		request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
		on: (event: string, handler: (...args: unknown[]) => void) => void;
	}

	interface SolanaProvider {
		isPhantom?: boolean;
		connect: () => Promise<{ publicKey: { toString(): string } }>;
	}

	interface TronWebProvider {
		defaultAddress?: {
			base58?: string;
		};
		trx?: {
			getBalance: (address: string) => Promise<number>;
		};
		fromSun: (amount: number) => number;
		contract: () => { at: (address: string) => Promise<any> };
	}

	interface Window {
		ethereum?: EthereumProvider;
		solana?: SolanaProvider;
		tronWeb?: TronWebProvider;
	}
}

export {};
