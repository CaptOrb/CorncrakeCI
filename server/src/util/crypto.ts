import crypto from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_SIZE = 12;
const TAG_SIZE = 16;
const KEY_SIZE = 32;

export function encrypt(text: string, key: Buffer): Buffer {
	if (key.length !== KEY_SIZE) {
		throw new Error("wrong size key for encryption");
	}
	const iv = crypto.randomBytes(IV_SIZE);
	const cipher = crypto.createCipheriv(ALGO, key, iv);

	const payload = Buffer.from(text, "utf8");

	const encrypted = Buffer.concat([cipher.update(payload), cipher.final()]);

	return Buffer.concat([
		iv, // 12 bytes
		cipher.getAuthTag(), // 16 bytes
		encrypted, // rest
	]);
}

export function decrypt(ciphertext: Buffer, key: Buffer): string {
	if (key.length !== KEY_SIZE) {
		throw new Error("wrong size key for decryption");
	}
	if (ciphertext.length < IV_SIZE + TAG_SIZE) {
		throw new Error("ciphertext invalid");
	}
	const iv = ciphertext.subarray(0, IV_SIZE);
	const tag = ciphertext.subarray(IV_SIZE, IV_SIZE + TAG_SIZE);
	const content = ciphertext.subarray(IV_SIZE + TAG_SIZE);

	const decipher = crypto.createDecipheriv(ALGO, key, iv);
	decipher.setAuthTag(tag);

	const decrypted = Buffer.concat([decipher.update(content), decipher.final()]);

	return decrypted.toString("utf8");
}
