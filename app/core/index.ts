/**
 * Social Arena - Core Engine
 * 
 * Main entry point for the core engine layer.
 * This is a headless game engine that enforces all invariants.
 */

// Export types
export * from './types';

// Export store (for testing/debugging)
export { store } from './store';

// Export domain functions
export * from './auth';
export * from './rooms';
export * from './arenas';
export * from './participants';
export * from './location';
export * from './proximity';
// TEMPORARY: Development/testing only - Remove when ready for production
export * from './cache';

