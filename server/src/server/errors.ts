export class BaseError extends Error {
	constructor(
		public statusCode: number,
		message: string,
	) {
		super(message);
		this.name = this.constructor.name; // ensures each subclass gets its correct name in logs
	}
}

export class NotImplementedError extends BaseError {
	constructor(message = "Not Implemented") {
		super(501, message);
	}
}
