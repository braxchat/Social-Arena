# Social Arena - System Design Documentation

This directory contains the foundational design documents for Social Arena.

## Documents

### 1. [Database Schema](./database-schema.sql)
Complete PostgreSQL schema with:
- Tables: `users`, `rooms`, `room_members`, `arenas`, `arena_participants`, `ble_proximity_logs`
- Enums: `arena_status`, `game_mode`, `participant_role`, `participant_status`
- Indexes for performance
- Triggers for `updated_at` timestamps
- Views for common queries
- Comments for documentation

### 2. [State Machine](./state-machine.md)
Detailed state machine design:
- Arena lifecycle: `lobby` → `active` → `ended`
- Participant status transitions
- State properties and constraints
- Transition validation logic
- Event flow for Predators mode
- Error handling and edge cases

### 3. [Business Rules](./business-rules.md)
Comprehensive business rules and constraints:
- Core rules (users, rooms, arenas, participants)
- Predators mode specific rules
- Validation rules
- Data integrity constraints
- Edge cases and error handling
- Security considerations

### 4. [Type Definitions](./types.ts)
TypeScript type definitions matching the database schema for use in the application.

## Key Design Principles

### 1. One Active Arena Per Room
- Enforced at database and application level
- Prevents conflicts and confusion

### 2. One Active Arena Per User
- Users can belong to multiple rooms
- But can only play in one active arena at a time
- Prevents location/BLE conflicts

### 3. Arena Lock on Start
- Once `active`, no new players can join
- Ensures fair game conditions
- Prevents mid-game disruptions

### 4. Finality of Leaving
- Leaving an active arena is permanent for that session
- Prevents abuse and maintains game integrity
- Users can spectate or wait for next arena

## Next Steps

1. **Review & Refine**: Review these designs and adjust as needed
2. **Database Setup**: Run `database-schema.sql` on your PostgreSQL/Supabase instance
3. **API Design**: Design REST/GraphQL API endpoints based on these schemas
4. **Backend Implementation**: Implement state machine and business rules
5. **Frontend Types**: Use `types.ts` for type-safe frontend development

## Database Setup

```bash
# For Supabase
psql -h <your-supabase-host> -U postgres -d postgres -f docs/database-schema.sql

# For local PostgreSQL
psql -U postgres -d social_arena -f docs/database-schema.sql
```

## Questions or Issues?

Review the documents and ensure they align with your vision. The schema is designed to be:
- **Extensible**: Easy to add new game modes
- **Performant**: Properly indexed for common queries
- **Type-safe**: TypeScript types match database schema
- **Secure**: Ready for Row Level Security (RLS) policies

