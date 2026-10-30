const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** 16-character id, the same length Foundry uses for document ids. */
export function makeId(length = 16): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let id = "";
  for (const byte of bytes) id += ALPHABET[byte % ALPHABET.length];
  return id;
}

/** Deterministic ids for tests. */
export function sequenceIds(prefix = "id"): () => string {
  let n = 0;
  return () => {
    n += 1;
    return `${prefix}${String(n).padStart(12, "0")}`.slice(0, 16);
  };
}
