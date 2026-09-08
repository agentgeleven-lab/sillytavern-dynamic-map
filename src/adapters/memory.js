/** Replace with load(chatKey)/save(chatKey, document) for chat persistence later. */
export function createMemoryRepository() {
    const documents = new Map();
    return {
        async load(key) { return documents.has(key) ? structuredClone(documents.get(key)) : null; },
        async save(key, document) { documents.set(key, structuredClone(document)); },
    };
}
