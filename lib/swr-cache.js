/**
 * Stale-while-revalidate in-memory cache.
 * Fresh hits return immediately; stale hits return cached value and refresh in background.
 */

/**
 * @param {{ name?: string }} [opts]
 */
export const createSwrCache = ({ name = 'swr' } = {}) => {
    /** @type {Map<string, { value: any, fetchedAt: number }>} */
    const store = new Map();
    /** @type {Map<string, Promise<any>>} */
    const inflight = new Map();

    const revalidate = async (key, fetcher) => {
        if (inflight.has(key)) return inflight.get(key);
        const pending = Promise.resolve()
            .then(() => fetcher())
            .then((value) => {
                if (value !== undefined) {
                    store.set(key, { value, fetchedAt: Date.now() });
                }
                inflight.delete(key);
                return value;
            })
            .catch((error) => {
                inflight.delete(key);
                throw error;
            });
        inflight.set(key, pending);
        return pending;
    };

    /**
     * @param {string} key
     * @param {() => Promise<any>} fetcher
     * @param {{ freshMs?: number, staleMs?: number }} [opts]
     * @returns {Promise<{ value: any, stale: boolean, ageMs: number }>}
     */
    const get = async (key, fetcher, { freshMs = 8_000, staleMs = 45_000 } = {}) => {
        const now = Date.now();
        const entry = store.get(key);
        if (entry) {
            const ageMs = Math.max(0, now - entry.fetchedAt);
            if (ageMs < freshMs) {
                return { value: entry.value, stale: false, ageMs };
            }
            if (ageMs < staleMs) {
                void revalidate(key, fetcher).catch(() => null);
                return { value: entry.value, stale: true, ageMs };
            }
        }

        try {
            const value = await revalidate(key, fetcher);
            return { value, stale: false, ageMs: 0 };
        } catch (error) {
            // Hard miss with a failed refresh — last-known value beats empty if we have one.
            if (entry) {
                return {
                    value: entry.value,
                    stale: true,
                    ageMs: Math.max(0, now - entry.fetchedAt),
                };
            }
            throw error;
        }
    };

    const put = (key, value) => {
        if (value === undefined) return false;
        store.set(key, { value, fetchedAt: Date.now() });
        return true;
    };

    const peek = (key) => store.get(key) || null;

    const del = (key) => {
        store.delete(key);
        inflight.delete(key);
    };

    const clear = () => {
        store.clear();
        inflight.clear();
    };

    const stats = () => ({
        name,
        size: store.size,
        inflight: inflight.size,
    });

    return {
        get,
        put,
        peek,
        revalidate,
        delete: del,
        clear,
        stats,
    };
};

export default createSwrCache;
