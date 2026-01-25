# Social Arena - Core Engine

This directory contains the headless game engine for Social Arena. It enforces all invariants and business rules defined in the foundation documents.

## Structure

```
core/
├── types.ts          # Type definitions
├── store.ts          # In-memory state store (temporary, will be replaced by API)
├── auth.ts           # Authentication domain layer
├── rooms.ts          # Rooms domain layer
├── arenas.ts         # Arena lifecycle and state machine
├── participants.ts   # Participant join/leave logic
├── index.ts          # Main entry point
└── README.md         # This file
```

## Usage

```typescript
import {
  // Auth
  signup,
  login,
  logout,
  getCurrentUser,
  
  // Rooms
  createRoom,
  joinRoom,
  getUserRooms,
  
  // Arenas
  createArena,
  startArena,
  endArena,
  getArena,
  
  // Participants
  joinArena,
  leaveArena,
  assignRole,
  
  // Types
  Result,
  ArenaError,
} from './core';

// Example: Create room and start arena
const signupResult = signup('user@example.com', 'password123', 'username');
if (!signupResult.success) {
  console.error(signupResult.error);
  return;
}

const roomResult = createRoom('My Room', 'A test room');
if (!roomResult.success) {
  console.error(roomResult.error);
  return;
}

const arenaResult = createArena(roomResult.data.id, 'predators', 12);
if (!arenaResult.success) {
  console.error(arenaResult.error);
  return;
}

// Join arena
const joinResult = joinArena(arenaResult.data.id, 'hunter');
if (!joinResult.success) {
  console.error(joinResult.error);
  return;
}

// Start arena (as host)
const startResult = startArena(arenaResult.data.id);
if (!startResult.success) {
  console.error(startResult.error);
  return;
}
```

## Invariants Enforced

1. **One Active Arena Per Room**: Enforced in `createArena()` and `startArena()`
2. **One Active Arena Per User**: Enforced in `joinArena()` and `startArena()`
3. **Arena Lock on Start**: Enforced in `joinArena()` (checks status)
4. **Finality of Leaving**: Enforced in `joinArena()` (prevents rejoin if left active)

## Error Handling

All functions return `Result<T, ArenaError>`:

```typescript
type Result<T, E> = 
  | { success: true; data: T }
  | { success: false; error: E };
```

Always check `success` before accessing `data`:

```typescript
const result = createRoom('My Room');
if (result.success) {
  console.log('Room created:', result.data);
} else {
  console.error('Error:', result.error.message, result.error.code);
}
```

## State Store

The `store` is an in-memory simulation of server state. In production, this will be replaced by API calls to a real server. The store maintains:

- Users
- Rooms
- Room Members
- Arenas
- Arena Participants

All operations are synchronous and enforce invariants immediately.

## Testing

The store can be cleared for testing:

```typescript
import { store } from './core';

// Clear all state
store.clear();
```

## Next Steps

1. Replace `store` with API client
2. Add real-time subscriptions (WebSocket/SSE)
3. Add location tracking
4. Add BLE proximity detection
5. Add game timer management

