/**
 * Social Arena - TypeScript Type Definitions
 * 
 * These types match the database schema defined in database-schema.sql
 * Use these types throughout the application for type safety.
 */

// ============================================================================
// ENUMS
// ============================================================================

export type ArenaStatus = 'lobby' | 'active' | 'ended';
export type GameMode = 'predators' | 'outbreak' | 'specter' | 'duel';
export type ParticipantRole = 'prey' | 'hunter' | 'spectator';
export type ParticipantStatus = 'joined' | 'left' | 'captured' | 'escaped' | 'disconnected';

// ============================================================================
// DATABASE ENTITIES
// ============================================================================

export interface User {
  id: string; // UUID
  email: string;
  password_hash: string; // Never expose to client
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
  ended_reason?: 'capture' | 'timeout' | 'host_ended' | 'error' | 'all_left' | 'cancelled';
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

export interface BLEProximityLog {
  id: string; // UUID
  arena_id: string; // UUID -> Arena.id
  broadcaster_user_id: string; // UUID -> User.id (prey)
  scanner_user_id: string; // UUID -> User.id (hunter)
  rssi: number;
  distance_estimate_meters?: number;
  broadcaster_latitude?: number;
  broadcaster_longitude?: number;
  scanner_latitude?: number;
  scanner_longitude?: number;
  recorded_at: Date;
}

// ============================================================================
// VIEW TYPES
// ============================================================================

export interface ActiveArenaView {
  id: string;
  room_id: string;
  mode: GameMode;
  status: ArenaStatus;
  host_id: string;
  started_at?: Date;
  duration_minutes: number;
  participant_count: number;
  prey_count: number;
  hunter_count: number;
}

export interface UserActiveArenaView {
  user_id: string;
  arena_id: string;
  room_id: string;
  mode: GameMode;
  status: ArenaStatus;
  role: ParticipantRole;
  participant_status: ParticipantStatus;
}

// ============================================================================
// API REQUEST/RESPONSE TYPES
// ============================================================================

// Authentication
export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  username: string;
}

export interface AuthResponse {
  user: Omit<User, 'password_hash'>;
  token: string;
}

// Rooms
export interface CreateRoomRequest {
  name: string;
  description?: string;
  is_public?: boolean;
  max_members?: number;
}

export interface JoinRoomRequest {
  room_id: string;
}

// Arenas
export interface CreateArenaRequest {
  room_id: string;
  mode: GameMode;
  duration_minutes?: number;
  settings?: Record<string, any>;
}

export interface JoinArenaRequest {
  arena_id: string;
}

export interface AssignRoleRequest {
  arena_id: string;
  user_id: string;
  role: ParticipantRole;
}

export interface StartArenaRequest {
  arena_id: string;
}

// Location
export interface UpdateLocationRequest {
  arena_id: string;
  latitude: number;
  longitude: number;
}

// BLE
export interface BLEProximityUpdate {
  arena_id: string;
  broadcaster_user_id: string; // Prey
  scanner_user_id: string; // Hunter
  rssi: number;
  timestamp: Date;
}

// ============================================================================
// GAME STATE TYPES
// ============================================================================

export interface GameState {
  arena: Arena;
  participants: ArenaParticipant[];
  time_remaining_seconds: number;
  prey_location?: {
    latitude: number;
    longitude: number;
  };
  hunter_locations: Array<{
    user_id: string;
    latitude: number;
    longitude: number;
  }>;
}

export interface CaptureEvent {
  arena_id: string;
  prey_user_id: string;
  hunter_user_id: string;
  captured_at: Date;
  location: {
    latitude: number;
    longitude: number;
  };
}

// ============================================================================
// VALIDATION TYPES
// ============================================================================

export interface ArenaStartValidation {
  can_start: boolean;
  errors: string[];
  warnings: string[];
}

export interface JoinArenaValidation {
  can_join: boolean;
  reason?: string;
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

export type UserWithoutPassword = Omit<User, 'password_hash'>;
export type ArenaWithParticipants = Arena & {
  participants: ArenaParticipant[];
};
export type RoomWithMemberCount = Room & {
  member_count: number;
  active_arena_count: number;
};

// ============================================================================
// CONSTANTS
// ============================================================================

export const PREDATORS_MODE_CONFIG = {
  MIN_HUNTERS: 2,
  MAX_HUNTERS: 12,
  REQUIRED_PREY: 1,
  DEFAULT_DURATION_MINUTES: 12,
  CAPTURE_PROXIMITY_THRESHOLD_RSSI: -70, // Adjust based on testing
  CAPTURE_DURATION_SECONDS: 3, // Must sustain proximity for 3 seconds
  DISCONNECT_GRACE_PERIOD_SECONDS: 30,
} as const;

export const ARENA_STATUS_TRANSITIONS: Record<ArenaStatus, ArenaStatus[]> = {
  lobby: ['active', 'ended'],
  active: ['ended'],
  ended: [], // Terminal state
} as const;

