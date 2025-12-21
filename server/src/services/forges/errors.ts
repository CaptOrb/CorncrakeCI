import { BaseError } from "../../server/errors";

export class AuthError extends BaseError {
	constructor(message = "Unauthorised") {
		super(401, message);
	}
}

export class NotFoundError extends BaseError {
	constructor(message = "Not Found") {
		super(404, message);
	}
}
