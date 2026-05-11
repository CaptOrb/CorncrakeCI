import { main } from "./server";

import { createLogger } from "./util/logging";

const log = createLogger(import.meta.url);

main().catch((err) => {
	log.fatal({ err }, "Failed to start");
	process.exit(1);
});
