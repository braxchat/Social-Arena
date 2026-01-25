# Social Arena - UI Implementation Summary

## Overview

Minimum UI wired to the core engine. All screens call engine functions directly and handle `Result<T, ArenaError>` properly.

## Structure

```
app/
├── navigation/
│   └── AppNavigator.tsx      # Stack navigator setup
├── screens/
│   ├── AuthScreen.tsx         # Signup/Login
│   ├── RoomsScreen.tsx        # List rooms, create room
│   ├── RoomScreen.tsx         # Room details, arena status
│   ├── LobbyScreen.tsx        # Arena lobby, participants, start
│   ├── ActiveArenaScreen.tsx # Active arena placeholder
│   └── ResultsScreen.tsx      # Arena results
├── core/                      # Engine (already exists)
└── App.js                     # Entry point with navigator
```

## Navigation Flow

```
Auth → Rooms → Room → Lobby → ActiveArena → Results
```

## Features Implemented

### 1. AuthScreen
- Toggle between Sign Up and Log In
- Email, password, username (signup only)
- Calls `signup()` or `login()` from core
- Navigates to Rooms on success

### 2. RoomsScreen
- Lists all user's rooms (`getUserRooms()`)
- Create room input + button (`createRoom()`)
- Tap room → navigates to RoomScreen
- Logout button

### 3. RoomScreen
- Shows room name and member count
- Shows current arena status (lobby/active/ended)
- Actions:
  - Create Arena → creates and navigates to Lobby
  - Join Lobby (if lobby)
  - View Arena (if active)
  - View Results (if ended)

### 4. LobbyScreen
- Shows arena status and participants
- Join as Hunter/Prey buttons
- Host controls:
  - Assign roles (simple buttons)
  - Start Arena button (validates roles)
- Leave Lobby button
- Auto-navigates to ActiveArena when started

### 5. ActiveArenaScreen (Placeholder)
- Shows arena status and timer placeholder
- Shows current role (Prey/Hunter)
- Host controls:
  - End Arena
  - Capture Prey (test button)
- Leave Arena (with finality warning)
- "Map coming next" placeholder

### 6. ResultsScreen
- Shows winner (Hunters/Prey Escaped)
- Lists all participants with status
- Play Again → creates new arena
- Back to Room

## Error Handling

All screens properly handle `Result<T, ArenaError>`:
- Check `result.success` before accessing `data`
- Show `result.error.message` in Alert dialogs
- Block actions when invariants are violated

## Data Flow

- **Engine is authoritative**: All state comes from engine functions
- **Refresh on focus**: Screens reload data when focused
- **Invariant enforcement**: Engine errors are shown to user
- **Navigation guards**: Screens check arena status and navigate accordingly

## Dependencies Added

- `@react-navigation/native`
- `@react-navigation/native-stack`
- `react-native-screens`
- `react-native-safe-area-context`

## Next Steps

1. Install dependencies: `npm install` in `app/` directory
2. Run: `npm start` or `expo start`
3. Test the flow:
   - Sign up → Create room → Create arena → Join → Start → End
4. Add map and real-time features in ActiveArenaScreen

## Notes

- No GPS, BLE, or background logic yet
- No map implementation yet
- Timer is placeholder (doesn't tick)
- All styling is minimal (basic spacing only)
- UI calls engine functions directly (no rewriting)

