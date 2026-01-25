# Social Arena - System Design Architecture

> **Comprehensive system design** based on [FOUNDATION.md](./FOUNDATION.md)

This document defines the core system architecture, data models, state machine, invariants, and implementation strategy for Social Arena.

---

## 1. Data Model

### 1.1 Users

**Purpose**: Core user identity and authentication

**Fields**:
```typescript
interface User {
  id: UUID                    // Primary key, auto-generated
  email: string              // Unique, required, validated format
  password_hash: string      // Hashed (bcrypt/argon2), never exposed
  username: string           // Unique, 3-20 chars, alphanumeric + underscore
  display_name?: string      // Optional display name
  avatar_url?: string        // Optional avatar URL
  created_at: Timestamp      // Auto-set on creation
  updated_at: Timestamp      // Auto-updated on modification
  last_seen_at?: Timestamp   // Last activity timestamp
}
```

**Constraints**:
- `email`: UNIQUE, NOT NULL, format validation
- `username`: UNIQUE, NOT NULL, length 3-20, format `^[a-zA-Z0-9_]+$`
- `password_hash`: NOT NULL, never exposed to client

**Relationships**:
- One-to-many with `room_members` (user can be in multiple rooms)
- One-to-many with `arenas` (user can host multiple arenas)
- One-to-many with `arena_participants` (user can participate in multiple arenas)

**Indexes**:
- Primary key: `id`
- Unique: `email`, `username`
- Search: `username` (GIN index for fuzzy search)

---

### 1.2 Rooms

**Purpose**: Long-lived communities that host multiple arenas

**Fields**:
```typescript
interface Room {
  id: UUID                    // Primary key, auto-generated
  name: string               // Required, 1-50 characters
  description?: string       // Optional description
  owner_id: UUID             // Foreign key → users.id
  is_public: boolean         // Default: false (private)
  max_members?: number       // Default: 50, nullable
  created_at: Timestamp      // Auto-set on creation
  updated_at: Timestamp      // Auto-updated on modification
}
```

**Constraints**:
- `name`: NOT NULL, length 1-50
- `owner_id`: NOT NULL, FOREIGN KEY → `users.id` ON DELETE CASCADE
- `max_members`: Positive integer, nullable

**Relationships**:
- Many-to-one with `users` (owner)
- One-to-many with `room_members` (room has many members)
- One-to-many with `arenas` (room hosts multiple arenas)

**Indexes**:
- Primary key: `id`
- Foreign key: `owner_id`
- Public rooms: `is_public` (partial index WHERE `is_public = true`)

---

### 1.3 Arenas

**Purpose**: Temporary game sessions within rooms with lifecycle management

**Fields**:
```typescript
interface Arena {
  id: UUID                    // Primary key, auto-generated
  room_id: UUID              // Foreign key → rooms.id
  mode: GameMode             // 'predators' | 'outbreak' | 'specter' | 'duel'
  status: ArenaStatus        // 'lobby' | 'active' | 'ended'
  host_id: UUID              // Foreign key → users.id (who created/starts)
  started_at?: Timestamp     // Set when status → 'active'
  ended_at?: Timestamp       // Set when status → 'ended'
  duration_minutes: number   // Default: 12, range: 1-60
  settings: JSONB            // Game-specific settings (flexible)
  winner_team?: string       // 'hunters' | 'prey' | null
  ended_reason?: string      // 'capture' | 'timeout' | 'host_ended' | 'all_left' | 'cancelled'
  created_at: Timestamp      // Auto-set on creation
  updated_at: Timestamp      // Auto-updated on modification
}
```

**Constraints**:
- `room_id`: NOT NULL, FOREIGN KEY → `rooms.id` ON DELETE CASCADE
- `host_id`: NOT NULL, FOREIGN KEY → `users.id` ON DELETE RESTRICT
- `status`: NOT NULL, ENUM('lobby', 'active', 'ended'), DEFAULT 'lobby'
- `duration_minutes`: NOT NULL, CHECK (1 <= duration_minutes <= 60)
- `started_at` <= `ended_at` (if both set)
- `winner_team`: NULL or IN('hunters', 'prey')

**Relationships**:
- Many-to-one with `rooms` (arena belongs to one room)
- Many-to-one with `users` (arena has one host)
- One-to-many with `arena_participants` (arena has many participants)

**Critical Constraints** (enforced at application level):
- **One active arena per room**: No two arenas in same room can be `active` simultaneously
- **Status transitions**: Only valid transitions allowed (see state machine)

**Indexes**:
- Primary key: `id`
- Foreign keys: `room_id`, `host_id`
- Status: `status`
- Active arenas: `(status, room_id)` WHERE `status = 'active'` (partial index)

---

### 1.4 ArenaParticipants

**Purpose**: Players in an arena with roles, status, and location tracking

**Fields**:
```typescript
interface ArenaParticipant {
  id: UUID                    // Primary key, auto-generated
  arena_id: UUID             // Foreign key → arenas.id
  user_id: UUID              // Foreign key → users.id
  role: ParticipantRole      // 'prey' | 'hunter' | 'spectator'
  status: ParticipantStatus  // 'joined' | 'left' | 'captured' | 'escaped' | 'disconnected'
  joined_at: Timestamp       // Auto-set on creation
  left_at?: Timestamp        // Set when status → 'left'
  is_captured: boolean       // Default: false
  captured_at?: Timestamp    // Set when captured
  captured_by_user_id?: UUID // Foreign key → users.id (who captured)
  last_latitude?: number     // Last known GPS latitude (-90 to 90)
  last_longitude?: number    // Last known GPS longitude (-180 to 180)
  last_location_updated_at?: Timestamp
  is_ble_broadcasting: boolean // Default: false (true for prey when active)
  ble_started_at?: Timestamp   // When BLE broadcast started
  created_at: Timestamp        // Auto-set on creation
  updated_at: Timestamp        // Auto-updated on modification
}
```

**Constraints**:
- `arena_id`: NOT NULL, FOREIGN KEY → `arenas.id` ON DELETE CASCADE
- `user_id`: NOT NULL, FOREIGN KEY → `users.id` ON DELETE CASCADE
- `(arena_id, user_id)`: UNIQUE (user can only have one participation record per arena)
- `role`: NOT NULL, ENUM('prey', 'hunter', 'spectator')
- `status`: NOT NULL, ENUM('joined', 'left', 'captured', 'escaped', 'disconnected'), DEFAULT 'joined'
- Location validation: If `last_latitude` set, `last_longitude` must be set and vice versa
- Capture validation: If `is_captured = true`, then `captured_at` must be set

**Relationships**:
- Many-to-one with `arenas` (participant belongs to one arena)
- Many-to-one with `users` (participant is one user)
- Optional many-to-one with `users` (captured_by_user_id)

**Critical Constraints** (enforced at application level):
- **One active arena per user**: User cannot be `joined` in multiple `active` arenas
- **Finality of leaving**: If `status = 'left'` and arena is `active`, cannot rejoin
- **Role requirements**: For predators mode, exactly 1 prey, 1-12 hunters

**Indexes**:
- Primary key: `id`
- Foreign keys: `arena_id`, `user_id`
- Unique: `(arena_id, user_id)`
- Status: `status`
- Active participants: `(arena_id, status)` WHERE `status = 'joined'` (partial index)
- User active arenas: `(user_id, status)` with join to `arenas` on `status = 'active'`

---

## 2. Arena State Machine

### 2.1 State Diagram

```
┌─────────┐
│ LOBBY   │ ← Initial state, accepting players
└────┬────┘
     │
     │ Host.startArena()
     │ [Validates: roles, constraints, invariants]
     ▼
┌─────────┐
│ ACTIVE  │ ← Game running, locked, no new players
└────┬────┘
     │
     │ [Capture | Timeout | Host.endArena() | All players leave]
     ▼
┌─────────┐
│ ENDED   │ ← Terminal state, read-only
└─────────┘
```

### 2.2 State Transition Table

| From State | To State | Trigger | Who Can Trigger | Conditions | Side Effects |
|------------|----------|---------|-----------------|------------|--------------|
| `lobby` | `active` | `startArena()` | Host only | • Arena status is `lobby`<br>• Host is participant<br>• Exactly 1 prey (`joined`)<br>• 1-12 hunters (`joined`)<br>• No other `active` arena in room<br>• No participant in another `active` arena<br>• All participants are room members | • Set `status = 'active'`<br>• Set `started_at = NOW()`<br>• Lock arena (no new joins)<br>• Start prey BLE broadcast<br>• Start game timer<br>• Require location tracking |
| `lobby` | `ended` | `cancelArena()` | Host only | • Arena status is `lobby`<br>• Host has permission | • Set `status = 'ended'`<br>• Set `ended_at = NOW()`<br>• Set `ended_reason = 'cancelled'`<br>• Notify participants |
| `active` | `ended` | `endArena()` | System/Host | • Capture occurs<br>• Timer expires<br>• Host ends game<br>• All players leave | • Set `status = 'ended'`<br>• Set `ended_at = NOW()`<br>• Set `winner_team` (if applicable)<br>• Set `ended_reason`<br>• Stop BLE broadcast<br>• Stop location tracking<br>• Finalize participant statuses |

### 2.3 State Properties

#### LOBBY
- **Accepting players**: ✅ Yes
- **Role assignment**: ✅ Allowed (host can change)
- **Leaving**: ✅ Allowed (can rejoin)
- **Game running**: ❌ No
- **BLE active**: ❌ No
- **Location tracking**: ⚠️ Optional (for map preview)
- **Can start**: ✅ Yes (if validations pass)

#### ACTIVE
- **Accepting players**: ❌ No (locked)
- **Role assignment**: ❌ No (locked)
- **Leaving**: ⚠️ Allowed but **FINAL** (cannot rejoin this session)
- **Game running**: ✅ Yes
- **BLE active**: ✅ Yes (prey broadcasting)
- **Location tracking**: ✅ Required (real-time updates)
- **Capture detection**: ✅ Active
- **Can end**: ✅ Yes (by system or host)

#### ENDED
- **Accepting players**: ❌ No
- **Role assignment**: ❌ No
- **Leaving**: ❌ N/A (already ended)
- **Game running**: ❌ No
- **BLE active**: ❌ No
- **Location tracking**: ❌ No
- **Read-only**: ✅ Yes (historical data only)
- **Can transition**: ❌ No (terminal state)

---

## 3. Invariant Enforcement

### 3.1 Invariant 1: One Active Arena Per Room

**Rule**: Only one arena can be `active` in a room at any time.

**Enforcement Strategy**:

```typescript
// Pseudocode for startArena()
async function startArena(arenaId: UUID, hostId: UUID): Promise<void> {
  // Begin transaction
  await db.beginTransaction();
  
  try {
    // 1. Lock the arena row (SELECT FOR UPDATE)
    const arena = await db.query(
      `SELECT * FROM arenas WHERE id = $1 FOR UPDATE`,
      [arenaId]
    );
    
    if (!arena) throw new Error('Arena not found');
    if (arena.status !== 'lobby') throw new Error('Arena must be in lobby');
    if (arena.host_id !== hostId) throw new Error('Only host can start arena');
    
    // 2. Check for other active arena in same room (with lock)
    const activeArena = await db.query(
      `SELECT id FROM arenas 
       WHERE room_id = $1 AND status = 'active' 
       FOR UPDATE SKIP LOCKED`,
      [arena.room_id]
    );
    
    if (activeArena.length > 0) {
      throw new Error('Room already has an active arena');
    }
    
    // 3. Validate participants (roles, constraints)
    const participants = await db.query(
      `SELECT role, status FROM arena_participants 
       WHERE arena_id = $1 AND status = 'joined'`,
      [arenaId]
    );
    
    const prey = participants.filter(p => p.role === 'prey');
    const hunters = participants.filter(p => p.role === 'hunter');
    
    if (prey.length !== 1) throw new Error('Must have exactly 1 prey');
    if (hunters.length < 1 || hunters.length > 12) {
      throw new Error('Must have 1-12 hunters');
    }
    
    // 4. Check each participant is not in another active arena
    const participantUserIds = participants.map(p => p.user_id);
    const conflictingArenas = await db.query(
      `SELECT DISTINCT a.id, a.room_id 
       FROM arenas a
       INNER JOIN arena_participants ap ON a.id = ap.arena_id
       WHERE ap.user_id = ANY($1::UUID[])
         AND a.status = 'active'
         AND ap.status = 'joined'
         AND a.id != $2`,
      [participantUserIds, arenaId]
    );
    
    if (conflictingArenas.length > 0) {
      throw new Error('Some participants are in another active arena');
    }
    
    // 5. All validations passed - execute transition
    await db.query(
      `UPDATE arenas 
       SET status = 'active', started_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [arenaId]
    );
    
    // 6. Start BLE broadcast for prey
    await db.query(
      `UPDATE arena_participants
       SET is_ble_broadcasting = true, ble_started_at = NOW()
       WHERE arena_id = $1 AND role = 'prey' AND status = 'joined'`,
      [arenaId]
    );
    
    // 7. Schedule game timer (background job)
    scheduleGameTimer(arenaId, arena.duration_minutes);
    
    // Commit transaction
    await db.commit();
    
    // 8. Notify all participants (WebSocket/SSE)
    notifyArenaStateChange(arenaId, 'active');
    
  } catch (error) {
    await db.rollback();
    throw error;
  }
}
```

**Conflict Prevention**:
- **Database-level**: Use `SELECT FOR UPDATE` to lock arena row during transition
- **Application-level**: Check for active arena in room before transition
- **Race condition handling**: `FOR UPDATE SKIP LOCKED` prevents deadlocks

---

### 3.2 Invariant 2: One Active Arena Per User

**Rule**: A user can only participate in one `active` arena globally.

**Enforcement Strategy**:

```typescript
// Pseudocode for joinArena()
async function joinArena(arenaId: UUID, userId: UUID): Promise<void> {
  // Begin transaction
  await db.beginTransaction();
  
  try {
    // 1. Lock the arena row
    const arena = await db.query(
      `SELECT * FROM arenas WHERE id = $1 FOR UPDATE`,
      [arenaId]
    );
    
    if (!arena) throw new Error('Arena not found');
    
    // 2. Check arena is in lobby (Invariant 3: Arena Lock on Start)
    if (arena.status !== 'lobby') {
      throw new Error('Arena is not accepting new players');
    }
    
    // 3. Check user is room member
    const isMember = await db.query(
      `SELECT 1 FROM room_members 
       WHERE room_id = $1 AND user_id = $2`,
      [arena.room_id, userId]
    );
    
    if (!isMember) {
      throw new Error('User is not a member of this room');
    }
    
    // 4. Check user is not already in another active arena (Invariant 2)
    const userActiveArena = await db.query(
      `SELECT a.id, a.room_id 
       FROM arenas a
       INNER JOIN arena_participants ap ON a.id = ap.arena_id
       WHERE ap.user_id = $1 
         AND a.status = 'active' 
         AND ap.status = 'joined'
       FOR UPDATE SKIP LOCKED`,
      [userId]
    );
    
    if (userActiveArena.length > 0) {
      throw new Error('User is already in an active arena');
    }
    
    // 5. Check if user already participated and left (Invariant 4: Finality)
    const existingParticipant = await db.query(
      `SELECT status FROM arena_participants 
       WHERE arena_id = $1 AND user_id = $2`,
      [arenaId, userId]
    );
    
    if (existingParticipant.length > 0) {
      const status = existingParticipant[0].status;
      if (status === 'left' && arena.status === 'active') {
        throw new Error('Cannot rejoin an active arena after leaving');
      }
      // If in lobby and status is 'left', allow rejoin by updating status
      if (status === 'left' && arena.status === 'lobby') {
        await db.query(
          `UPDATE arena_participants
           SET status = 'joined', left_at = NULL, updated_at = NOW()
           WHERE arena_id = $1 AND user_id = $2`,
          [arenaId, userId]
        );
        await db.commit();
        return;
      }
      // If already joined, return success (idempotent)
      await db.commit();
      return;
    }
    
    // 6. Insert new participant
    await db.query(
      `INSERT INTO arena_participants 
       (arena_id, user_id, role, status, joined_at)
       VALUES ($1, $2, $3, 'joined', NOW())`,
      [arenaId, userId, 'spectator'] // Default role, host can change
    );
    
    await db.commit();
    
    // 7. Notify participants
    notifyArenaParticipantChange(arenaId, userId, 'joined');
    
  } catch (error) {
    await db.rollback();
    throw error;
  }
}
```

**Conflict Prevention**:
- **Database-level**: `FOR UPDATE SKIP LOCKED` on user's active arena check
- **Application-level**: Validate before insert
- **Idempotency**: Safe to call multiple times (returns success if already joined)

---

### 3.3 Invariant 3: Arena Lock on Start

**Rule**: Once an arena becomes `active`, no new participants can join.

**Enforcement Strategy**:

```typescript
// Pseudocode for joinArena() - status check
async function joinArena(arenaId: UUID, userId: UUID): Promise<void> {
  // ... (see Invariant 2 for full code)
  
  // Critical check: Arena must be in lobby
  if (arena.status !== 'lobby') {
    throw new Error('Arena is not accepting new players');
  }
  
  // ... rest of join logic
}
```

**Conflict Prevention**:
- **Status check**: Always check `arena.status === 'lobby'` before allowing join
- **Atomic transition**: Status change happens in transaction with lock
- **Client-side**: UI should disable join button when status is not `lobby`

---

### 3.4 Invariant 4: Finality of Leaving Active Arena

**Rule**: Leaving an `active` arena is permanent for that session.

**Enforcement Strategy**:

```typescript
// Pseudocode for leaveArena()
async function leaveArena(arenaId: UUID, userId: UUID): Promise<void> {
  // Begin transaction
  await db.beginTransaction();
  
  try {
    // 1. Get arena and participant
    const arena = await db.query(
      `SELECT status FROM arenas WHERE id = $1`,
      [arenaId]
    );
    
    const participant = await db.query(
      `SELECT * FROM arena_participants 
       WHERE arena_id = $1 AND user_id = $2`,
      [arenaId, userId]
    );
    
    if (!participant) throw new Error('Participant not found');
    if (participant.status === 'left') {
      // Already left, return success (idempotent)
      await db.commit();
      return;
    }
    
    // 2. Update participant status
    await db.query(
      `UPDATE arena_participants
       SET status = 'left', left_at = NOW(), updated_at = NOW()
       WHERE arena_id = $1 AND user_id = $2`,
      [arenaId, userId]
    );
    
    // 3. If arena is active and this was the prey, stop BLE
    if (arena.status === 'active' && participant.role === 'prey') {
      await db.query(
        `UPDATE arena_participants
         SET is_ble_broadcasting = false
         WHERE arena_id = $1 AND user_id = $2`,
        [arenaId, userId]
      );
    }
    
    // 4. Check if all players left (end arena)
    const remainingPlayers = await db.query(
      `SELECT COUNT(*) FROM arena_participants
       WHERE arena_id = $1 AND status = 'joined'`,
      [arenaId]
    );
    
    if (remainingPlayers[0].count === 0 && arena.status === 'active') {
      await db.query(
        `UPDATE arenas
         SET status = 'ended', ended_at = NOW(), ended_reason = 'all_left', updated_at = NOW()
         WHERE id = $1`,
        [arenaId]
      );
    }
    
    await db.commit();
    
    // 5. Notify participants
    notifyArenaParticipantChange(arenaId, userId, 'left');
    
  } catch (error) {
    await db.rollback();
    throw error;
  }
}

// Pseudocode for joinArena() - prevent rejoin after leaving active
async function joinArena(arenaId: UUID, userId: UUID): Promise<void> {
  // ... (see Invariant 2)
  
  // Check if user left an active arena
  const existingParticipant = await db.query(
    `SELECT ap.status, a.status as arena_status
     FROM arena_participants ap
     INNER JOIN arenas a ON ap.arena_id = a.id
     WHERE ap.arena_id = $1 AND ap.user_id = $2`,
    [arenaId, userId]
  );
  
  if (existingParticipant.length > 0) {
    const { status, arena_status } = existingParticipant[0];
    if (status === 'left' && arena_status === 'active') {
      throw new Error('Cannot rejoin an active arena after leaving');
    }
  }
  
  // ... rest of join logic
}
```

**Conflict Prevention**:
- **Status check**: Check `participant.status === 'left'` and `arena.status === 'active'` before allowing rejoin
- **Database constraint**: `UNIQUE(arena_id, user_id)` prevents duplicate records
- **Application logic**: Explicit check prevents reinsertion

---

## 4. Architecture: Client vs Server

### 4.1 Server-Authoritative Design

**Principle**: All state transitions and validations happen on the server. The server is the single source of truth.

**Rationale**:
- Prevents cheating and manipulation
- Ensures consistency across all clients
- Centralized validation logic
- Easier to audit and debug

### 4.2 Client Responsibilities

**Client (Mobile App)**:
- **UI/UX**: Display current state, handle user interactions
- **Optimistic updates**: Show immediate feedback, but sync with server
- **Real-time sync**: Subscribe to WebSocket/SSE for state changes
- **Location tracking**: Send GPS updates to server
- **BLE operations**: Broadcast (prey) or scan (hunters) as directed by server
- **Error handling**: Display server errors, retry failed operations

**Client should NOT**:
- ❌ Make state transitions directly
- ❌ Bypass validation
- ❌ Cache state without server confirmation
- ❌ Assume state without verification

### 4.3 Server Responsibilities

**Server (Backend API)**:
- **State management**: All arena state transitions
- **Validation**: All business rules and invariants
- **Conflict resolution**: Handle race conditions, prevent double-starts
- **Real-time updates**: Broadcast state changes to all clients
- **Game logic**: Timer management, capture detection, win conditions
- **Data persistence**: All database operations
- **Security**: Authentication, authorization, rate limiting

---

## 5. Conflict Prevention

### 5.1 Double-Start Prevention

**Problem**: Multiple clients try to start the same arena simultaneously.

**Solution**:
```typescript
// Use database row locking
async function startArena(arenaId: UUID, hostId: UUID): Promise<void> {
  await db.beginTransaction();
  
  try {
    // Lock the arena row - only one transaction can proceed
    const arena = await db.query(
      `SELECT * FROM arenas WHERE id = $1 FOR UPDATE`,
      [arenaId]
    );
    
    // Check status again (after lock acquired)
    if (arena.status !== 'lobby') {
      throw new Error('Arena is not in lobby state');
    }
    
    // Proceed with transition...
    // Other concurrent requests will wait for lock, then see status is 'active'
    
    await db.commit();
  } catch (error) {
    await db.rollback();
    throw error;
  }
}
```

**Mechanism**:
- `SELECT FOR UPDATE` locks the row until transaction commits
- Concurrent requests wait for lock, then see updated status
- Transaction isolation ensures atomicity

### 5.2 Race Condition Prevention

**Problem**: Multiple users try to join simultaneously, or join while arena is starting.

**Solution**:
```typescript
// Use SKIP LOCKED to prevent deadlocks
async function joinArena(arenaId: UUID, userId: UUID): Promise<void> {
  await db.beginTransaction();
  
  try {
    // Lock arena row
    const arena = await db.query(
      `SELECT * FROM arenas WHERE id = $1 FOR UPDATE`,
      [arenaId]
    );
    
    // Check user's active arena with SKIP LOCKED
    const userActiveArena = await db.query(
      `SELECT a.id FROM arenas a
       INNER JOIN arena_participants ap ON a.id = ap.arena_id
       WHERE ap.user_id = $1 AND a.status = 'active' AND ap.status = 'joined'
       FOR UPDATE SKIP LOCKED`,
      [userId]
    );
    
    // If another transaction is processing this user's join, skip and retry
    // This prevents deadlocks
    
    // ... rest of join logic
  } catch (error) {
    await db.rollback();
    throw error;
  }
}
```

**Mechanism**:
- `FOR UPDATE SKIP LOCKED`: Skip rows locked by other transactions
- Prevents deadlocks in concurrent scenarios
- Client can retry if needed

### 5.3 Idempotency

**Problem**: Network retries cause duplicate operations.

**Solution**:
```typescript
// Make operations idempotent
async function joinArena(arenaId: UUID, userId: UUID): Promise<void> {
  // Check if already joined
  const existing = await db.query(
    `SELECT status FROM arena_participants 
     WHERE arena_id = $1 AND user_id = $2`,
    [arenaId, userId]
  );
  
  if (existing.length > 0 && existing[0].status === 'joined') {
    // Already joined, return success (idempotent)
    return;
  }
  
  // ... proceed with join
}
```

**Mechanism**:
- Check current state before operation
- Return success if already in desired state
- Safe to retry on network errors

---

## 6. Minimal API Surface

### 6.1 Arena Management

```typescript
// Create arena (host only)
POST /api/rooms/:roomId/arenas
Body: { mode: GameMode, duration_minutes?: number, settings?: JSONB }
Response: { arena: Arena }

// Get arena details
GET /api/arenas/:arenaId
Response: { arena: Arena, participants: ArenaParticipant[] }

// Start arena (host only)
POST /api/arenas/:arenaId/start
Response: { arena: Arena }

// End arena (host or system)
POST /api/arenas/:arenaId/end
Body: { reason?: string }
Response: { arena: Arena }

// Cancel arena (host only, lobby state)
POST /api/arenas/:arenaId/cancel
Response: { arena: Arena }
```

### 6.2 Participant Management

```typescript
// Join arena
POST /api/arenas/:arenaId/join
Response: { participant: ArenaParticipant }

// Leave arena
POST /api/arenas/:arenaId/leave
Response: { participant: ArenaParticipant }

// Assign role (host only, lobby state)
POST /api/arenas/:arenaId/participants/:userId/role
Body: { role: ParticipantRole }
Response: { participant: ArenaParticipant }
```

### 6.3 Game State

```typescript
// Update location (active arena only)
POST /api/arenas/:arenaId/location
Body: { latitude: number, longitude: number }
Response: { participant: ArenaParticipant }

// Report BLE proximity (hunter only, active arena)
POST /api/arenas/:arenaId/ble-proximity
Body: { broadcaster_user_id: UUID, rssi: number }
Response: { logged: boolean }

// Get game state (real-time)
GET /api/arenas/:arenaId/state
Response: { 
  arena: Arena, 
  participants: ArenaParticipant[],
  time_remaining_seconds: number 
}
```

### 6.4 Real-Time Updates

```typescript
// WebSocket connection
WS /api/arenas/:arenaId/stream

// Events:
// - arena.state_changed: { arena: Arena }
// - participant.joined: { participant: ArenaParticipant }
// - participant.left: { participant: ArenaParticipant }
// - participant.captured: { participant: ArenaParticipant, captured_by: UUID }
// - location.updated: { user_id: UUID, latitude: number, longitude: number }
// - game.ended: { arena: Arena, winner_team: string }
```

---

## 7. Resilience in Real-World Multiplayer Conditions

### 7.1 Network Failures

**Problem**: Client loses connection during active game.

**Solution**:
- **Grace period**: 30 seconds to reconnect before marking `disconnected`
- **State sync**: On reconnect, client fetches current state from server
- **Heartbeat**: Client sends periodic heartbeat; server marks `disconnected` if missing
- **Recovery**: If reconnected within grace period, resume game; otherwise, final

### 7.2 Concurrent Operations

**Problem**: Multiple clients perform conflicting operations simultaneously.

**Solution**:
- **Database transactions**: All state changes in transactions
- **Row locking**: `SELECT FOR UPDATE` prevents concurrent modifications
- **Optimistic locking**: Use `updated_at` timestamps to detect conflicts
- **Idempotency**: Operations safe to retry

### 7.3 Partial Failures

**Problem**: Server crashes or database becomes unavailable.

**Solution**:
- **Transaction rollback**: Failed operations don't leave inconsistent state
- **State recovery**: On restart, check for active arenas and resume timers
- **Health checks**: Monitor arena states, auto-end stuck arenas
- **Audit logs**: Track all state transitions for debugging

### 7.4 Scale Considerations

**Problem**: System needs to handle many concurrent arenas and users.

**Solution**:
- **Indexes**: Optimized queries for active arena checks
- **Partial indexes**: `WHERE status = 'active'` reduces index size
- **Connection pooling**: Efficient database connection management
- **Caching**: Cache room memberships, active arena lookups
- **Sharding**: Future: shard by `room_id` for very large scale

### 7.5 Data Consistency

**Problem**: Ensuring invariants hold even under concurrent load.

**Solution**:
- **Database constraints**: UNIQUE constraints prevent duplicates
- **Application validation**: Double-check invariants before transitions
- **Atomic operations**: Transactions ensure all-or-nothing updates
- **Validation queries**: Explicit checks before state changes

---

## 8. Summary

This system design provides:

1. **Clear data models** with types, relationships, and constraints
2. **Robust state machine** with valid transitions and side effects
3. **Invariant enforcement** through database and application logic
4. **Conflict prevention** using transactions, locks, and idempotency
5. **Minimal API surface** for client-server communication
6. **Resilience** to network failures, concurrent operations, and scale

The design is **server-authoritative**, ensuring consistency and preventing cheating, while providing **optimistic UI** capabilities on the client for better user experience.

---

## References

- [FOUNDATION.md](./FOUNDATION.md) - Source of truth
- [Database Schema](./database-schema.sql) - Complete SQL schema
- [State Machine](./state-machine.md) - Detailed state machine
- [Business Rules](./business-rules.md) - Business rules and constraints
- [Type Definitions](./types.ts) - TypeScript types

