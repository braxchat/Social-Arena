/**
 * Social Arena - Participants Domain Layer
 * 
 * Handles arena participant join/leave logic with invariant enforcement.
 * Server-authoritative design.
 */

import {
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

// ============================================================================
// PARTICIPANT FUNCTIONS
// ============================================================================

/**
 * Join an arena
 * 
 * Enforces invariants:
 * - Invariant 2: User cannot be in another active arena
 * - Invariant 3: Arena must be in lobby state
 * - Invariant 4: Cannot rejoin if left an active arena
 */
export async function joinArena(
  arenaId: string,
  role: ParticipantRole = 'spectator'
): Promise<Result<ArenaParticipant, ArenaError>> {
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

  // Invariant 3: Arena must be in lobby
  if (arena.status !== 'lobby') {
    return {
      success: false,
      error: new ArenaError(
        'Arena is not accepting new players',
        ErrorCodes.ARENA_NOT_IN_LOBBY
      ),
    };
  }

  // Check room membership (try Supabase first, then fallback)
  const { data: memberData } = await supabase
    .from('room_members')
    .select('id')
    .eq('room_id', arena.room_id)
    .eq('user_id', userId)
    .single();

  const isMember = memberData || store.isRoomMember(arena.room_id, userId);
  
  if (!isMember) {
    return {
      success: false,
      error: new ArenaError(
        'User is not a member of this room',
        ErrorCodes.NOT_MEMBER
      ),
    };
  }

  // Invariant 2: Check if user is in another active arena
  const userActiveArena = store.getActiveArenaByUserId(userId);
  if (userActiveArena && userActiveArena.id !== arenaId) {
    return {
      success: false,
      error: new ArenaError(
        'You are already in an active arena',
        ErrorCodes.ALREADY_IN_ACTIVE_ARENA,
        { active_arena_id: userActiveArena.id }
      ),
    };
  }

  // Check if already a participant
  const existingParticipant = store.getArenaParticipant(arenaId, userId);
  if (existingParticipant) {
    // Invariant 4: Cannot rejoin if left an active arena
    if (existingParticipant.status === 'left' && arena.status === 'active') {
      return {
        success: false,
        error: new ArenaError(
          'Cannot rejoin an active arena after leaving',
          ErrorCodes.CANNOT_REJOIN_ACTIVE
        ),
      };
    }

    // If in lobby and status is 'left', allow rejoin by updating status
    if (existingParticipant.status === 'left' && arena.status === 'lobby') {
      const updated = store.updateArenaParticipant(arenaId, userId, {
        status: 'joined',
        left_at: undefined,
        role, // Allow role change on rejoin
      });
      if (!updated) {
        return {
          success: false,
          error: new ArenaError(
            'Failed to rejoin arena',
            ErrorCodes.INVALID_INPUT
          ),
        };
      }
      return {
        success: true,
        data: updated,
      };
    }

    // Already joined, return success (idempotent)
    return {
      success: true,
      data: existingParticipant,
    };
  }

  // Create new participant
  const participant = store.createArenaParticipant({
    arena_id: arenaId,
    user_id: userId,
    role,
    status: 'joined',
    joined_at: new Date(),
    is_captured: false,
    is_ble_broadcasting: false,
    created_at: new Date(),
    updated_at: new Date(),
  });

  return {
    success: true,
    data: participant,
  };
  } catch (error: any) {
    return {
      success: false,
      error: new ArenaError(
        error.message || 'Failed to join arena',
        ErrorCodes.INVALID_INPUT
      ),
    };
  }
}

/**
 * Leave an arena
 * 
 * Enforces invariants:
 * - Invariant 4: Leaving an active arena is final
 */
export async function leaveArena(arenaId: string): Promise<Result<void, ArenaError>> {
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

  // Get participant
  const participant = store.getArenaParticipant(arenaId, userId);
  if (!participant) {
    return {
      success: false,
      error: new ArenaError(
        'You are not a participant in this arena',
        ErrorCodes.PARTICIPANT_NOT_FOUND
      ),
    };
  }

  // If already left, return success (idempotent)
  if (participant.status === 'left') {
    return {
      success: true,
      data: undefined,
    };
  }

  // Update participant status
  const updated = store.updateArenaParticipant(arenaId, userId, {
    status: 'left',
    left_at: new Date(),
    is_ble_broadcasting: false, // Stop BLE if was broadcasting
  });

  if (!updated) {
    return {
      success: false,
      error: new ArenaError(
        'Failed to leave arena',
        ErrorCodes.INVALID_INPUT
      ),
    };
  }

  // If arena is active and this was the prey, stop BLE
  if (arena.status === 'active' && participant.role === 'prey') {
    store.updateArenaParticipant(arenaId, userId, {
      is_ble_broadcasting: false,
    });
  }

  // Check if all players left (end arena)
  const remainingParticipants = store.getArenaParticipants(arenaId);
  const joinedCount = remainingParticipants.filter(
    p => p.status === 'joined'
  ).length;

  if (joinedCount === 0 && arena.status === 'active') {
    // End arena (this will be handled by arenas.ts endArena function)
    // For now, just update status
    store.updateArena(arenaId, {
      status: 'ended',
      ended_at: new Date(),
      ended_reason: 'all_left',
      updated_at: new Date(),
    });
  }

  return {
    success: true,
    data: undefined,
  };
  } catch (error: any) {
    return {
      success: false,
      error: new ArenaError(
        error.message || 'Failed to leave arena',
        ErrorCodes.INVALID_INPUT
      ),
    };
  }
}

/**
 * Get arena participants
 */
export function getArenaParticipants(
  arenaId: string
): Result<ArenaParticipant[], ArenaError> {
  // No auth required - just get participants

  // Check if arena exists
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

  const participants = store.getArenaParticipants(arenaId);
  return {
    success: true,
    data: participants,
  };
}

/**
 * Assign role to a participant (host only)
 */
export async function assignRole(
  arenaId: string,
  userId: string,
  role: ParticipantRole
): Promise<Result<ArenaParticipant, ArenaError>> {
  try {
    const currentUserId = await getDeviceId();

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
  if (arena.host_id !== currentUserId) {
    return {
      success: false,
      error: new ArenaError(
        'Only the host can assign roles',
        ErrorCodes.NOT_HOST
      ),
    };
  }

  // Check if arena is in lobby
  if (arena.status !== 'lobby') {
    return {
      success: false,
      error: new ArenaError(
        'Cannot change roles after arena starts',
        ErrorCodes.ARENA_NOT_IN_LOBBY
      ),
    };
  }

  // Get participant
  const participant = store.getArenaParticipant(arenaId, userId);
  if (!participant) {
    return {
      success: false,
      error: new ArenaError(
        'Participant not found',
        ErrorCodes.PARTICIPANT_NOT_FOUND
      ),
    };
  }

  // Update role
  const updated = store.updateArenaParticipant(arenaId, userId, {
    role,
  });

  if (!updated) {
    return {
      success: false,
      error: new ArenaError(
        'Failed to assign role',
        ErrorCodes.INVALID_INPUT
      ),
    };
  }

  return {
    success: true,
    data: updated,
  };
  } catch (error: any) {
    return {
      success: false,
      error: new ArenaError(
        error.message || 'Failed to assign role',
        ErrorCodes.INVALID_INPUT
      ),
    };
  }
}

/**
 * Get user's active arena (if any)
 */
export async function getUserActiveArena(): Promise<Result<string | null, ArenaError>> {
  try {
    const userId = await getDeviceId();

    const activeArena = store.getActiveArenaByUserId(userId);
    return {
      success: true,
      data: activeArena?.id || null,
    };
  } catch (error: any) {
    return {
      success: false,
      error: new ArenaError(
        error.message || 'Failed to get active arena',
        ErrorCodes.INVALID_INPUT
      ),
    };
  }
}

