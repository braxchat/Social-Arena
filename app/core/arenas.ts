/**
 * Social Arena - Arenas Domain Layer
 * 
 * Handles arena lifecycle and state machine transitions.
 * Server-authoritative design with strict invariant enforcement.
 */

import {
  Arena,
  ArenaStatus,
  GameMode,
  ArenaWithParticipants,
  ArenaParticipant,
  ParticipantRole,
  Result,
  ArenaError,
  ErrorCodes,
} from './types';
import { store } from './store';
import { getDeviceId } from '../lib/deviceId';
import { supabase } from '../lib/supabase';
import { requireRoomMembership } from './rooms';
import { getArenaParticipants } from './participants';
import { initializeParticipantLocations } from './location';

// ============================================================================
// ARENA STATE MACHINE
// ============================================================================

const VALID_TRANSITIONS: Record<ArenaStatus, ArenaStatus[]> = {
  lobby: ['active', 'ended'],
  active: ['ended'],
  ended: [], // Terminal state
};

function canTransition(from: ArenaStatus, to: ArenaStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

// ============================================================================
// ARENA FUNCTIONS
// ============================================================================

/**
 * Create a new arena
 * 
 * Enforces invariants:
 * - Invariant 1: No active arena in room
 */
export async function createArena(
  roomId: string,
  mode: GameMode = 'predators',
  durationMinutes: number = 12
): Promise<Result<Arena, ArenaError>> {
  try {
    const userId = await getDeviceId();

    // Validation
    if (durationMinutes < 1 || durationMinutes > 60) {
      return {
        success: false,
        error: new ArenaError(
          'Duration must be between 1 and 60 minutes',
          ErrorCodes.INVALID_INPUT
        ),
      };
    }

    // Check if room exists (try Supabase first, then fallback to store)
    const { data: roomData } = await supabase
      .from('rooms')
      .select('id')
      .eq('id', roomId)
      .single();

    const room = roomData ? null : store.getRoomById(roomId);
    
    if (!roomData && !room) {
      return {
        success: false,
        error: new ArenaError(
          'Room not found',
          ErrorCodes.ROOM_NOT_FOUND
        ),
      };
    }

    // Check room membership (try Supabase first)
    const { data: memberData } = await supabase
      .from('room_members')
      .select('id')
      .eq('room_id', roomId)
      .eq('user_id', userId)
      .single();

    const isMember = memberData || store.isRoomMember(roomId, userId);
    
    if (!isMember) {
      return {
        success: false,
        error: new ArenaError(
          'User is not a member of this room',
          ErrorCodes.NOT_MEMBER
        ),
      };
    }

    // Invariant 1: Check if room already has an active arena
    const activeArena = store.getActiveArenaByRoomId(roomId);
    if (activeArena) {
      return {
        success: false,
        error: new ArenaError(
          'Room already has an active arena',
          ErrorCodes.ACTIVE_ARENA_EXISTS,
          { active_arena_id: activeArena.id }
        ),
      };
    }

    // Create arena (still using in-memory store for now)
    const arena = store.createArena({
      room_id: roomId,
      mode,
      status: 'lobby',
      host_id: userId,
      duration_minutes: durationMinutes,
      settings: {},
      created_at: new Date(),
      updated_at: new Date(),
    });

    return {
      success: true,
      data: arena,
    };
  } catch (error: any) {
    return {
      success: false,
      error: new ArenaError(
        error.message || 'Failed to create arena',
        ErrorCodes.INVALID_INPUT
      ),
    };
  }
}

/**
 * Get arena by ID
 */
export function getArena(arenaId: string): Result<Arena, ArenaError> {
  // No auth required - just get the arena

  const arena = store.getArenaById(arenaId);
  if (!arena) {
    return {
      success: false,
      error: new ArenaError(
        'Arena not found',
        ErrorCodes.ARENA_NOT_FOUND
      ),
    };
  }

  return {
    success: true,
    data: arena,
  };
}

/**
 * Get arena with participants
 */
export function getArenaWithParticipants(
  arenaId: string
): Result<ArenaWithParticipants, ArenaError> {
  const arenaResult = getArena(arenaId);
  if (!arenaResult.success) {
    return arenaResult;
  }

  const participantsResult = getArenaParticipants(arenaId);
  if (!participantsResult.success) {
    return participantsResult;
  }

  return {
    success: true,
    data: {
      ...arenaResult.data,
      participants: participantsResult.data,
    },
  };
}

/**
 * Get active arena in a room
 */
export function getActiveArenaInRoom(
  roomId: string
): Result<Arena | null, ArenaError> {
  // No auth required - just get the active arena
  const activeArena = store.getActiveArenaByRoomId(roomId);
  return {
    success: true,
    data: activeArena || null,
  };
}

/**
 * Start an arena
 * 
 * Enforces all invariants:
 * - Invariant 1: No active arena in room
 * - Invariant 2: No participant in another active arena
 * - Valid role distribution (1 prey, 1-12 hunters for predators)
 */
export async function startArena(arenaId: string): Promise<Result<Arena, ArenaError>> {
  try {
    const userId = await getDeviceId();

  // Get arena
  const arena = store.getArenaById(arenaId);
  if (!arena) {
    return {
      success: false,
      error: new ArenaError(
        'Arena not found',
        ErrorCodes.ARENA_NOT_FOUND
      ),
    };
  }

  // Check if user is host
  if (arena.host_id !== userId) {
    return {
      success: false,
      error: new ArenaError(
        'Only the host can start the arena',
        ErrorCodes.NOT_HOST
      ),
    };
  }

  // Validate state transition
  if (!canTransition(arena.status, 'active')) {
    return {
      success: false,
      error: new ArenaError(
        `Cannot start arena from ${arena.status} state`,
        ErrorCodes.INVALID_STATE_TRANSITION
      ),
    };
  }

  // Invariant 1: Check if room already has an active arena
  const activeArenaInRoom = store.getActiveArenaByRoomId(arena.room_id);
  if (activeArenaInRoom && activeArenaInRoom.id !== arenaId) {
    return {
      success: false,
      error: new ArenaError(
        'Room already has an active arena',
        ErrorCodes.ACTIVE_ARENA_EXISTS,
        { active_arena_id: activeArenaInRoom.id }
      ),
    };
  }

  // Get participants
  const participants = store.getArenaParticipants(arenaId);
  const joinedParticipants = participants.filter(p => p.status === 'joined');

  // Validate role distribution (for predators mode)
  if (arena.mode === 'predators') {
    const prey = joinedParticipants.filter(p => p.role === 'prey');
    const hunters = joinedParticipants.filter(p => p.role === 'hunter');

    if (prey.length !== 1) {
      return {
        success: false,
        error: new ArenaError(
          `Must have exactly 1 prey (found ${prey.length})`,
          ErrorCodes.INVALID_ROLES,
          { prey_count: prey.length, required: 1 }
        ),
      };
    }

    if (hunters.length < 1 || hunters.length > 12) {
      return {
        success: false,
        error: new ArenaError(
          `Must have 1-12 hunters (found ${hunters.length})`,
          ErrorCodes.INVALID_ROLES,
          { hunter_count: hunters.length, required: { min: 1, max: 12 } }
        ),
      };
    }
  }

  // Invariant 2: Check each participant is not in another active arena
  for (const participant of joinedParticipants) {
    const userActiveArena = store.getActiveArenaByUserId(participant.user_id);
    if (userActiveArena && userActiveArena.id !== arenaId) {
      return {
        success: false,
        error: new ArenaError(
          `Participant ${participant.user_id} is in another active arena`,
          ErrorCodes.PARTICIPANT_IN_ACTIVE_ARENA,
          { participant_user_id: participant.user_id, active_arena_id: userActiveArena.id }
        ),
      };
    }
  }

  // All validations passed - execute transition
  const now = new Date();
  const updated = store.updateArena(arenaId, {
    status: 'active',
    started_at: now,
    updated_at: now,
  });

  if (!updated) {
    return {
      success: false,
      error: new ArenaError(
        'Failed to start arena',
        ErrorCodes.INVALID_INPUT
      ),
    };
  }

  // Start BLE broadcast for prey
  const prey = joinedParticipants.find(p => p.role === 'prey');
  if (prey) {
    store.updateArenaParticipant(arenaId, prey.user_id, {
      is_ble_broadcasting: true,
      ble_started_at: now,
    });
  }

  // Initialize participant locations
  initializeParticipantLocations(arenaId);

  return {
    success: true,
    data: updated,
  };
  } catch (error: any) {
    return {
      success: false,
      error: new ArenaError(
        error.message || 'Failed to start arena',
        ErrorCodes.INVALID_INPUT
      ),
    };
  }
}

/**
 * End an arena
 */
export async function endArena(
  arenaId: string,
  reason: 'capture' | 'timeout' | 'host_ended' | 'all_left' | 'error' = 'host_ended',
  winnerTeam?: 'hunters' | 'prey'
): Promise<Result<Arena, ArenaError>> {
  try {
    const userId = await getDeviceId();

  // Get arena
  const arena = store.getArenaById(arenaId);
  if (!arena) {
    return {
      success: false,
      error: new ArenaError(
        'Arena not found',
        ErrorCodes.ARENA_NOT_FOUND
      ),
    };
  }

  // Check if user is host (or allow system to end)
  if (arena.host_id !== userId && reason !== 'all_left' && reason !== 'timeout' && reason !== 'capture') {
    return {
      success: false,
      error: new ArenaError(
        'Only the host can end the arena',
        ErrorCodes.NOT_HOST
      ),
    };
  }

  // Validate state transition
  if (!canTransition(arena.status, 'ended')) {
    return {
      success: false,
      error: new ArenaError(
        `Cannot end arena from ${arena.status} state`,
        ErrorCodes.INVALID_STATE_TRANSITION
      ),
    };
  }

  // Update arena
  const now = new Date();
  const updated = store.updateArena(arenaId, {
    status: 'ended',
    ended_at: now,
    ended_reason: reason,
    winner_team: winnerTeam,
    updated_at: now,
  });

  if (!updated) {
    return {
      success: false,
      error: new ArenaError(
        'Failed to end arena',
        ErrorCodes.INVALID_INPUT
      ),
    };
  }

  // Stop BLE broadcast for all participants
  const participants = store.getArenaParticipants(arenaId);
  for (const participant of participants) {
    if (participant.is_ble_broadcasting) {
      store.updateArenaParticipant(arenaId, participant.user_id, {
        is_ble_broadcasting: false,
      });
    }
  }

  // Update participant statuses based on reason
  if (reason === 'capture' && winnerTeam === 'hunters') {
    const prey = participants.find(p => p.role === 'prey' && p.status === 'joined');
    if (prey) {
      store.updateArenaParticipant(arenaId, prey.user_id, {
        status: 'captured',
        is_captured: true,
        captured_at: now,
      });
    }
  } else if (reason === 'timeout' && winnerTeam === 'prey') {
    const prey = participants.find(p => p.role === 'prey' && p.status === 'joined');
    if (prey) {
      store.updateArenaParticipant(arenaId, prey.user_id, {
        status: 'escaped',
      });
    }
  }

  return {
    success: true,
    data: updated,
  };
  } catch (error: any) {
    return {
      success: false,
      error: new ArenaError(
        error.message || 'Failed to end arena',
        ErrorCodes.INVALID_INPUT
      ),
    };
  }
}

/**
 * Cancel an arena (lobby only)
 */
export async function cancelArena(arenaId: string): Promise<Result<Arena, ArenaError>> {
  return await endArena(arenaId, 'cancelled');
}

/**
 * Capture prey (ends arena with hunters win)
 */
export function capturePrey(
  arenaId: string,
  preyUserId: string,
  hunterUserId: string
): Result<Arena, ArenaError> {
  // No auth required - just capture prey

  // Get arena
  const arena = store.getArenaById(arenaId);
  if (!arena) {
    return {
      success: false,
      error: new ArenaError(
        'Arena not found',
        ErrorCodes.ARENA_NOT_FOUND
      ),
    };
  }

  // Arena must be active
  if (arena.status !== 'active') {
    return {
      success: false,
      error: new ArenaError(
        'Arena is not active',
        ErrorCodes.INVALID_STATE_TRANSITION
      ),
    };
  }

  // Get prey participant
  const prey = store.getArenaParticipant(arenaId, preyUserId);
  if (!prey || prey.role !== 'prey') {
    return {
      success: false,
      error: new ArenaError(
        'Prey participant not found',
        ErrorCodes.PARTICIPANT_NOT_FOUND
      ),
    };
  }

  // Update prey status
  const now = new Date();
  store.updateArenaParticipant(arenaId, preyUserId, {
    status: 'captured',
    is_captured: true,
    captured_at: now,
    captured_by_user_id: hunterUserId,
    is_ble_broadcasting: false,
  });

  // End arena with hunters win
  return endArena(arenaId, 'capture', 'hunters');
}

