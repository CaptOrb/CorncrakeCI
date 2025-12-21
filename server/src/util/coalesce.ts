/**
 * Coalesce concurrent requests/async function calls together.
 *
 * @param inProgress - A map to store Promises for in-progress calls.
 * @param key - A key that identifies the request that is being coalesced.
 * @param func - The function that will be called if we can't reuse another concurrent call.
 *
 * @note For keys that do not have value equality, they should first be serialised.
 */
export async function coalesceConcurrent<K, T>(
	inProgress: Map<K, Promise<T>>,
	key: K,
	func: () => Promise<T>,
): Promise<T> {
	// Note: we rely on Node.js being single-threaded here, as we will treat any contiguous
	// lines of code without `await` points as being atomic.

	const existing = inProgress.get(key);
	if (existing !== undefined) {
		// Call already in progress, reuse that one
		return await existing;
	}

	// No call in progress, we need to spawn our own.
	const promise = func();
	// Add it to the map BEFORE awaiting it
	inProgress.set(key, promise);

	try {
		return await promise;
	} finally {
		// The call finished, so other calls that come after us are no longer 'concurrent'
		// and shouldn't be coalesced with it.
		inProgress.delete(key);
	}
}
