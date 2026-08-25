// Test-only stand-in for the `server-only` package.
//
// `server-only` throws when resolved under its `browser` export condition,
// which Vitest's jsdom environment picks by default. Route/lib tests here
// import server modules directly (there's no real browser bundling step to
// separate client from server code), so that condition is the wrong one to
// honor in tests: it would fail every test that transitively imports a
// module guarded by `import 'server-only'`, not just genuine client-bundle
// leaks. This file is aliased over `server-only` in vitest.config.ts.
export {};
