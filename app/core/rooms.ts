/**
 * Social Arena - Rooms Domain Layer
 * 
 * Handles room CRUD and membership management.
 * Server-authoritative design.
 * Now backed by Supabase for cross-device multiplayer.
 */

import {
  Room,
  RoomMember,
  Result,
  ArenaError,
  ErrorCodes,
} from './types';
import { supabase } from '../lib/supabase';
import { getDeviceId } from '../lib/deviceId';
import { store } from './store';

// ============================================================================
// ROOM CODE GENERATION
// ============================================================================

/**
 * Generate a unique room code (6 characters, uppercase alphanumeric)
 */
function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude ambiguous chars (0, O, I, 1)
  const length = 6; // 6 characters
  
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  return code;
}

/**
 * Generate a unique room code that doesn't exist yet (checks Supabase)
 */
async function generateUniqueRoomCode(): Promise<string> {
  let attempts = 0;
  const maxAttempts = 100;
  
  while (attempts < maxAttempts) {
    const code = generateRoomCode();
    // Check if code exists in Supabase
    const { data, error } = await supabase
      .from('rooms')
      .select('id')
      .eq('code', code)
      .single();
    
    if (error && error.code === 'PGRST116') {
      // No rows returned - code is available
      return code;
    }
    
    if (!data) {
      // Code doesn't exist
      return code;
    }
    
    attempts++;
  }
  
  // Fallback: use timestamp-based code if too many collisions
  return `A${Date.now().toString(36).toUpperCase().slice(-5)}`;
}

// ============================================================================
// ROOM FUNCTIONS
// ============================================================================

/**
 * Create a new room (Supabase-backed)
 */
export async function createRoom(
  name: string,
  description?: string,
  isPublic: boolean = false,
  maxMembers?: number
): Promise<Result<Room, ArenaError>> {
  try {
    const userId = await getDeviceId();

    // Validation
    if (!name || name.trim().length === 0) {
      return {
        success: false,
        error: new ArenaError(
          'Room name is required',
          ErrorCodes.INVALID_INPUT
        ),
      };
    }

    if (name.length > 50) {
      return {
        success: false,
        error: new ArenaError(
          'Room name must be 50 characters or less',
          ErrorCodes.INVALID_INPUT
        ),
      };
    }

    // Generate unique room code
    const roomCode = await generateUniqueRoomCode();
    const normalizedCode = roomCode.toUpperCase();

    // Default values for required fields
    const mode = 'predators'; // Default mode
    const maxPlayers = maxMembers || 10; // Default max players

    // Insert room into Supabase
    const { data: roomData, error: roomError } = await supabase
      .from('rooms')
      .insert({
        code: normalizedCode,
        host_id: userId,
        mode: mode,
        max_players: maxPlayers,
        name: name.trim(),
        description: description?.trim() || null,
      })
      .select()
      .single();

    if (roomError) {
      console.error('Error creating room:', roomError);
      return {
        success: false,
        error: new ArenaError(
          'Failed to create room',
          ErrorCodes.INVALID_INPUT
        ),
      };
    }

    // Add creator as owner member
    const { error: memberError } = await supabase
      .from('room_members')
      .insert({
        room_id: roomData.id,
        user_id: userId,
        role: 'owner',
      });

    if (memberError) {
      console.error('Error adding room member:', memberError);
      // Room was created but member wasn't added - still return success
    }

    // Map Supabase room to Room type
    const room: Room = {
      id: roomData.id,
      name: name.trim(),
      description: description?.trim(),
      owner_id: userId,
      roomCode: normalizedCode,
      is_public: isPublic,
      max_members: maxPlayers,
      created_at: new Date(roomData.created_at),
      updated_at: new Date(roomData.created_at),
    };

    return {
      success: true,
      data: room,
    };
  } catch (error: any) {
    console.error('Error in createRoom:', error);
    return {
      success: false,
      error: new ArenaError(
        error.message || 'Failed to create room',
        ErrorCodes.INVALID_INPUT
      ),
    };
  }
}

/**
 * Get room by ID
 * Note: This still uses in-memory store for backward compatibility
 * For Supabase rooms, use getRoomByCode() instead
 * Requires user to be a member of the room
 */
export async function getRoom(roomId: string): Promise<Result<Room, ArenaError>> {
  try {
    const userId = await getDeviceId();

    // Try Supabase first
    const { data: roomData, error } = await supabase
      .from('rooms')
      .select('*')
      .eq('id', roomId)
      .single();

    if (roomData && !error) {
      // Check if user is a member of this room
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
            'You are not a member of this room',
            ErrorCodes.NOT_MEMBER
          ),
        };
      }

      // Map Supabase room to Room type
      const room: Room = {
        id: roomData.id,
        name: roomData.name || `Room ${roomData.code}`,
        description: roomData.description || undefined,
        owner_id: roomData.host_id,
        roomCode: roomData.code,
        is_public: false,
        max_members: roomData.max_players,
        created_at: new Date(roomData.created_at),
        updated_at: new Date(roomData.created_at),
      };
      return {
        success: true,
        data: room,
      };
    }

    // Fallback to in-memory store for backward compatibility
    let room = store.getRoomById(roomId);
    if (!room) {
      return {
        success: false,
        error: new ArenaError(
          'Room not found',
          ErrorCodes.ROOM_NOT_FOUND
        ),
      };
    }

    // Check membership for in-memory rooms too
    const isMember = store.isRoomMember(roomId, userId);
    if (!isMember) {
      return {
        success: false,
        error: new ArenaError(
          'You are not a member of this room',
          ErrorCodes.NOT_MEMBER
        ),
      };
    }

    return {
      success: true,
      data: room,
    };
  } catch (error: any) {
    return {
      success: false,
      error: new ArenaError(
        error.message || 'Failed to get room',
        ErrorCodes.INVALID_INPUT
      ),
    };
  }
}

/**
 * Get all rooms for current user (Supabase-backed)
 */
export async function getUserRooms(): Promise<Result<Room[], ArenaError>> {
  try {
    const userId = await getDeviceId();

    // Get all rooms where user is a member
    const { data: members, error: membersError } = await supabase
      .from('room_members')
      .select('room_id')
      .eq('user_id', userId);

    if (membersError) {
      console.error('Error getting user rooms:', membersError);
      return {
        success: false,
        error: new ArenaError(
          'Failed to get rooms',
          ErrorCodes.INVALID_INPUT
        ),
      };
    }

    if (!members || members.length === 0) {
      return {
        success: true,
        data: [],
      };
    }

    // Get room details for each room_id
    const roomIds = members.map(m => m.room_id);
    const { data: roomsData, error: roomsError } = await supabase
      .from('rooms')
      .select('*')
      .in('id', roomIds);

    if (roomsError) {
      console.error('Error getting room details:', roomsError);
      return {
        success: false,
        error: new ArenaError(
          'Failed to get room details',
          ErrorCodes.INVALID_INPUT
        ),
      };
    }

    // Map Supabase rooms to Room type
    const rooms: Room[] = (roomsData || []).map(roomData => ({
      id: roomData.id,
      name: roomData.name || `Room ${roomData.code}`,
      description: roomData.description || undefined,
      owner_id: roomData.host_id,
      roomCode: roomData.code,
      is_public: false,
      max_members: roomData.max_players,
      created_at: new Date(roomData.created_at),
      updated_at: new Date(roomData.created_at),
    }));

    return {
      success: true,
      data: rooms,
    };
  } catch (error: any) {
    console.error('Error in getUserRooms:', error);
    return {
      success: false,
      error: new ArenaError(
        error.message || 'Failed to get rooms',
        ErrorCodes.INVALID_INPUT
      ),
    };
  }
}

/**
 * Join a room
 * Note: This still uses in-memory store for backward compatibility
 * For Supabase rooms, use joinRoomByCode() instead
 */
export async function joinRoom(roomId: string): Promise<Result<Room, ArenaError>> {
  try {
    const userId = await getDeviceId();

    // Try Supabase first
    const { data: roomData, error: roomError } = await supabase
      .from('rooms')
      .select('*')
      .eq('id', roomId)
      .single();

    if (roomData && !roomError) {
      // Check if already a member
      const { data: existingMember } = await supabase
        .from('room_members')
        .select('id')
        .eq('room_id', roomId)
        .eq('user_id', userId)
        .single();

      if (existingMember) {
        const room: Room = {
          id: roomData.id,
          name: roomData.name || `Room ${roomData.code}`,
          description: roomData.description || undefined,
          owner_id: roomData.host_id,
          roomCode: roomData.code,
          is_public: false,
          max_members: roomData.max_players,
          created_at: new Date(roomData.created_at),
          updated_at: new Date(roomData.created_at),
        };
        return {
          success: true,
          data: room,
        };
      }

      // Check room capacity
      const { data: members } = await supabase
        .from('room_members')
        .select('id')
        .eq('room_id', roomId);

      if (roomData.max_players && members && members.length >= roomData.max_players) {
        return {
          success: false,
          error: new ArenaError(
            'Room is full',
            ErrorCodes.ROOM_FULL
          ),
        };
      }

      // Add user as member
      const { error: insertError } = await supabase
        .from('room_members')
        .insert({
          room_id: roomId,
          user_id: userId,
          role: 'member',
        });

      if (insertError && insertError.code !== '23505') {
        return {
          success: false,
          error: new ArenaError(
            'Failed to join room',
            ErrorCodes.INVALID_INPUT
          ),
        };
      }

      const room: Room = {
        id: roomData.id,
        name: roomData.name || `Room ${roomData.code}`,
        description: roomData.description || undefined,
        owner_id: roomData.host_id,
        roomCode: roomData.code,
        is_public: false,
        max_members: roomData.max_players,
        created_at: new Date(roomData.created_at),
        updated_at: new Date(roomData.created_at),
      };

      return {
        success: true,
        data: room,
      };
    }

    // Fallback to in-memory store
    const room = store.getRoomById(roomId);
    if (!room) {
      return {
        success: false,
        error: new ArenaError(
          'Room not found',
          ErrorCodes.ROOM_NOT_FOUND
        ),
      };
    }

    // Check if already a member
    if (store.isRoomMember(roomId, userId)) {
      return {
        success: true,
        data: room,
      };
    }

    // Check room capacity
    if (room.max_members) {
      const currentMembers = store.getRoomMembers(roomId);
      if (currentMembers.length >= room.max_members) {
        return {
          success: false,
          error: new ArenaError(
            'Room is full',
            ErrorCodes.ROOM_FULL
          ),
        };
      }
    }

    // Add user as member
    try {
      store.addRoomMember({
        room_id: roomId,
        user_id: userId,
        role: 'member',
        joined_at: new Date(),
      });
    } catch (error) {
      // Already a member
      return {
        success: true,
        data: room,
      };
    }

    return {
      success: true,
      data: room,
    };
  } catch (error: any) {
    return {
      success: false,
      error: new ArenaError(
        error.message || 'Failed to join room',
        ErrorCodes.INVALID_INPUT
      ),
    };
  }
}

/**
 * Get room members
 * Requires user to be a member of the room
 */
export async function getRoomMembers(roomId: string): Promise<Result<RoomMember[], ArenaError>> {
  try {
    const userId = await getDeviceId();

    // Check membership first
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
          'You are not a member of this room',
          ErrorCodes.NOT_MEMBER
        ),
      };
    }

    // Try Supabase first
    const { data: membersData, error } = await supabase
      .from('room_members')
      .select('*')
      .eq('room_id', roomId);

    if (membersData && !error) {
      // Map Supabase members to RoomMember type
      const members: RoomMember[] = membersData.map(m => ({
        id: m.id,
        room_id: m.room_id,
        user_id: m.user_id,
        role: m.role as 'owner' | 'admin' | 'member',
        joined_at: new Date(m.created_at),
      }));

      return {
        success: true,
        data: members,
      };
    }

    // Fallback to in-memory store
    const room = store.getRoomById(roomId);
    if (!room) {
      return {
        success: false,
        error: new ArenaError(
          'Room not found',
          ErrorCodes.ROOM_NOT_FOUND
        ),
      };
    }

    const members = store.getRoomMembers(roomId);
    return {
      success: true,
      data: members,
    };
  } catch (error: any) {
    return {
      success: false,
      error: new ArenaError(
        error.message || 'Failed to get room members',
        ErrorCodes.INVALID_INPUT
      ),
    };
  }
}

/**
 * Check if user is a member of a room
 */
export function isRoomMember(roomId: string, userId: string): boolean {
  return store.isRoomMember(roomId, userId);
}

/**
 * Require room membership (throws if not a member)
 */
export function requireRoomMembership(roomId: string, userId: string): void {
  if (!store.isRoomMember(roomId, userId)) {
    throw new ArenaError(
      'User is not a member of this room',
      ErrorCodes.NOT_MEMBER
    );
  }
}

/**
 * Get room by room code (Supabase-backed)
 */
export async function getRoomByCode(roomCode: string): Promise<Result<Room, ArenaError>> {
  try {
    const normalizedCode = roomCode.trim().toUpperCase();
    if (!normalizedCode) {
      return {
        success: false,
        error: new ArenaError(
          'Room code is required',
          ErrorCodes.INVALID_INPUT
        ),
      };
    }

    // Query Supabase for room by code
    const { data: roomData, error } = await supabase
      .from('rooms')
      .select('*')
      .eq('code', normalizedCode)
      .single();

    if (error || !roomData) {
      console.log('[getRoomByCode] Room not found for code:', normalizedCode);
      return {
        success: false,
        error: new ArenaError(
          'Room not found',
          ErrorCodes.ROOM_CODE_NOT_FOUND
        ),
      };
    }

    // Map Supabase room to Room type
    const room: Room = {
      id: roomData.id,
      name: roomData.name || `Room ${roomData.code}`,
      description: roomData.description || undefined,
      owner_id: roomData.host_id,
      roomCode: roomData.code,
      is_public: false,
      max_members: roomData.max_players,
      created_at: new Date(roomData.created_at),
      updated_at: new Date(roomData.created_at),
    };

    return {
      success: true,
      data: room,
    };
  } catch (error: any) {
    console.error('Error in getRoomByCode:', error);
    return {
      success: false,
      error: new ArenaError(
        error.message || 'Failed to get room',
        ErrorCodes.INVALID_INPUT
      ),
    };
  }
}

/**
 * Join room by room code (Supabase-backed)
 */
export async function joinRoomByCode(roomCode: string): Promise<Result<Room, ArenaError>> {
  try {
    const userId = await getDeviceId();

    // Get room by code
    const roomResult = await getRoomByCode(roomCode);
    if (!roomResult.success) {
      console.log('[joinRoomByCode] Failed to find room by code:', roomCode, roomResult.error);
      return roomResult;
    }

    const room = roomResult.data;

    // Check if already a member
    const { data: existingMember } = await supabase
      .from('room_members')
      .select('id')
      .eq('room_id', room.id)
      .eq('user_id', userId)
      .single();

    if (existingMember) {
      return {
        success: true,
        data: room, // Already a member, return success
      };
    }

    // Check room capacity
    const { data: members, error: membersError } = await supabase
      .from('room_members')
      .select('id')
      .eq('room_id', room.id);

    if (room.max_members && members && members.length >= room.max_members) {
      return {
        success: false,
        error: new ArenaError(
          'Room is full',
          ErrorCodes.ROOM_FULL
        ),
      };
    }

    // Add user as member
    const { error: insertError } = await supabase
      .from('room_members')
      .insert({
        room_id: room.id,
        user_id: userId,
        role: 'member',
      });

    if (insertError) {
      // Check if it's a unique constraint violation (already a member)
      if (insertError.code === '23505') {
        return {
          success: true,
          data: room,
        };
      }
      console.error('Error adding room member:', insertError);
      return {
        success: false,
        error: new ArenaError(
          'Failed to join room',
          ErrorCodes.INVALID_INPUT
        ),
      };
    }

    return {
      success: true,
      data: room,
    };
  } catch (error: any) {
    console.error('Error in joinRoomByCode:', error);
    return {
      success: false,
      error: new ArenaError(
        error.message || 'Failed to join room',
        ErrorCodes.INVALID_INPUT
      ),
    };
  }
}

/**
 * Update room name
 * Only the owner can update the room name
 */
export async function updateRoomName(
  roomId: string,
  newName: string
): Promise<Result<Room, ArenaError>> {
  try {
    const userId = await getDeviceId();

    // Validation
    if (!newName || newName.trim().length === 0) {
      return {
        success: false,
        error: new ArenaError(
          'Room name is required',
          ErrorCodes.INVALID_INPUT
        ),
      };
    }

    if (newName.length > 50) {
      return {
        success: false,
        error: new ArenaError(
          'Room name must be 50 characters or less',
          ErrorCodes.INVALID_INPUT
        ),
      };
    }

    // Try Supabase first
    const { data: roomData, error: roomError } = await supabase
      .from('rooms')
      .select('*')
      .eq('id', roomId)
      .single();

    if (roomData && !roomError) {
      // Check if user is owner
      if (roomData.host_id !== userId) {
        return {
          success: false,
          error: new ArenaError(
            'Only the room owner can update the room name',
            ErrorCodes.NOT_HOST
          ),
        };
      }

      // Update room in Supabase
      const { data: updatedData, error: updateError } = await supabase
        .from('rooms')
        .update({ name: newName.trim() })
        .eq('id', roomId)
        .select()
        .single();

      if (updateError || !updatedData) {
        return {
          success: false,
          error: new ArenaError(
            'Failed to update room name',
            ErrorCodes.INVALID_INPUT
          ),
        };
      }

      const room: Room = {
        id: updatedData.id,
        name: updatedData.name || `Room ${updatedData.code}`,
        description: updatedData.description || undefined,
        owner_id: updatedData.host_id,
        roomCode: updatedData.code,
        is_public: false,
        max_members: updatedData.max_players,
        created_at: new Date(updatedData.created_at),
        updated_at: new Date(updatedData.created_at),
      };

      return {
        success: true,
        data: room,
      };
    }

    // Fallback to in-memory store
    const room = store.getRoomById(roomId);
    if (!room) {
      return {
        success: false,
        error: new ArenaError(
          'Room not found',
          ErrorCodes.ROOM_NOT_FOUND
        ),
      };
    }

    // Check if user is owner
    if (room.owner_id !== userId) {
      return {
        success: false,
        error: new ArenaError(
          'Only the room owner can update the room name',
          ErrorCodes.NOT_HOST
        ),
      };
    }

    // Update room
    const updated = store.updateRoom(roomId, {
      name: newName.trim(),
    });

    if (!updated) {
      return {
        success: false,
        error: new ArenaError(
          'Failed to update room name',
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
        error.message || 'Failed to update room name',
        ErrorCodes.INVALID_INPUT
      ),
    };
  }
}

/**
 * Rotate/regenerate room code
 * Only the owner can rotate the room code
 */
export async function rotateRoomCode(roomId: string): Promise<Result<Room, ArenaError>> {
  try {
    const userId = await getDeviceId();

    // Try Supabase first
    const { data: roomData, error: roomError } = await supabase
      .from('rooms')
      .select('*')
      .eq('id', roomId)
      .single();

    if (roomData && !roomError) {
      // Check if user is owner
      if (roomData.host_id !== userId) {
        return {
          success: false,
          error: new ArenaError(
            'Only the room owner can rotate the room code',
            ErrorCodes.NOT_HOST
          ),
        };
      }

      // Generate new unique room code
      const newCode = await generateUniqueRoomCode();

      // Update room code in Supabase
      const { data: updatedData, error: updateError } = await supabase
        .from('rooms')
        .update({ code: newCode })
        .eq('id', roomId)
        .select()
        .single();

      if (updateError || !updatedData) {
        return {
          success: false,
          error: new ArenaError(
            'Failed to rotate room code',
            ErrorCodes.INVALID_INPUT
          ),
        };
      }

      const room: Room = {
        id: updatedData.id,
        name: updatedData.name || `Room ${updatedData.code}`,
        description: updatedData.description || undefined,
        owner_id: updatedData.host_id,
        roomCode: updatedData.code,
        is_public: false,
        max_members: updatedData.max_players,
        created_at: new Date(updatedData.created_at),
        updated_at: new Date(updatedData.created_at),
      };

      return {
        success: true,
        data: room,
      };
    }

    // Fallback to in-memory store
    const room = store.getRoomById(roomId);
    if (!room) {
      return {
        success: false,
        error: new ArenaError(
          'Room not found',
          ErrorCodes.ROOM_NOT_FOUND
        ),
      };
    }

    // Check if user is owner
    if (room.owner_id !== userId) {
      return {
        success: false,
        error: new ArenaError(
          'Only the room owner can rotate the room code',
          ErrorCodes.NOT_HOST
        ),
      };
    }

    // Generate new unique room code
    const newCode = await generateUniqueRoomCode();

    // Update room code
    const updated = store.updateRoom(roomId, {
      roomCode: newCode,
    });

    if (!updated) {
      return {
        success: false,
        error: new ArenaError(
          'Failed to rotate room code',
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
        error.message || 'Failed to rotate room code',
        ErrorCodes.INVALID_INPUT
      ),
    };
  }
}

/**
 * Delete a room
 * Only the owner can delete the room
 */
export async function deleteRoom(roomId: string): Promise<Result<void, ArenaError>> {
  try {
    const userId = await getDeviceId();

    // Try Supabase first
    const { data: roomData, error: roomError } = await supabase
      .from('rooms')
      .select('*')
      .eq('id', roomId)
      .single();

    if (roomData && !roomError) {
      // Check if user is owner
      if (roomData.host_id !== userId) {
        return {
          success: false,
          error: new ArenaError(
            'Only the room owner can delete the room',
            ErrorCodes.NOT_HOST
          ),
        };
      }

      // Delete room (cascade will delete members)
      const { error: deleteError } = await supabase
        .from('rooms')
        .delete()
        .eq('id', roomId);

      if (deleteError) {
        return {
          success: false,
          error: new ArenaError(
            'Failed to delete room',
            ErrorCodes.INVALID_INPUT
          ),
        };
      }

      return {
        success: true,
        data: undefined,
      };
    }

    // Fallback to in-memory store
    const room = store.getRoomById(roomId);
    if (!room) {
      return {
        success: false,
        error: new ArenaError(
          'Room not found',
          ErrorCodes.ROOM_NOT_FOUND
        ),
      };
    }

    // Check if user is owner
    if (room.owner_id !== userId) {
      return {
        success: false,
        error: new ArenaError(
          'Only the room owner can delete the room',
          ErrorCodes.NOT_HOST
        ),
      };
    }

    // Delete room (this will cascade delete members and arenas)
    const deleted = store.deleteRoom(roomId);
    if (!deleted) {
      return {
        success: false,
        error: new ArenaError(
          'Failed to delete room',
          ErrorCodes.INVALID_INPUT
        ),
      };
    }

    return {
      success: true,
      data: undefined,
    };
  } catch (error: any) {
    return {
      success: false,
      error: new ArenaError(
        error.message || 'Failed to delete room',
        ErrorCodes.INVALID_INPUT
      ),
    };
  }
}
