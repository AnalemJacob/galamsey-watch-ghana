const name = "galamsey-watch-ghana";
const store = "examples";

function database() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(store, { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transaction(mode, operation) {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const request = operation(tx.objectStore(store));
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = () => reject(tx.error ?? request.error);
    });
  } finally {
    db.close();
  }
}

export const readExamples = () => transaction("readonly", records => records.getAll());
export const saveExample = example => transaction("readwrite", records => records.put(example));
export const removeExample = id => transaction("readwrite", records => records.delete(id));
