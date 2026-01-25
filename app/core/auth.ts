/**
 * Social Arena - Authentication Domain Layer
 * 
 * Handles user authentication and session management.
 * Server-authoritative design.
 */

import { User, UserWithoutPassword, Result, ArenaError, ErrorCodes } from './types';
import { store } from './store';

// ============================================================================
// AUTHENTICATION STATE
// ============================================================================

let currentUser: User | null = null;

export function getCurrentUser(): User | null {
  return currentUser;
}

export function setCurrentUser(user: User | null): void {
  currentUser = user;
}

// ============================================================================
// AUTHENTICATION FUNCTIONS
// ============================================================================

/**
 * Register a new user
 */
export function signup(
  email: string,
  password: string,
  username: string
): Result<UserWithoutPassword, ArenaError> {
  // Validation
  if (!email || !password || !username) {
    return {
      success: false,
      error: new ArenaError(
        'Email, password, and username are required',
        ErrorCodes.INVALID_INPUT
      ),
    };
  }

  if (username.length < 3 || username.length > 20) {
    return {
      success: false,
      error: new ArenaError(
        'Username must be 3-20 characters',
        ErrorCodes.INVALID_INPUT
      ),
    };
  }

  if (!/^[a-zA-Z0-9_@]+$/.test(username)) {
    return {
      success: false,
      error: new ArenaError(
        'Username can only contain letters, numbers, underscores, and @',
        ErrorCodes.INVALID_INPUT
      ),
    };
  }

  // Check if email exists
  const existingUserByEmail = store.getUserByEmail(email);
  if (existingUserByEmail) {
    return {
      success: false,
      error: new ArenaError(
        'Email already registered',
        ErrorCodes.EMAIL_EXISTS
      ),
    };
  }

  // Check if username exists
  const existingUserByUsername = store.getUserByUsername(username);
  if (existingUserByUsername) {
    return {
      success: false,
      error: new ArenaError(
        'Username already taken',
        ErrorCodes.USERNAME_EXISTS
      ),
    };
  }

  // Create user (in production, password would be hashed)
  const password_hash = `hashed:${password}`; // Placeholder - use bcrypt/argon2 in production
  
  const user = store.createUser({
    email,
    password_hash,
    username,
    created_at: new Date(),
    updated_at: new Date(),
  });

  // Set as current user
  setCurrentUser(user);

  // Return user without password
  const { password_hash: _, ...userWithoutPassword } = user;
  return {
    success: true,
    data: userWithoutPassword,
  };
}

/**
 * Login with email and password
 */
export function login(
  email: string,
  password: string
): Result<UserWithoutPassword, ArenaError> {
  // Validation
  if (!email || !password) {
    return {
      success: false,
      error: new ArenaError(
        'Email and password are required',
        ErrorCodes.INVALID_INPUT
      ),
    };
  }

  // Find user by email
  const user = store.getUserByEmail(email);
  if (!user) {
    return {
      success: false,
      error: new ArenaError(
        'Invalid email or password',
        ErrorCodes.INVALID_CREDENTIALS
      ),
    };
  }

  // Verify password (in production, use bcrypt/argon2)
  const expectedHash = `hashed:${password}`;
  if (user.password_hash !== expectedHash) {
    return {
      success: false,
      error: new ArenaError(
        'Invalid email or password',
        ErrorCodes.INVALID_CREDENTIALS
      ),
    };
  }

  // Update last seen
  store.updateUser(user.id, { last_seen_at: new Date() });

  // Set as current user
  setCurrentUser(user);

  // Return user without password
  const { password_hash: _, ...userWithoutPassword } = user;
  return {
    success: true,
    data: userWithoutPassword,
  };
}

/**
 * Logout current user
 */
export function logout(): void {
  setCurrentUser(null);
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated(): boolean {
  return currentUser !== null;
}

/**
 * Require authentication (throws if not authenticated)
 */
export function requireAuth(): User {
  if (!currentUser) {
    throw new ArenaError(
      'Authentication required',
      ErrorCodes.UNAUTHORIZED
    );
  }
  return currentUser;
}

