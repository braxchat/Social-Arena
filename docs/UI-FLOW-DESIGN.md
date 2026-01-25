# Social Arena - Minimal UI & Flow Design

> **UI/UX design** based on [FOUNDATION.md](./FOUNDATION.md) and [SYSTEM-DESIGN.md](./SYSTEM-DESIGN.md)

This document defines the minimal user interface screens, navigation flows, and interaction patterns for Social Arena MVP.

---

## Design Principles

1. **Minimal UI**: Only essential screens and actions
2. **Invariant-respecting**: UI enforces all system invariants
3. **Server-authoritative**: UI reflects server state, never overrides
4. **Real-time sync**: All screens subscribe to state changes
5. **Clear feedback**: Users always know what they can/cannot do and why

---

## Navigation Graph

```
┌─────────────┐
│   Auth      │ (Unauthenticated)
│  (Login/    │
│   Signup)   │
└──────┬──────┘
       │ Authenticated
       ▼
┌─────────────┐
│    Home     │
│   (Rooms)   │
└──────┬──────┘
       │
       ├─→ Create Room
       ├─→ Join Room (via link)
       └─→ Select Room
              │
              ▼
       ┌─────────────┐
       │  Room View  │
       └──────┬──────┘
              │
              ├─→ No Arena → Create Arena
              ├─→ Arena Lobby → Join/Assign Roles
              ├─→ Active Arena → Spectate/View
              └─→ Ended Arena → View Results
                     │
                     ▼
              ┌─────────────┐
              │   Results   │
              │  (Play Again)│
              └─────────────┘
```

---

## Screen 1: Authentication

### Purpose
Authenticate user or create new account.

### Visible State
- **Login Form**:
  - Email input
  - Password input
  - "Log In" button
  - "Sign Up" link
- **Signup Form**:
  - Email input
  - Password input
  - Username input (3-20 chars, alphanumeric + underscore)
  - "Create Account" button
  - "Log In" link
- **Error Messages**:
  - Invalid credentials
  - Email already exists
  - Username already exists
  - Validation errors (format, length)

### Primary Actions
1. **Log In**: Submit email + password → Navigate to Home
2. **Sign Up**: Submit email + password + username → Create account → Navigate to Home
3. **Toggle Form**: Switch between login/signup

### Guardrails
- Cannot proceed without valid authentication
- Username must be unique (server validates)
- Email must be unique (server validates)
- Password must meet security requirements (server validates)

### Flow Logic

```typescript
// Pseudocode: Authentication Flow
async function handleLogin(email: string, password: string) {
  try {
    const response = await api.post('/auth/login', { email, password });
    storeAuthToken(response.token);
    storeUser(response.user);
    navigateTo('/home');
  } catch (error) {
    if (error.code === 'INVALID_CREDENTIALS') {
      showError('Invalid email or password');
    } else {
      showError('Login failed. Please try again.');
    }
  }
}

async function handleSignup(email: string, password: string, username: string) {
  // Client-side validation
  if (username.length < 3 || username.length > 20) {
    showError('Username must be 3-20 characters');
    return;
  }
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    showError('Username can only contain letters, numbers, and underscores');
    return;
  }
  
  try {
    const response = await api.post('/auth/signup', { email, password, username });
    storeAuthToken(response.token);
    storeUser(response.user);
    navigateTo('/home');
  } catch (error) {
    if (error.code === 'EMAIL_EXISTS') {
      showError('Email already registered');
    } else if (error.code === 'USERNAME_EXISTS') {
      showError('Username already taken');
    } else {
      showError('Signup failed. Please try again.');
    }
  }
}
```

---

## Screen 2: Home / Rooms

### Purpose
Display all rooms user belongs to, allow creating/joining rooms.

### Visible State
- **Room List**:
  - Room name
  - Room description (if any)
  - Member count
  - Active arena indicator (if any)
  - Last activity timestamp
- **Actions**:
  - "Create Room" button
  - "Join Room" button (opens link input)
- **Empty State**:
  - "You're not in any rooms yet"
  - "Create Room" button

### Primary Actions
1. **Select Room**: Tap room → Navigate to Room View
2. **Create Room**: 
   - Show modal: Name (required), Description (optional)
   - Submit → Create room → Navigate to Room View
3. **Join Room**: 
   - Show input: Room link/ID
   - Submit → Join room → Navigate to Room View

### Guardrails
- Cannot join room if not a member (server validates)
- Cannot create room without name
- Cannot access room if not a member

### Flow Logic

```typescript
// Pseudocode: Home Screen
async function loadRooms() {
  const rooms = await api.get('/rooms');
  // Subscribe to real-time updates
  subscribeToRooms((updatedRoom) => {
    updateRoomInList(updatedRoom);
  });
  displayRooms(rooms);
}

async function createRoom(name: string, description?: string) {
  try {
    const room = await api.post('/rooms', { name, description });
    navigateTo(`/rooms/${room.id}`);
  } catch (error) {
    showError('Failed to create room');
  }
}

async function joinRoom(roomIdOrLink: string) {
  try {
    const roomId = extractRoomId(roomIdOrLink); // Parse link or use as-is
    await api.post(`/rooms/${roomId}/join`);
    navigateTo(`/rooms/${roomId}`);
  } catch (error) {
    if (error.code === 'ROOM_NOT_FOUND') {
      showError('Room not found');
    } else if (error.code === 'ALREADY_MEMBER') {
      navigateTo(`/rooms/${roomId}`); // Already member, just navigate
    } else {
      showError('Failed to join room');
    }
  }
}
```

---

## Screen 3: Room View

### Purpose
Display room information, current arena status, and primary actions.

### Visible State
- **Room Header**:
  - Room name
  - Member count
  - Member list (avatars/usernames)
- **Arena Status Section**:
  - **No Arena**: "No active arena"
  - **Lobby**: "Arena in lobby - X players"
  - **Active**: "Arena active - X players"
  - **Ended**: "Last arena ended - [Winner]"
- **Primary Actions** (context-dependent):
  - Create Arena (if no arena or ended)
  - Join Lobby (if lobby exists and user not in it)
  - View Lobby (if user in lobby)
  - Spectate (if active and user not participating)
  - Wait for next round (if active and user left)
  - View Results (if ended)

### Primary Actions
1. **Create Arena**: 
   - Show modal: Game mode (default: Predators), Duration (default: 12 min)
   - Submit → Create arena → Navigate to Arena Lobby
2. **Join Lobby**: 
   - If lobby exists and user not in it → Join → Navigate to Arena Lobby
3. **View Lobby**: 
   - If user in lobby → Navigate to Arena Lobby
4. **Spectate**: 
   - If active and user not participating → Navigate to Active Arena (spectator mode)
5. **View Results**: 
   - If ended → Navigate to Results screen

### Guardrails
- **Invariant 1**: Cannot create arena if room already has active arena
- **Invariant 2**: Cannot join lobby if user is in another active arena
- **Invariant 3**: Cannot join lobby if arena is not in `lobby` state
- Cannot create arena if not room member
- Cannot spectate if arena is not `active`

### Flow Logic

```typescript
// Pseudocode: Room View
async function loadRoom(roomId: string) {
  const room = await api.get(`/rooms/${roomId}`);
  const currentArena = await api.get(`/rooms/${roomId}/current-arena`);
  
  // Subscribe to real-time updates
  subscribeToRoom(roomId, (update) => {
    if (update.type === 'arena_created') {
      currentArena = update.arena;
    } else if (update.type === 'arena_status_changed') {
      currentArena.status = update.status;
    }
    updateUI();
  });
  
  displayRoom(room, currentArena);
  determineAvailableActions(room, currentArena);
}

function determineAvailableActions(room: Room, arena: Arena | null) {
  const user = getCurrentUser();
  const userParticipant = arena?.participants?.find(p => p.user_id === user.id);
  
  if (!arena) {
    // No arena - can create
    showAction('Create Arena');
  } else if (arena.status === 'lobby') {
    if (!userParticipant) {
      // Not in lobby - can join
      showAction('Join Lobby');
    } else {
      // In lobby - can view
      showAction('View Lobby');
    }
  } else if (arena.status === 'active') {
    if (!userParticipant || userParticipant.status === 'left') {
      // Not participating or left - can spectate
      showAction('Spectate');
    } else {
      // Participating - can view (already in game)
      showAction('View Arena');
    }
  } else if (arena.status === 'ended') {
    // Ended - can view results or create new
    showAction('View Results');
    showAction('Create Arena');
  }
}

async function createArena(roomId: string, mode: GameMode, duration?: number) {
  try {
    // Check invariant: no active arena in room
    const activeArena = await api.get(`/rooms/${roomId}/active-arena`);
    if (activeArena) {
      showError('Room already has an active arena');
      return;
    }
    
    const arena = await api.post(`/rooms/${roomId}/arenas`, { mode, duration_minutes: duration });
    navigateTo(`/arenas/${arena.id}/lobby`);
  } catch (error) {
    if (error.code === 'ACTIVE_ARENA_EXISTS') {
      showError('Room already has an active arena');
    } else {
      showError('Failed to create arena');
    }
  }
}

async function joinLobby(arenaId: string) {
  try {
    // Check invariant: user not in another active arena
    const userActiveArena = await api.get('/users/me/active-arena');
    if (userActiveArena) {
      showError('You are already in an active arena');
      navigateTo(`/arenas/${userActiveArena.id}`);
      return;
    }
    
    await api.post(`/arenas/${arenaId}/join`);
    navigateTo(`/arenas/${arenaId}/lobby`);
  } catch (error) {
    if (error.code === 'ALREADY_IN_ACTIVE_ARENA') {
      showError('You are already in an active arena');
      const activeArena = await api.get('/users/me/active-arena');
      navigateTo(`/arenas/${activeArena.id}`);
    } else if (error.code === 'ARENA_NOT_IN_LOBBY') {
      showError('Arena is not accepting new players');
    } else {
      showError('Failed to join arena');
    }
  }
}
```

---

## Screen 4: Arena Lobby

### Purpose
Display participants, assign roles, start arena (host only).

### Visible State
- **Arena Info**:
  - Game mode (e.g., "Predators")
  - Duration (e.g., "12 minutes")
  - Host indicator
- **Participant List**:
  - Username
  - Role badge (Prey / Hunter / Spectator)
  - Status (Joined / Left)
  - Action buttons (if host): Change Role
- **Role Summary**:
  - Prey: X/1 (must be exactly 1)
  - Hunters: X/2-12 (must be 2-12)
  - Spectators: X (unlimited)
- **Host Controls**:
  - "Start Arena" button (disabled if invalid)
  - "Cancel Arena" button
- **User Actions**:
  - "Leave" button

### Primary Actions
1. **Assign Role** (Host only):
   - Tap participant → Show role picker
   - Select role → Update role
2. **Start Arena** (Host only):
   - Validate: 1 prey, 2-12 hunters
   - Submit → Start arena → Navigate to Active Arena
3. **Leave**:
   - Confirm → Leave arena → Navigate to Room View
4. **Cancel Arena** (Host only):
   - Confirm → Cancel arena → Navigate to Room View

### Guardrails
- **Invariant 1**: Cannot start if room has another active arena
- **Invariant 2**: Cannot start if any participant is in another active arena
- **Invariant 3**: Cannot start without valid role distribution (1 prey, 2-12 hunters)
- Only host can assign roles
- Only host can start/cancel arena
- Cannot assign roles if arena is not in `lobby` state
- Cannot join if arena is not in `lobby` state

### Flow Logic

```typescript
// Pseudocode: Arena Lobby
async function loadLobby(arenaId: string) {
  const arena = await api.get(`/arenas/${arenaId}`);
  const participants = await api.get(`/arenas/${arenaId}/participants`);
  
  // Subscribe to real-time updates
  subscribeToArena(arenaId, (update) => {
    if (update.type === 'participant_joined') {
      participants.push(update.participant);
    } else if (update.type === 'participant_left') {
      participants = participants.filter(p => p.id !== update.participant.id);
    } else if (update.type === 'role_changed') {
      const participant = participants.find(p => p.id === update.participant.id);
      if (participant) participant.role = update.participant.role;
    } else if (update.type === 'status_changed') {
      if (update.status === 'active') {
        navigateTo(`/arenas/${arenaId}/active`);
      }
    }
    updateUI();
  });
  
  displayLobby(arena, participants);
  updateStartButtonState(arena, participants);
}

function updateStartButtonState(arena: Arena, participants: ArenaParticipant[]) {
  const user = getCurrentUser();
  const isHost = arena.host_id === user.id;
  
  if (!isHost) {
    hideStartButton();
    return;
  }
  
  const joinedParticipants = participants.filter(p => p.status === 'joined');
  const prey = joinedParticipants.filter(p => p.role === 'prey');
  const hunters = joinedParticipants.filter(p => p.role === 'hunter');
  
  const isValid = 
    prey.length === 1 &&
    hunters.length >= 2 &&
    hunters.length <= 12;
  
  if (isValid) {
    enableStartButton();
  } else {
    disableStartButton();
    showValidationMessage(getValidationMessage(prey.length, hunters.length));
  }
}

function getValidationMessage(preyCount: number, hunterCount: number): string {
  if (preyCount === 0) return 'Need 1 prey';
  if (preyCount > 1) return 'Too many prey (need exactly 1)';
  if (hunterCount < 2) return 'Need 2-12 hunters';
  if (hunterCount > 12) return 'Too many hunters (max 12)';
  return '';
}

async function assignRole(arenaId: string, userId: string, role: ParticipantRole) {
  try {
    await api.post(`/arenas/${arenaId}/participants/${userId}/role`, { role });
    // UI updates via real-time subscription
  } catch (error) {
    if (error.code === 'NOT_HOST') {
      showError('Only host can assign roles');
    } else if (error.code === 'ARENA_NOT_IN_LOBBY') {
      showError('Cannot change roles after arena starts');
    } else {
      showError('Failed to assign role');
    }
  }
}

async function startArena(arenaId: string) {
  try {
    // Optimistic update
    showLoading('Starting arena...');
    
    const arena = await api.post(`/arenas/${arenaId}/start`);
    
    // Navigate to active arena
    navigateTo(`/arenas/${arenaId}/active`);
  } catch (error) {
    hideLoading();
    if (error.code === 'INVALID_ROLES') {
      showError('Invalid role distribution. Need 1 prey and 2-12 hunters.');
    } else if (error.code === 'ACTIVE_ARENA_EXISTS') {
      showError('Room already has an active arena');
    } else if (error.code === 'PARTICIPANT_IN_ACTIVE_ARENA') {
      showError('A participant is in another active arena');
    } else {
      showError('Failed to start arena');
    }
  }
}

async function leaveArena(arenaId: string) {
  const confirmed = await showConfirmDialog(
    'Leave Arena?',
    'You can rejoin if the arena is still in lobby.'
  );
  
  if (!confirmed) return;
  
  try {
    await api.post(`/arenas/${arenaId}/leave`);
    navigateTo(`/rooms/${arena.room_id}`);
  } catch (error) {
    showError('Failed to leave arena');
  }
}
```

---

## Screen 5: Active Arena

### Purpose
Display live game state: map, players, timer, role-specific UI.

### Visible State
- **Full-screen Map**:
  - User's current location (blue dot)
  - All player locations (colored dots by role)
  - Prey location (red dot, if visible)
  - Hunter locations (green dots)
- **Timer**:
  - Countdown (MM:SS)
  - Progress indicator
- **Role-specific UI**:
  - **Prey**: 
    - "You are being hunted" banner
    - BLE broadcast indicator (active)
  - **Hunters**: 
    - Signal strength indicator (RSSI bars)
    - Distance estimate (if available)
    - "Hunting" banner
  - **Spectators**: 
    - "Spectating" banner
    - All player locations visible
- **Actions**:
  - "Leave Hunt" button (with warning)

### Primary Actions
1. **Update Location**: 
   - Automatic: GPS updates sent to server periodically
   - Manual: Refresh location button
2. **Leave Hunt**: 
   - Show warning: "Leaving is final. You cannot rejoin this session."
   - Confirm → Leave → Navigate to Room View
3. **View Details**: 
   - Tap player dot → Show player info (username, role, distance)

### Guardrails
- **Invariant 3**: Cannot join (already locked)
- **Invariant 4**: Leaving is final (cannot rejoin)
- Cannot change roles (arena locked)
- Location tracking required (prompt if denied)
- BLE permissions required for prey/hunters (prompt if denied)

### Flow Logic

```typescript
// Pseudocode: Active Arena
async function loadActiveArena(arenaId: string) {
  const arena = await api.get(`/arenas/${arenaId}`);
  const participants = await api.get(`/arenas/${arenaId}/participants`);
  const user = getCurrentUser();
  const userParticipant = participants.find(p => p.user_id === user.id);
  
  if (!userParticipant || userParticipant.status !== 'joined') {
    // User is spectating or left
    displaySpectatorMode(arena, participants);
  } else {
    // User is participating
    displayParticipantMode(arena, participants, userParticipant);
  }
  
  // Subscribe to real-time updates
  subscribeToArena(arenaId, (update) => {
    if (update.type === 'location_updated') {
      updatePlayerLocation(update.user_id, update.latitude, update.longitude);
    } else if (update.type === 'participant_captured') {
      // Game ends - navigate to results
      navigateTo(`/arenas/${arenaId}/results`);
    } else if (update.type === 'game_ended') {
      navigateTo(`/arenas/${arenaId}/results`);
    }
  });
  
  // Start location tracking
  startLocationTracking(arenaId);
  
  // Start BLE operations (if prey or hunter)
  if (userParticipant?.role === 'prey') {
    startBLEBroadcast(arenaId);
  } else if (userParticipant?.role === 'hunter') {
    startBLEScan(arenaId);
  }
  
  // Start timer
  startGameTimer(arena.duration_minutes, () => {
    // Timer expired - game should end (server will send update)
  });
}

function displayParticipantMode(arena: Arena, participants: ArenaParticipant[], userParticipant: ArenaParticipant) {
  if (userParticipant.role === 'prey') {
    displayPreyUI();
    showMessage('You are being hunted');
    showBLEIndicator('Broadcasting');
  } else if (userParticipant.role === 'hunter') {
    displayHunterUI();
    showMessage('Hunting');
    showSignalStrengthUI(); // Updates from BLE scan
  }
}

function displaySpectatorMode(arena: Arena, participants: ArenaParticipant[]) {
  displaySpectatorUI();
  showMessage('Spectating');
  // Show all player locations
}

async function updateLocation(arenaId: string, latitude: number, longitude: number) {
  try {
    await api.post(`/arenas/${arenaId}/location`, { latitude, longitude });
    // Update local map
    updateUserLocationOnMap(latitude, longitude);
  } catch (error) {
    // Silently fail - will retry on next update
    console.error('Failed to update location', error);
  }
}

function startLocationTracking(arenaId: string) {
  // Request location permissions
  requestLocationPermission().then(granted => {
    if (!granted) {
      showError('Location permission required to play');
      return;
    }
    
    // Start GPS tracking
    watchPosition((position) => {
      updateLocation(arenaId, position.coords.latitude, position.coords.longitude);
    }, {
      enableHighAccuracy: true,
      timeout: 5000,
      maximumAge: 10000
    });
    
    // Update every 5 seconds
    setInterval(() => {
      getCurrentPosition((position) => {
        updateLocation(arenaId, position.coords.latitude, position.coords.longitude);
      });
    }, 5000);
  });
}

function startBLEBroadcast(arenaId: string) {
  // Request BLE permissions
  requestBLEPermission().then(granted => {
    if (!granted) {
      showError('BLE permission required for prey');
      return;
    }
    
    // Start BLE broadcast
    startBLEService({
      serviceUUID: 'SOCIAL_ARENA_PREY_SERVICE',
      characteristicUUID: 'SOCIAL_ARENA_PREY_CHAR',
      data: { arena_id: arenaId, user_id: getCurrentUser().id }
    });
  });
}

function startBLEScan(arenaId: string) {
  // Request BLE permissions
  requestBLEPermission().then(granted => {
    if (!granted) {
      showError('BLE permission required for hunters');
      return;
    }
    
    // Start BLE scan
    startBLEScanService({
      serviceUUID: 'SOCIAL_ARENA_PREY_SERVICE',
      onDeviceFound: (device, rssi) => {
        // Report proximity to server
        reportBLEProximity(arenaId, device.user_id, rssi);
      }
    });
  });
}

async function reportBLEProximity(arenaId: string, broadcasterUserId: string, rssi: number) {
  try {
    await api.post(`/arenas/${arenaId}/ble-proximity`, {
      broadcaster_user_id: broadcasterUserId,
      rssi: rssi
    });
    
    // Update signal strength UI
    updateSignalStrength(rssi);
    
    // Check if capture threshold met (server will handle, but show visual feedback)
    if (rssi > CAPTURE_THRESHOLD_RSSI) {
      showProximityWarning('Very close!');
    }
  } catch (error) {
    // Silently fail - will retry on next detection
  }
}

async function leaveHunt(arenaId: string) {
  const confirmed = await showConfirmDialog(
    'Leave Hunt?',
    'Leaving is final. You cannot rejoin this session. Are you sure?',
    {
      confirmText: 'Leave',
      cancelText: 'Stay',
      confirmStyle: 'destructive'
    }
  );
  
  if (!confirmed) return;
  
  try {
    await api.post(`/arenas/${arenaId}/leave`);
    // Stop location tracking
    stopLocationTracking();
    // Stop BLE operations
    stopBLEOperations();
    // Navigate to room
    navigateTo(`/rooms/${arena.room_id}`);
  } catch (error) {
    showError('Failed to leave arena');
  }
}
```

---

## Screen 6: Results

### Purpose
Display game outcome, participant summary, allow starting new arena.

### Visible State
- **Winner Banner**:
  - "Hunters Win!" or "Prey Escaped!"
  - End reason (Capture / Timeout / Host Ended)
- **Participant Summary**:
  - List of all participants
  - Role badges
  - Final status (Captured / Escaped / Left)
  - Stats (if any): Distance traveled, time survived, etc.
- **Actions**:
  - "Play Again" button → Create new arena in same room
  - "Back to Room" button → Navigate to Room View

### Primary Actions
1. **Play Again**: 
   - Create new arena in same room → Navigate to Arena Lobby
2. **Back to Room**: 
   - Navigate to Room View

### Guardrails
- Cannot modify ended arena (read-only)
- Cannot rejoin ended arena
- Must be room member to play again

### Flow Logic

```typescript
// Pseudocode: Results Screen
async function loadResults(arenaId: string) {
  const arena = await api.get(`/arenas/${arenaId}`);
  const participants = await api.get(`/arenas/${arenaId}/participants`);
  
  displayResults(arena, participants);
}

function displayResults(arena: Arena, participants: ArenaParticipant[]) {
  if (arena.winner_team === 'hunters') {
    showWinnerBanner('Hunters Win!');
  } else if (arena.winner_team === 'prey') {
    showWinnerBanner('Prey Escaped!');
  }
  
  showEndReason(arena.ended_reason);
  
  // Display participant summary
  participants.forEach(participant => {
    const status = getParticipantStatusDisplay(participant);
    displayParticipantResult(participant, status);
  });
}

function getParticipantStatusDisplay(participant: ArenaParticipant): string {
  if (participant.status === 'captured') {
    return 'Captured';
  } else if (participant.status === 'escaped') {
    return 'Escaped';
  } else if (participant.status === 'left') {
    return 'Left';
  } else {
    return 'Participated';
  }
}

async function playAgain(roomId: string) {
  try {
    // Check if room already has active arena
    const activeArena = await api.get(`/rooms/${roomId}/active-arena`);
    if (activeArena) {
      showError('Room already has an active arena');
      navigateTo(`/rooms/${roomId}`);
      return;
    }
    
    // Create new arena
    const arena = await api.post(`/rooms/${roomId}/arenas`, {
      mode: 'predators',
      duration_minutes: 12
    });
    
    navigateTo(`/arenas/${arena.id}/lobby`);
  } catch (error) {
    showError('Failed to create new arena');
  }
}
```

---

## Edge Cases & Error Handling

### Edge Case 1: User Tries to Join Arena While in Another Active Arena

**Scenario**: User is in Active Arena A, tries to join Lobby B.

**Handling**:
```typescript
async function joinLobby(arenaId: string) {
  try {
    await api.post(`/arenas/${arenaId}/join`);
  } catch (error) {
    if (error.code === 'ALREADY_IN_ACTIVE_ARENA') {
      const activeArena = await api.get('/users/me/active-arena');
      showError('You are already in an active arena');
      showDialog({
        title: 'Already in Active Arena',
        message: `You are currently in "${activeArena.room_name}". Leave that arena first to join this one.`,
        actions: [
          { text: 'Go to Active Arena', action: () => navigateTo(`/arenas/${activeArena.id}/active`) },
          { text: 'Cancel', action: () => {} }
        ]
      });
    }
  }
}
```

### Edge Case 2: Arena Starts While User is Viewing Lobby

**Scenario**: User is in lobby, host starts arena, user's screen should update.

**Handling**:
```typescript
// Real-time subscription handles this
subscribeToArena(arenaId, (update) => {
  if (update.type === 'status_changed' && update.status === 'active') {
    // Automatically navigate to active arena
    navigateTo(`/arenas/${arenaId}/active`);
  }
});
```

### Edge Case 3: User Loses Connection During Active Arena

**Scenario**: User's network drops during active game.

**Handling**:
```typescript
// Connection monitoring
onConnectionLost(() => {
  showBanner('Connection lost. Reconnecting...', 'warning');
  // Grace period: 30 seconds
  setTimeout(() => {
    if (!isConnected()) {
      // Mark as disconnected (server will handle)
      showBanner('Connection lost. You may be marked as disconnected.', 'error');
    }
  }, 30000);
});

onConnectionRestored(() => {
  hideBanner();
  // Sync state with server
  const arena = await api.get(`/arenas/${arenaId}`);
  if (arena.status === 'active') {
    // Still active - resume
    const participant = await api.get(`/arenas/${arenaId}/participants/me`);
    if (participant.status === 'disconnected') {
      showError('You were disconnected and cannot rejoin this session.');
      navigateTo(`/rooms/${arena.room_id}`);
    } else {
      // Resume game
      navigateTo(`/arenas/${arenaId}/active`);
    }
  }
});
```

### Edge Case 4: Host Leaves Lobby

**Scenario**: Host leaves arena in lobby state.

**Handling**:
```typescript
// Server should transfer host to room owner or admin
subscribeToArena(arenaId, (update) => {
  if (update.type === 'host_changed') {
    const user = getCurrentUser();
    if (update.new_host_id === user.id) {
      showBanner('You are now the host', 'info');
      // Enable host controls
      enableHostControls();
    } else {
      // Disable host controls
      disableHostControls();
    }
  }
});
```

### Edge Case 5: User Tries to Start Arena with Invalid Roles

**Scenario**: Host tries to start with 0 prey or 1 hunter.

**Handling**:
```typescript
// Client-side validation (optimistic)
function updateStartButtonState(arena: Arena, participants: ArenaParticipant[]) {
  const prey = participants.filter(p => p.role === 'prey' && p.status === 'joined');
  const hunters = participants.filter(p => p.role === 'hunter' && p.status === 'joined');
  
  if (prey.length !== 1 || hunters.length < 2 || hunters.length > 12) {
    disableStartButton();
    showValidationMessage(getValidationMessage(prey.length, hunters.length));
  } else {
    enableStartButton();
  }
}

// Server-side validation (authoritative)
async function startArena(arenaId: string) {
  try {
    await api.post(`/arenas/${arenaId}/start`);
  } catch (error) {
    if (error.code === 'INVALID_ROLES') {
      showError(error.message); // Server provides detailed message
      // Refresh participant list
      await refreshParticipants();
    }
  }
}
```

### Edge Case 6: Multiple Users Try to Start Arena Simultaneously

**Scenario**: Two hosts (if host changed) or race condition.

**Handling**:
```typescript
// Server handles with database locking
// Client shows appropriate error
async function startArena(arenaId: string) {
  try {
    await api.post(`/arenas/${arenaId}/start`);
  } catch (error) {
    if (error.code === 'ARENA_ALREADY_STARTED') {
      // Arena was started by someone else
      showBanner('Arena has been started', 'info');
      // Navigate to active arena
      navigateTo(`/arenas/${arenaId}/active`);
    }
  }
}
```

### Edge Case 7: User Tries to Leave Active Arena

**Scenario**: User wants to leave during active game.

**Handling**:
```typescript
async function leaveHunt(arenaId: string) {
  // Always show warning for active arenas
  const confirmed = await showConfirmDialog(
    'Leave Hunt?',
    'Leaving is final. You cannot rejoin this session. Are you sure?',
    {
      confirmText: 'Leave',
      cancelText: 'Stay',
      confirmStyle: 'destructive',
      requireDoubleConfirm: true // Require second confirmation
    }
  );
  
  if (!confirmed) return;
  
  try {
    await api.post(`/arenas/${arenaId}/leave`);
    navigateTo(`/rooms/${arena.room_id}`);
  } catch (error) {
    showError('Failed to leave arena');
  }
}
```

---

## Navigation Flow Summary

### Entry Points
1. **Unauthenticated**: Auth screen
2. **Authenticated**: Home screen

### Main Flows

**Flow 1: Create and Start Arena**
```
Home → Room View → Create Arena → Arena Lobby → Assign Roles → Start Arena → Active Arena → Results → Play Again
```

**Flow 2: Join Existing Arena**
```
Home → Room View → Join Lobby → Arena Lobby → (Wait for start) → Active Arena → Results
```

**Flow 3: Spectate Active Arena**
```
Home → Room View → Spectate → Active Arena (Spectator Mode) → Results
```

**Flow 4: Leave and Rejoin (Lobby Only)**
```
Arena Lobby → Leave → Room View → Join Lobby → Arena Lobby
```

### Guarded Transitions

All transitions check invariants:
- **Join Lobby**: Check user not in active arena, check arena is in lobby
- **Start Arena**: Check roles valid, check no active arena in room, check participants not in other active arenas
- **Leave Active**: Show finality warning
- **Create Arena**: Check no active arena in room

---

## Real-Time Updates

All screens subscribe to relevant state changes:

```typescript
// Pseudocode: Real-time subscription pattern
function subscribeToRoom(roomId: string, callback: (update: RoomUpdate) => void) {
  const ws = connectWebSocket(`/rooms/${roomId}/stream`);
  
  ws.on('arena_created', (arena) => {
    callback({ type: 'arena_created', arena });
  });
  
  ws.on('arena_status_changed', (status) => {
    callback({ type: 'arena_status_changed', status });
  });
  
  ws.on('participant_joined', (participant) => {
    callback({ type: 'participant_joined', participant });
  });
  
  ws.on('participant_left', (participant) => {
    callback({ type: 'participant_left', participant });
  });
  
  ws.on('role_changed', (participant) => {
    callback({ type: 'role_changed', participant });
  });
}

function subscribeToArena(arenaId: string, callback: (update: ArenaUpdate) => void) {
  const ws = connectWebSocket(`/arenas/${arenaId}/stream`);
  
  ws.on('status_changed', (status) => {
    callback({ type: 'status_changed', status });
  });
  
  ws.on('location_updated', (userId, lat, lng) => {
    callback({ type: 'location_updated', user_id: userId, latitude: lat, longitude: lng });
  });
  
  ws.on('participant_captured', (participant) => {
    callback({ type: 'participant_captured', participant });
  });
  
  ws.on('game_ended', (arena) => {
    callback({ type: 'game_ended', arena });
  });
}
```

---

## Summary

This minimal UI design:

1. **Respects all invariants**: Every screen enforces system rules
2. **Provides clear feedback**: Users know what they can/cannot do
3. **Handles edge cases**: Comprehensive error handling and recovery
4. **Real-time sync**: All screens stay in sync with server state
5. **Minimal complexity**: Only essential screens and actions

The UI is a thin layer over the engine, never violating the core invariants or business rules defined in the foundation documents.

---

## References

- [FOUNDATION.md](./FOUNDATION.md) - Source of truth
- [SYSTEM-DESIGN.md](./SYSTEM-DESIGN.md) - System architecture
- [Database Schema](./database-schema.sql) - Data model
- [State Machine](./state-machine.md) - State transitions

