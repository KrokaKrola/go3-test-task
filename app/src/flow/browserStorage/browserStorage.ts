// Lazy and throw-safe: reading `sessionStorage` can itself throw (blocked site data).
export const sessionStore: Pick<Storage, 'getItem' | 'setItem'> = {
  getItem: (key) => {
    try {
      return window.sessionStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: (key, value) => {
    try {
      window.sessionStorage.setItem(key, value);
    } catch {
      // convenience copy only (Q7)
    }
  },
};
