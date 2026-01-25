/**
 * Social Arena - Core Type Definitions
 * 
 * These types match the database schema and system design.
 * All types are immutable and server-authoritative.
 */

// ============================================================================
// ENUMS
// ============================================================================

export type ArenaStatus = 'lobby' | 'active' | 'ended';
export type GameMode = 'predators' | 'outbreak' | 'specter' | 'duel';
export type ParticipantRole = 'prey' | 'hunter' | 'spectator';
export type ParticipantStatus = 'joined' | 'left' | 'captured' | 'escaped' | 'disconnected';

// ============================================================================
// DOMAIN ENTITIES
// ============================================================================

export interface User {
  id: string; // UUID
  email: string;
  password_hash: string; // Never exposed to client
  username: string;
  display_name?: string;
  avatar_url?: string;
  created_at: Date;
  updated_at: Date;
  last_seen_at?: Date;
}

export interface Room {
  id: string; // UUID
  name: string;
  description?: string;
  owner_id: string; // UUID -> User.id
  roomCode?: string; // 5-6 character uppercase alphanumeric code for invites (optional for backward compatibility)
  is_public: boolean;
  max_members?: number;
  created_at: Date;
  updated_at: Date;
}

export interface RoomMember {
  id: string; // UUID
  room_id: string; // UUID -> Room.id
  user_id: string; // UUID -> User.id
  role: 'owner' | 'admin' | 'member';
  joined_at: Date;
}

export interface Arena {
  id: string; // UUID
  room_id: string; // UUID -> Room.id
  mode: GameMode;
  status: ArenaStatus;
  host_id: string; // UUID -> User.id
  started_at?: Date;
  ended_at?: Date;
  duration_minutes: number;
  settings: Record<string, any>; // JSONB
  winner_team?: 'hunters' | 'prey';
  ended_reason?: 'capture' | 'timeout' | 'host_ended' | 'all_left' | 'cancelled' | 'error';
  created_at: Date;
  updated_at: Date;
}

export interface ArenaParticipant {
  id: string; // UUID
  arena_id: string; // UUID -> Arena.id
  user_id: string; // UUID -> User.id
  role: ParticipantRole;
  status: ParticipantStatus;
  joined_at: Date;
  left_at?: Date;
  is_captured: boolean;
  captured_at?: Date;
  captured_by_user_id?: string; // UUID -> User.id
  last_latitude?: number;
  last_longitude?: number;
  last_location_updated_at?: Date;
  is_ble_broadcasting: boolean;
  ble_started_at?: Date;
  created_at: Date;
  updated_at: Date;
}

// ============================================================================
// RESULT TYPES
// ============================================================================

export type Result<T, E = Error> = 
  | { success: true; data: T }
  | { success: false; error: E };

// ============================================================================
// ERROR TYPES
// ============================================================================

export class ArenaError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'ArenaError';
  }
}

export const ErrorCodes = {
  // Auth
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  EMAIL_EXISTS: 'EMAIL_EXISTS',
  USERNAME_EXISTS: 'USERNAME_EXISTS',
  UNAUTHORIZED: 'UNAUTHORIZED',
  
  // Rooms
  ROOM_NOT_FOUND: 'ROOM_NOT_FOUND',
  ALREADY_MEMBER: 'ALREADY_MEMBER',
  NOT_MEMBER: 'NOT_MEMBER',
  ROOM_FULL: 'ROOM_FULL',
  
  // Arenas
  ARENA_NOT_FOUND: 'ARENA_NOT_FOUND',
  ARENA_NOT_IN_LOBBY: 'ARENA_NOT_IN_LOBBY',
  ARENA_ALREADY_STARTED: 'ARENA_ALREADY_STARTED',
  ARENA_ALREADY_ENDED: 'ARENA_ALREADY_ENDED',
  ACTIVE_ARENA_EXISTS: 'ACTIVE_ARENA_EXISTS',
  INVALID_ROLES: 'INVALID_ROLES',
  NOT_HOST: 'NOT_HOST',
  ROOM_CODE_NOT_FOUND: 'ROOM_CODE_NOT_FOUND',
  ARENA_ENDED: 'ARENA_ENDED',
  
  // Participants
  ALREADY_IN_ACTIVE_ARENA: 'ALREADY_IN_ACTIVE_ARENA',
  PARTICIPANT_IN_ACTIVE_ARENA: 'PARTICIPANT_IN_ACTIVE_ARENA',
  ALREADY_PARTICIPANT: 'ALREADY_PARTICIPANT',
  CANNOT_REJOIN_ACTIVE: 'CANNOT_REJOIN_ACTIVE',
  PARTICIPANT_NOT_FOUND: 'PARTICIPANT_NOT_FOUND',
  
  // Validation
  INVALID_INPUT: 'INVALID_INPUT',
  INVALID_STATE_TRANSITION: 'INVALID_STATE_TRANSITION',
} as const;

// ============================================================================
// HELPER TYPES
// ============================================================================

export type UserWithoutPassword = Omit<User, 'password_hash'>;
export type ArenaWithParticipants = Arena & {
  participants: ArenaParticipant[];
};

