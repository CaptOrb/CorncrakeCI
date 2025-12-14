import { main } from "./server";

main().catch((err) => {
	console.error("Failed:", err);
	process.exit(1);
});
