/**
 * Social Arena - In-Memory State Store
 * 
 * This is a temporary local engine that simulates server state.
 * In production, this will be replaced by API calls to a real server.
 */

import {
  User,
  Room,
  RoomMember,
  Arena,
  ArenaParticipant,
} from './types';

// ============================================================================
// IN-MEMORY STORES
// ============================================================================

class InMemoryStore {
  private users: Map<string, User> = new Map();
  private rooms: Map<string, Room> = new Map();
  private roomMembers: Map<string, RoomMember> = new Map(); // key: `${roomId}:${userId}`
  private roomByRoomCode: Map<string, Room> = new Map(); // key: roomCode
  private arenas: Map<string, Arena> = new Map();
  private arenaParticipants: Map<string, ArenaParticipant> = new Map(); // key: `${arenaId}:${userId}`
  
  private userIdCounter = 1;
  private roomIdCounter = 1;
  private arenaIdCounter = 1;
  private memberIdCounter = 1;
  private participantIdCounter = 1;

  // ============================================================================
  // USER OPERATIONS
  // ============================================================================

  createUser(user: Omit<User, 'id' | 'created_at' | 'updated_at'>): User {
    const id = `user-${this.userIdCounter++}`;
    const now = new Date();
    const newUser: User = {
      ...user,
      id,
      created_at: now,
      updated_at: now,
    };
    this.users.set(id, newUser);
    return newUser;
  }

  getUserById(id: string): User | undefined {
    return this.users.get(id);
  }

  getUserByEmail(email: string): User | undefined {
    for (const user of this.users.values()) {
      if (user.email === email) {
        return user;
      }
    }
    return undefined;
  }

  getUserByUsername(username: string): User | undefined {
    for (const user of this.users.values()) {
      if (user.username === username) {
        return user;
      }
    }
    return undefined;
  }

  updateUser(id: string, updates: Partial<User>): User | undefined {
    const user = this.users.get(id);
    if (!user) return undefined;
    
    const updated: User = {
      ...user,
      ...updates,
      updated_at: new Date(),
    };
    this.users.set(id, updated);
    return updated;
  }

  // ============================================================================
  // ROOM OPERATIONS
  // ============================================================================

  createRoom(room: Omit<Room, 'id' | 'created_at' | 'updated_at'>): Room {
    const id = `room-${this.roomIdCounter++}`;
    const now = new Date();
    const newRoom: Room = {
      ...room,
      id,
      created_at: now,
      updated_at: now,
    };
    this.rooms.set(id, newRoom);
    // Index by roomCode for fast lookup
    if (newRoom.roomCode) {
      this.roomByRoomCode.set(newRoom.roomCode.toUpperCase(), newRoom);
    }
    return newRoom;
  }

  getRoomById(id: string): Room | undefined {
    return this.rooms.get(id);
  }

  getRoomByRoomCode(roomCode: string): Room | undefined {
    return this.roomByRoomCode.get(roomCode.toUpperCase());
  }

  getRoomsByUserId(userId: string): Room[] {
    const roomIds = new Set<string>();
    for (const member of this.roomMembers.values()) {
      if (member.user_id === userId) {
        roomIds.add(member.room_id);
      }
    }
    return Array.from(roomIds)
      .map(id => this.rooms.get(id))
      .filter((room): room is Room => room !== undefined);
  }

  updateRoom(id: string, updates: Partial<Room>): Room | undefined {
    const room = this.rooms.get(id);
    if (!room) return undefined;
    
    const updated: Room = {
      ...room,
      ...updates,
      updated_at: new Date(),
    };
    this.rooms.set(id, updated);
    
    // Update roomCode index if roomCode changed
    if (updates.roomCode !== undefined && updates.roomCode !== room.roomCode) {
      if (room.roomCode) {
        this.roomByRoomCode.delete(room.roomCode.toUpperCase());
      }
      if (updates.roomCode) {
        this.roomByRoomCode.set(updates.roomCode.toUpperCase(), updated);
      }
    }
    
    return updated;
  }

  deleteRoom(id: string): boolean {
    const room = this.rooms.get(id);
    if (!room) return false;

    // Remove from roomCode index
    if (room.roomCode) {
      this.roomByRoomCode.delete(room.roomCode.toUpperCase());
    }

    // Delete all room members
    const members = this.getRoomMembers(id);
    for (const member of members) {
      const key = `${id}:${member.user_id}`;
      this.roomMembers.delete(key);
    }

    // Delete all arenas in this room
    const arenas = this.getArenasByRoomId(id);
    for (const arena of arenas) {
      // Delete all arena participants
      const participants = this.getArenaParticipants(arena.id);
      for (const participant of participants) {
        const key = `${arena.id}:${participant.user_id}`;
        this.arenaParticipants.delete(key);
      }
      this.arenas.delete(arena.id);
    }

    // Delete the room
    return this.rooms.delete(id);
  }

  // ============================================================================
  // ROOM MEMBER OPERATIONS
  // ============================================================================

  addRoomMember(member: Omit<RoomMember, 'id' | 'joined_at'>): RoomMember {
    const id = `member-${this.memberIdCounter++}`;
    const key = `${member.room_id}:${member.user_id}`;
    
    // Check if already a member
    if (this.roomMembers.has(key)) {
      throw new Error('User is already a member of this room');
    }
    
    const newMember: RoomMember = {
      ...member,
      id,
      joined_at: new Date(),
    };
    this.roomMembers.set(key, newMember);
    return newMember;
  }

  getRoomMember(roomId: string, userId: string): RoomMember | undefined {
    const key = `${roomId}:${userId}`;
    return this.roomMembers.get(key);
  }

  getRoomMembers(roomId: string): RoomMember[] {
    const members: RoomMember[] = [];
    for (const member of this.roomMembers.values()) {
      if (member.room_id === roomId) {
        members.push(member);
      }
    }
    return members;
  }

  isRoomMember(roomId: string, userId: string): boolean {
    return this.getRoomMember(roomId, userId) !== undefined;
  }

  removeRoomMember(roomId: string, userId: string): boolean {
    const key = `${roomId}:${userId}`;
    return this.roomMembers.delete(key);
  }

  // ============================================================================
  // ARENA OPERATIONS
  // ============================================================================

  createArena(arena: Omit<Arena, 'id' | 'created_at' | 'updated_at'>): Arena {
    const id = `arena-${this.arenaIdCounter++}`;
    const now = new Date();
    const newArena: Arena = {
      ...arena,
      id,
      created_at: now,
      updated_at: now,
    };
    this.arenas.set(id, newArena);
    return newArena;
  }

  getArenaById(id: string): Arena | undefined {
    return this.arenas.get(id);
  }

  getArenasByRoomId(roomId: string): Arena[] {
    const arenas: Arena[] = [];
    for (const arena of this.arenas.values()) {
      if (arena.room_id === roomId) {
        arenas.push(arena);
      }
    }
    return arenas;
  }

  getActiveArenaByRoomId(roomId: string): Arena | undefined {
    for (const arena of this.arenas.values()) {
      if (arena.room_id === roomId && arena.status === 'active') {
        return arena;
      }
    }
    return undefined;
  }

  updateArena(id: string, updates: Partial<Arena>): Arena | undefined {
    const arena = this.arenas.get(id);
    if (!arena) return undefined;
    
    const updated: Arena = {
      ...arena,
      ...updates,
      updated_at: new Date(),
    };
    this.arenas.set(id, updated);
    return updated;
  }

  // ============================================================================
  // ARENA PARTICIPANT OPERATIONS
  // ============================================================================

  createArenaParticipant(
    participant: Omit<ArenaParticipant, 'id' | 'created_at' | 'updated_at'>
  ): ArenaParticipant {
    const id = `participant-${this.participantIdCounter++}`;
    const key = `${participant.arena_id}:${participant.user_id}`;
    
    // Check if already a participant
    if (this.arenaParticipants.has(key)) {
      throw new Error('User is already a participant in this arena');
    }
    
    const now = new Date();
    const newParticipant: ArenaParticipant = {
      ...participant,
      id,
      created_at: now,
      updated_at: now,
    };
    this.arenaParticipants.set(key, newParticipant);
    return newParticipant;
  }

  getArenaParticipant(arenaId: string, userId: string): ArenaParticipant | undefined {
    const key = `${arenaId}:${userId}`;
    return this.arenaParticipants.get(key);
  }

  getArenaParticipants(arenaId: string): ArenaParticipant[] {
    const participants: ArenaParticipant[] = [];
    for (const participant of this.arenaParticipants.values()) {
      if (participant.arena_id === arenaId) {
        participants.push(participant);
      }
    }
    return participants;
  }

  getActiveArenaByUserId(userId: string): Arena | undefined {
    for (const participant of this.arenaParticipants.values()) {
      if (
        participant.user_id === userId &&
        participant.status === 'joined'
      ) {
        const arena = this.arenas.get(participant.arena_id);
        if (arena && arena.status === 'active') {
          return arena;
        }
      }
    }
    return undefined;
  }

  updateArenaParticipant(
    arenaId: string,
    userId: string,
    updates: Partial<ArenaParticipant>
  ): ArenaParticipant | undefined {
    const key = `${arenaId}:${userId}`;
    const participant = this.arenaParticipants.get(key);
    if (!participant) return undefined;
    
    const updated: ArenaParticipant = {
      ...participant,
      ...updates,
      updated_at: new Date(),
    };
    this.arenaParticipants.set(key, updated);
    return updated;
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  clear(): void {
    this.users.clear();
    this.rooms.clear();
    this.roomMembers.clear();
    this.roomByRoomCode.clear();
    this.arenas.clear();
    this.arenaParticipants.clear();
  }
}

// Singleton instance
export const store = new InMemoryStore();

