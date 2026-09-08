import { getActiveMap, getCurrentLocation, getNearbyLocations, getSummary } from '../core/selectors.js';

/** Optional bridges register explicitly. No guessed XiaobaiX/status bar APIs. */
export function createPublicApi(store, open) {
    return Object.freeze({ version: 1, open,
        getState: store.snapshot,
        getActiveMap: () => getActiveMap(store.snapshot()),
        getCurrentLocation: () => getCurrentLocation(store.snapshot()),
        getNearbyLocations: () => getNearbyLocations(store.snapshot()),
        getSummary: () => getSummary(store.snapshot()),
        setCurrentLocation: (nodeId, mapId) => store.applyUpdate([{ type: 'setCurrentLocation', nodeId, mapId }]),
        applyUpdate: store.applyUpdate,
        subscribe: store.subscribe,
        // A bridge receives summaries only, in order; errors cannot stop core updates.
        registerSummaryAdapter(adapter) {
            if (typeof adapter?.publish !== 'function') throw new TypeError('适配器需要 publish(summary)');
            let active = true;
            let queue = Promise.resolve();
            const publish = state => {
                const summary = getSummary(state);
                queue = queue.then(() => active ? adapter.publish(summary) : undefined)
                    .catch(error => console.error('[DynamicMap adapter]', error));
            };
            const unsubscribe = store.subscribe(publish);
            publish(store.snapshot());
            return () => { active = false; unsubscribe(); };
        },
    });
}
