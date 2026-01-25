# Social Arena - Business Rules & Constraints

## Core Rules

### 1. User Identity
- **Email**: Unique, required, validated format
- **Password**: Hashed (bcrypt/argon2), required
- **Username**: Unique, 3-20 characters, alphanumeric + underscore only
- **Identity is persistent**: User can log in from any device with same credentials

### 2. Rooms
- **Long-lived**: Rooms persist indefinitely until deleted
- **Membership**: Users can belong to multiple rooms
- **Ownership**: Each room has one owner (creator)
- **Public/Private**: Rooms can be public (discoverable) or private (invite-only)
- **Member limit**: Default 50 members per room (configurable)

### 3. Arenas
- **Session-based**: Arenas are temporary game sessions within rooms
- **Lifecycle**: `lobby` → `active` → `ended`
- **One active per room**: Only one arena can be `active` in a room at a time
- **One active per user**: A user can only participate in one `active` arena globally
- **Lock on start**: Once `active`, arena is locked (no new players)
- **Finality of leaving**: Leaving an `active` arena is permanent for that session

### 4. Arena Participants
- **Join in lobby**: Users can only join when arena is in `lobby` state
- **Role assignment**: Host assigns roles (prey, hunter, spectator)
- **Leave anytime**: Users can leave, but:
  - In `lobby`: Can rejoin
  - In `active`: Cannot rejoin (final)
- **Status tracking**: `joined`, `left`, `captured`, `escaped`, `disconnected`

---

## Predators Mode Rules

### Role Requirements
- **Prey**: Exactly 1 (required)
- **Hunters**: 1-12 (required)
- **Spectators**: Unlimited (optional)

### Game Flow
1. **Lobby**: Host assigns roles, players join
2. **Start**: Host presses start → Arena becomes `active`
3. **Active**: 
   - Prey broadcasts BLE
   - Hunters scan for BLE signal
   - All players tracked via GPS
   - Timer runs (default 12 minutes)
4. **End Conditions**:
   - **Capture**: Hunter catches prey → Hunters win
   - **Timeout**: Timer expires → Prey wins
   - **Host ends**: Manual end by host
   - **All leave**: All players leave → Arena ends

### Capture Mechanics
- **Proximity**: Hunter must be within close BLE range
- **Duration**: Proximity must be sustained (e.g., 2-3 seconds)
- **Automatic**: No user interaction required (automatic detection)
- **Triggers end**: Capture immediately ends arena with `winner_team = 'hunters'`

### BLE Broadcasting
- **Prey only**: Only prey broadcasts BLE signal
- **Starts**: When arena becomes `active`
- **Stops**: When arena becomes `ended` or prey is `captured`
- **Background**: Must work in background (iOS/Android permissions)

### Location Tracking
- **Required in active**: All players must share location when arena is `active`
- **Optional in lobby**: Can show map preview with locations
- **Real-time**: Updates every few seconds (configurable)
- **Background**: Must work in background
- **Map visibility**: All players see all players (MVP)

---

## Validation Rules

### Arena Start Validation
Before transitioning `lobby` → `active`, verify:

1. ✅ Arena status is `lobby`
2. ✅ Host is a participant
3. ✅ Exactly 1 prey (status = `joined`)
4. ✅ 1-12 hunters (status = `joined`)
5. ✅ No other active arena in the same room
6. ✅ No participant is in another active arena
7. ✅ All participants are room members

### Join Arena Validation
Before allowing user to join arena, verify:

1. ✅ Arena status is `lobby`
2. ✅ User is a member of the room
3. ✅ User is not in another active arena
4. ✅ Arena is not at capacity (if limit exists)

### Leave Arena Rules
- **In lobby**: User can leave and rejoin
- **In active**: User can leave but cannot rejoin this session
- **Status update**: Set `status = 'left'` and `left_at = NOW()`
- **Finality**: Prevent re-insertion if `status = 'left'` exists

---

## Data Integrity Constraints

### Database-Level Constraints

1. **Unique Constraints**:
   - `users.email` - Unique
   - `users.username` - Unique
   - `room_members(room_id, user_id)` - Unique
   - `arena_participants(arena_id, user_id)` - Unique

2. **Foreign Key Constraints**:
   - All foreign keys have `ON DELETE CASCADE` or `ON DELETE RESTRICT` as appropriate
   - `arenas.host_id` → `users.id` (RESTRICT - cannot delete user if they host active arena)

3. **Check Constraints**:
   - Username length: 3-20 characters
   - Username format: alphanumeric + underscore only
   - Email format: Valid email regex
   - Arena duration: 1-60 minutes
   - Location coordinates: Valid lat/lng ranges

### Application-Level Constraints

1. **One Active Arena Per Room**:
   ```typescript
   // Before setting arena to active
   const activeArena = await db.query(
     'SELECT id FROM arenas WHERE room_id = $1 AND status = $2',
     [roomId, 'active']
   );
   if (activeArena.rows.length > 0) {
     throw new Error('Room already has an active arena');
   }
   ```

2. **One Active Arena Per User**:
   ```typescript
   // Before joining arena
   const userActiveArena = await db.query(
     `SELECT a.id FROM arenas a
      INNER JOIN arena_participants ap ON a.id = ap.arena_id
      WHERE ap.user_id = $1 AND a.status = $2 AND ap.status = $3`,
     [userId, 'active', 'joined']
   );
   if (userActiveArena.rows.length > 0) {
     throw new Error('User is already in an active arena');
   }
   ```

3. **Arena Lock on Start**:
   ```typescript
   // Before allowing join
   if (arena.status !== 'lobby') {
     throw new Error('Arena is not accepting new players');
   }
   ```

4. **Finality of Leaving Active Arena**:
   ```typescript
   // Before allowing rejoin
   const existingParticipant = await db.query(
     'SELECT status FROM arena_participants WHERE arena_id = $1 AND user_id = $2',
     [arenaId, userId]
   );
   if (existingParticipant.rows.length > 0) {
     const status = existingParticipant.rows[0].status;
     if (status === 'left' && arena.status === 'active') {
       throw new Error('Cannot rejoin an active arena after leaving');
     }
   }
   ```

---

## Edge Cases & Error Handling

### Network Disconnection
- **Grace period**: 30 seconds to reconnect
- **After grace period**: Status → `disconnected`
- **Rejoin in lobby**: Allowed
- **Rejoin in active**: Not allowed (final)

### Host Leaves
- **In lobby**: Transfer host to room owner or admin
- **In active**: Host can end arena (emergency stop)
- **Host deletion**: Prevent if they host active arena (RESTRICT)

### All Players Leave
- **In lobby**: Arena can be cancelled (`status = 'ended'`, `ended_reason = 'cancelled'`)
- **In active**: Arena ends (`status = 'ended'`, `ended_reason = 'all_left'`)

### Invalid Role Assignment
- **Too many prey**: Prevent start (must be exactly 1)
- **Too few hunters**: Prevent start (must be 1-12)
- **No prey**: Prevent start
- **Role change in active**: Not allowed (locked)

### Timer Expiration
- **Automatic end**: Arena transitions to `ended`
- **Winner**: `prey` (if no capture occurred)
- **Status updates**: Prey → `escaped`, Hunters → `joined` (no change needed)

### Capture Event
- **Automatic detection**: System detects sustained proximity
- **Immediate end**: Arena transitions to `ended`
- **Winner**: `hunters`
- **Status updates**: Prey → `captured`, Capturing hunter → `joined` (no change)

---

## Security Rules

### Authentication
- Passwords must be hashed (never stored plaintext)
- Use secure session tokens (JWT or similar)
- Implement rate limiting on auth endpoints

### Authorization
- Only room members can join arenas in that room
- Only host can start arena
- Only host can assign roles (in lobby)
- Users can only modify their own data

### Data Privacy
- Location data is only visible to participants in the same arena
- BLE proximity data is only logged for active arenas
- User email is private (not exposed to other users)

---

## Performance Considerations

### Indexes
- All foreign keys are indexed
- Status fields are indexed for fast queries
- Location queries use spatial indexes (if using PostGIS)

### Query Optimization
- Use views for common queries (active arenas, user active arena)
- Batch location updates (don't update on every GPS tick)
- Cache room membership checks

### Background Processing
- BLE proximity detection runs in background service
- Location updates batched and sent periodically
- Game timer uses server-side cron or scheduled task

---

## Future Considerations

### Scalability
- Consider sharding by room_id for very large deployments
- Use message queue for real-time updates (WebSocket/SSE)
- Cache frequently accessed data (room members, active arenas)

### Additional Game Modes
- Schema supports multiple modes via `game_mode` enum
- Each mode can have different rules (stored in `settings` JSONB)
- Role requirements vary by mode

### Analytics
- BLE proximity logs for debugging and analytics
- Track game outcomes (win rates, average duration)
- Monitor user engagement (arenas per room, participation rates)

