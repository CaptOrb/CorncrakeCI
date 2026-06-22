import { afterEach, beforeEach } from "vitest";
import { Scheduler, setGlobalScheduler } from "../../src/execution/scheduler";

/**
 * All-in-one helper for scheduler test suites.
 *
 * Sets up a fresh scheduler and registers it, for every test.
 *
 * Deregisters the scheduler after the test.
 */
export function schedulerHelper() {
	let cleanup: () => void;

	beforeEach(() => {
		const { deregister } = setGlobalScheduler(new Scheduler());
		cleanup = deregister;
	});

	afterEach(() => {
		cleanup();
	});
}
