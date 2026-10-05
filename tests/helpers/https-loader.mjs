// tests/helpers/https-loader.mjs
// Node.js loader hook to stub out browser https:// CDN imports in Node test environment

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('https://')) {
    const mockCode = `
      export function createClient(url, key) {
        return {
          auth: {
            getSession: async () => ({ data: { session: null }, error: null }),
            signInWithPassword: async () => ({ data: { user: null }, error: { message: 'Offline mode' } }),
            signOut: async () => ({ error: null }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
          },
          from: () => ({
            select: () => ({
              eq: () => ({
                single: async () => ({ data: null, error: null }),
                order: () => Promise.resolve({ data: [], error: null }),
              }),
            }),
          }),
        };
      }
    `;
    return {
      format: 'module',
      shortCircuit: true,
      url: 'data:text/javascript,' + encodeURIComponent(mockCode),
    };
  }
  return nextResolve(specifier, context);
}
