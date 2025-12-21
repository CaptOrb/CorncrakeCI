export class BaseError extends Error {
	constructor(
		public statusCode: number,
		message: string,
	) {
		super(message);
		this.name = this.constructor.name; // ensures each subclass gets its correct name in logs
	}
}
