# Social Arena - State Machine Design

## Arena State Machine

### States

```
┌─────────┐
│ LOBBY   │ ← Initial state, accepting players
└────┬────┘
     │
     │ Host starts arena
     ▼
┌─────────┐
│ ACTIVE  │ ← Game running, locked, no new players
└────┬────┘
     │
     │ Game ends (timeout/capture/host ends)
     ▼
┌─────────┐
│ ENDED   │ ← Final state, read-only
└─────────┘
```

### State Transitions

| From State | To State | Trigger | Conditions | Side Effects |
|------------|----------|---------|------------|--------------|
| `lobby` | `active` | Host calls `startArena()` | • Host is participant<br>• At least 1 prey<br>• 1-12 hunters<br>• No other active arena in room | • Lock arena (no new joins)<br>• Set `started_at`<br>• Start prey BLE broadcast<br>• Start game timer |
| `active` | `ended` | Game completion | • Capture occurs<br>• Timer expires<br>• Host ends game<br>• All players leave | • Set `ended_at`<br>• Set `winner_team`<br>• Stop BLE broadcast<br>• Finalize results |
| `lobby` | `ended` | Host cancels | • Host has permission | • Cancel arena<br>• Notify participants |

### State Properties

#### LOBBY
- **Accepting players**: ✅ Yes
- **Role assignment**: ✅ Allowed (host can change)
- **Leaving**: ✅ Allowed (can rejoin)
- **Game running**: ❌ No
- **BLE active**: ❌ No
- **Location tracking**: ⚠️ Optional (for map preview)

#### ACTIVE
- **Accepting players**: ❌ No (locked)
- **Role assignment**: ❌ No (locked)
- **Leaving**: ⚠️ Allowed but **FINAL** (cannot rejoin this session)
- **Game running**: ✅ Yes
- **BLE active**: ✅ Yes (prey broadcasting)
- **Location tracking**: ✅ Required (real-time updates)
- **Capture detection**: ✅ Active

#### ENDED
- **Accepting players**: ❌ No
- **Role assignment**: ❌ No
- **Leaving**: ❌ N/A (already ended)
- **Game running**: ❌ No
- **BLE active**: ❌ No
- **Location tracking**: ❌ No
- **Read-only**: ✅ Yes (historical data only)

---

## Participant Status State Machine

### States

```
┌──────────┐
│ JOINED   │ ← Active participant
└────┬─────┘
     │
     ├─→ Capture (hunter catches prey)
     │   ▼
     │ ┌──────────┐
     │ │ CAPTURED │
     │ └──────────┘
     │
     ├─→ Timeout (prey survives)
     │   ▼
     │ ┌──────────┐
     │ │ ESCAPED  │
     │ └──────────┘
     │
     ├─→ User leaves voluntarily
     │   ▼
     │ ┌──────────┐
     │ │ LEFT     │
     │ └──────────┘
     │
     └─→ Connection lost
         ▼
     ┌──────────┐
     │ DISCONNECTED │
     └──────────┘
```

### State Transitions

| From State | To State | Trigger | Conditions |
|------------|----------|---------|------------|
| `joined` | `captured` | Capture event | • Participant is prey<br>• Hunter in close BLE proximity<br>• Sustained for duration |
| `joined` | `escaped` | Timer expires | • Participant is prey<br>• No capture occurred<br>• Arena ends |
| `joined` | `left` | User action | • User explicitly leaves<br>• Arena is active (final) |
| `joined` | `disconnected` | Network/BLE failure | • Connection lost<br>• No heartbeat received |

### State Properties

#### JOINED
- **In game**: ✅ Yes
- **Can move**: ✅ Yes
- **BLE active**: ✅ Yes (if prey)
- **Can leave**: ✅ Yes (but final if arena is active)

#### CAPTURED
- **In game**: ❌ No (game ended)
- **Can move**: ❌ No
- **Result**: Hunters win
- **Final**: ✅ Yes

#### ESCAPED
- **In game**: ❌ No (game ended)
- **Can move**: ❌ No
- **Result**: Prey wins
- **Final**: ✅ Yes

#### LEFT
- **In game**: ❌ No
- **Can rejoin**: ❌ No (if arena was active)
- **Final**: ✅ Yes (if arena was active)

#### DISCONNECTED
- **In game**: ⚠️ Temporarily out
- **Can reconnect**: ⚠️ Maybe (if arena still active, depends on timeout)
- **Auto-recovery**: ⚠️ Possible within grace period

---

## Business Rules & Constraints

### Arena Rules

1. **One Active Arena Per Room**
   ```sql
   -- Enforced by application logic + database check
   -- Before setting arena to 'active', verify:
   SELECT COUNT(*) FROM arenas 
   WHERE room_id = ? AND status = 'active';
   -- Must be 0
   ```

2. **One Active Arena Per User**
   ```sql
   -- Before joining an arena, verify:
   SELECT COUNT(*) FROM arena_participants ap
   INNER JOIN arenas a ON ap.arena_id = a.id
   WHERE ap.user_id = ? AND a.status = 'active' AND ap.status = 'joined';
   -- Must be 0
   ```

3. **Arena Lock on Start**
   - Once `status = 'active'`, no new participants can join
   - Enforced by application logic: check status before insert

4. **Finality of Leaving Active Arena**
   - If participant leaves while `arena.status = 'active'`, they cannot rejoin
   - Set `participant.status = 'left'` and `left_at = NOW()`
   - Prevent re-insertion: check if `status = 'left'` exists for this arena+user

5. **Role Requirements (Predators Mode)**
   - Exactly 1 prey
   - 1-12 hunters
   - Enforced before transition to `active`

### Participant Rules

1. **Role Assignment**
   - Only host can assign roles (in lobby state)
   - Prey: exactly 1
   - Hunters: 2-12
   - Spectators: unlimited (optional)

2. **BLE Broadcasting**
   - Only prey broadcasts BLE
   - Starts when arena becomes `active`
   - Stops when arena becomes `ended` or prey is `captured`

3. **Location Updates**
   - Required when arena is `active`
   - Optional in `lobby` (for map preview)
   - Not required in `ended`

4. **Capture Detection**
   - Hunter must be within close BLE proximity (RSSI threshold)
   - Must be sustained for duration (e.g., 2-3 seconds)
   - Automatic (no user interaction)
   - Triggers arena end with `winner_team = 'hunters'`

---

## State Machine Implementation

### Transition Functions

```typescript
// Pseudo-code structure

function canTransitionArena(from: ArenaStatus, to: ArenaStatus): boolean {
  const validTransitions = {
    'lobby': ['active', 'ended'],
    'active': ['ended'],
    'ended': [] // Terminal state
  };
  return validTransitions[from]?.includes(to) ?? false;
}

function canJoinArena(arena: Arena, user: User): boolean {
  // Rule 1: Arena must be in lobby
  if (arena.status !== 'lobby') return false;
  
  // Rule 2: User must not be in another active arena
  const activeArena = getUserActiveArena(user.id);
  if (activeArena) return false;
  
  // Rule 3: User must be room member
  if (!isRoomMember(arena.room_id, user.id)) return false;
  
  return true;
}

function canLeaveArena(arena: Arena, participant: Participant): boolean {
  // Always allowed, but finality depends on arena status
  return true;
}

function startArena(arenaId: string, hostId: string): void {
  // Validate transition
  if (!canTransitionArena('lobby', 'active')) throw Error('Invalid transition');
  
  // Validate host
  if (arena.host_id !== hostId) throw Error('Not host');
  
  // Validate participants
  const participants = getArenaParticipants(arenaId);
  const prey = participants.filter(p => p.role === 'prey' && p.status === 'joined');
  const hunters = participants.filter(p => p.role === 'hunter' && p.status === 'joined');
  
  if (prey.length !== 1) throw Error('Must have exactly 1 prey');
  if (hunters.length < 1 || hunters.length > 12) throw Error('Must have 1-12 hunters');
  
  // Check room constraint
  const activeArenaInRoom = getActiveArenaInRoom(arena.room_id);
  if (activeArenaInRoom) throw Error('Room already has active arena');
  
  // Check user constraint
  participants.forEach(p => {
    const userActiveArena = getUserActiveArena(p.user_id);
    if (userActiveArena && userActiveArena.id !== arenaId) {
      throw Error(`User ${p.user_id} is in another active arena`);
    }
  });
  
  // Execute transition
  updateArena(arenaId, {
    status: 'active',
    started_at: NOW()
  });
  
  // Start BLE for prey
  startBLEBroadcast(prey[0].user_id);
  
  // Start game timer
  startGameTimer(arenaId, arena.duration_minutes);
}
```

---

## Event Flow: Predators Mode

### Arena Start Sequence

1. **Lobby Phase**
   - Users join arena
   - Host assigns roles (1 prey, 2-12 hunters)
   - Users can see map preview (optional location)

2. **Start Trigger**
   - Host presses "Start"
   - System validates all constraints
   - Arena transitions: `lobby` → `active`

3. **Active Phase**
   - Arena is locked (no new joins)
   - Prey begins BLE broadcast
   - All players start location tracking
   - Hunters scan for BLE signal
   - Map shows all player positions
   - Timer starts (12 minutes default)

4. **Capture Detection**
   - Hunter enters close BLE proximity
   - System monitors sustained proximity
   - If threshold met → capture event
   - Arena transitions: `active` → `ended`
   - `winner_team = 'hunters'`
   - Prey status: `captured`

5. **Timeout**
   - Timer reaches 0
   - No capture occurred
   - Arena transitions: `active` → `ended`
   - `winner_team = 'prey'`
   - Prey status: `escaped`

6. **End Phase**
   - Arena status: `ended`
   - Results displayed
   - BLE stopped
   - Location tracking stopped
   - Read-only state

---

## Error Handling & Edge Cases

### Network Disconnection
- **During lobby**: User can rejoin (status remains `joined`)
- **During active**: 
  - Grace period (e.g., 30 seconds) to reconnect
  - After grace period: status → `disconnected`
  - Cannot rejoin active arena (final)

### Host Leaves
- **In lobby**: Transfer host to another participant (admin/owner)
- **In active**: Host can end arena (emergency stop)

### All Players Leave
- **In lobby**: Arena can be cancelled
- **In active**: Arena ends with `ended_reason = 'all_left'`

### Invalid State Transitions
- Log error
- Reject transition
- Maintain current state
- Notify user of error

---

## Validation Queries

### Check if user can join arena
```sql
SELECT 
    CASE 
        WHEN a.status != 'lobby' THEN false
        WHEN EXISTS (
            SELECT 1 FROM arena_participants ap2
            INNER JOIN arenas a2 ON ap2.arena_id = a2.id
            WHERE ap2.user_id = $user_id 
            AND a2.status = 'active' 
            AND ap2.status = 'joined'
        ) THEN false
        WHEN NOT EXISTS (
            SELECT 1 FROM room_members rm
            WHERE rm.room_id = a.room_id AND rm.user_id = $user_id
        ) THEN false
        ELSE true
    END as can_join
FROM arenas a
WHERE a.id = $arena_id;
```

### Check if arena can start
```sql
SELECT 
    CASE 
        WHEN a.status != 'lobby' THEN false
        WHEN EXISTS (
            SELECT 1 FROM arenas a2
            WHERE a2.room_id = a.room_id AND a2.status = 'active'
        ) THEN false
        WHEN (
            SELECT COUNT(*) FROM arena_participants ap
            WHERE ap.arena_id = a.id 
            AND ap.role = 'prey' 
            AND ap.status = 'joined'
        ) != 1 THEN false
        WHEN (
            SELECT COUNT(*) FROM arena_participants ap
            WHERE ap.arena_id = a.id 
            AND ap.role = 'hunter' 
            AND ap.status = 'joined'
        ) NOT BETWEEN 2 AND 12 THEN false
        ELSE true
    END as can_start
FROM arenas a
WHERE a.id = $arena_id;
```

