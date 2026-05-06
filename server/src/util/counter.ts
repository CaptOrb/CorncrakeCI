import type { Brand } from "./typing";

/**
 * Generates IDs by counting up by 1.
 *
 * The IDs are of branded type.
 */
export class IdGenerator<B extends Brand<number, string>> {
	private nextId: B;
	constructor(startAt: B) {
		this.nextId = startAt;
	}

	public next(): B {
		return this.nextId++ as B;
	}
}
