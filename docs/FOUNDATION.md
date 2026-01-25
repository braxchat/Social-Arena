# Social Arena - Foundation Document

> **Source of Truth** for the Social Arena system architecture and design principles.

## Core Concepts

### 1. Users
- **Identity**: Persistent user accounts with email, username, and password
- **Multi-device**: Users can log in from any device with same credentials
- **Profile**: Display name, avatar, activity tracking

### 2. Rooms
- **Long-lived communities**: Rooms persist indefinitely until deleted
- **Membership**: Users can belong to multiple rooms simultaneously
- **Ownership**: Each room has one owner (creator)
- **Visibility**: Public (discoverable) or private (invite-only)
- **Capacity**: Configurable member limit (default 50)

### 3. Arenas
- **Temporary game sessions**: Arenas are ephemeral game instances within rooms
- **Lifecycle**: `lobby` → `active` → `ended` (one-way state machine)
- **Host-controlled**: Arena host manages the session lifecycle
- **Game modes**: Support for multiple game modes (predators, outbreak, specter, duel)

### 4. Arena Participants
- **Role-based**: Each participant has a role (prey, hunter, spectator)
- **Status tracking**: `joined`, `left`, `captured`, `escaped`, `disconnected`
- **Location-aware**: Real-time GPS tracking during active games
- **BLE integration**: Prey broadcasts BLE signal for proximity detection

---

## Critical Invariants

### Invariant 1: One Active Arena Per Room
- **Rule**: Only one arena can be `active` in a room at any time
- **Rationale**: Prevents confusion, resource conflicts, and game state ambiguity
- **Enforcement**: Database constraint + application-level validation

### Invariant 2: One Active Arena Per User
- **Rule**: A user can only participate in one `active` arena globally
- **Rationale**: Prevents location/BLE conflicts, ensures fair gameplay
- **Enforcement**: Application-level validation before join/start

### Invariant 3: Arena Lock on Start
- **Rule**: Once an arena becomes `active`, no new participants can join
- **Rationale**: Ensures fair game conditions, prevents mid-game disruptions
- **Enforcement**: Status check before allowing join

### Invariant 4: Finality of Leaving Active Arena
- **Rule**: Leaving an `active` arena is permanent for that session
- **Rationale**: Prevents abuse, maintains game integrity
- **Enforcement**: Status check prevents rejoin if `status = 'left'` exists

---

## State Machine

### Arena States

```
LOBBY → ACTIVE → ENDED
```

- **LOBBY**: Accepting players, role assignment allowed, can leave/rejoin
- **ACTIVE**: Game running, locked (no new joins), leaving is final
- **ENDED**: Terminal state, read-only historical data

### Valid Transitions

| From | To | Trigger | Who |
|------|-----|---------|-----|
| `lobby` | `active` | Start game | Host only |
| `lobby` | `ended` | Cancel arena | Host only |
| `active` | `ended` | Game completion | System/Host |

---

## Game Mode: Predators

### Role Requirements
- **Prey**: Exactly 1 (required)
- **Hunters**: 1-12 (required)
- **Spectators**: Unlimited (optional)

### Game Flow
1. **Lobby**: Host assigns roles, players join
2. **Start**: Host starts → Arena becomes `active`
3. **Active**: 
   - Prey broadcasts BLE
   - Hunters scan for BLE signal
   - All players tracked via GPS
   - Timer runs (default 12 minutes)
4. **End Conditions**:
   - Capture: Hunter catches prey → Hunters win
   - Timeout: Timer expires → Prey wins
   - Host ends: Manual end
   - All leave: All players leave → Arena ends

---

## Design Principles

1. **Server-authoritative**: All state transitions and validations happen on the server
2. **Optimistic UI**: Client can show optimistic updates, but server is source of truth
3. **Conflict prevention**: Use database transactions and locks to prevent race conditions
4. **Idempotency**: API endpoints should be safe to retry
5. **Real-time updates**: Use WebSocket/SSE for state synchronization

---

## References

- [Database Schema](./database-schema.sql) - Complete PostgreSQL schema
- [State Machine](./state-machine.md) - Detailed state machine design
- [Business Rules](./business-rules.md) - Comprehensive business rules
- [Type Definitions](./types.ts) - TypeScript type definitions
- [System Design](./SYSTEM-DESIGN.md) - Detailed architecture design

