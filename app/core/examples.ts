/**
 * Social Arena - Example Usage Flows
 * 
 * Demonstrates how to use the core engine to build game flows.
 * These examples show the engine in action with proper error handling.
 */

import {
  // Auth
  signup,
  login,
  getCurrentUser,
  
  // Rooms
  createRoom,
  joinRoom,
  getUserRooms,
  
  // Arenas
  createArena,
  startArena,
  endArena,
  getArenaWithParticipants,
  
  // Participants
  joinArena,
  leaveArena,
  assignRole,
  
  // Store
  store,
} from './index';

// ============================================================================
// EXAMPLE 1: Complete Game Flow
// ============================================================================

export function exampleCompleteGameFlow() {
  console.log('=== Example 1: Complete Game Flow ===\n');

  // Clear store for clean start
  store.clear();

  // 1. Signup user
  console.log('1. Signing up user...');
  const signupResult = signup('alice@example.com', 'password123', 'alice');
  if (!signupResult.success) {
    console.error('Signup failed:', signupResult.error.message);
    return;
  }
  console.log('✓ User signed up:', signupResult.data.username);

  // 2. Create room
  console.log('\n2. Creating room...');
  const roomResult = createRoom('Hunters Club', 'A room for hunters');
  if (!roomResult.success) {
    console.error('Create room failed:', roomResult.error.message);
    return;
  }
  console.log('✓ Room created:', roomResult.data.name);

  // 3. Create arena
  console.log('\n3. Creating arena...');
  const arenaResult = createArena(roomResult.data.id, 'predators', 12);
  if (!arenaResult.success) {
    console.error('Create arena failed:', arenaResult.error.message);
    return;
  }
  console.log('✓ Arena created:', arenaResult.data.id, 'Status:', arenaResult.data.status);

  // 4. Join as prey
  console.log('\n4. Joining as prey...');
  const joinPreyResult = joinArena(arenaResult.data.id, 'prey');
  if (!joinPreyResult.success) {
    console.error('Join failed:', joinPreyResult.error.message);
    return;
  }
  console.log('✓ Joined as prey');

  // 5. Signup and join as hunters
  console.log('\n5. Adding hunters...');
  const hunter1Result = signup('bob@example.com', 'password123', 'bob');
  if (!hunter1Result.success) {
    console.error('Signup failed:', hunter1Result.error.message);
    return;
  }
  login('bob@example.com', 'password123');
  joinRoom(roomResult.data.id);
  const joinHunter1Result = joinArena(arenaResult.data.id, 'hunter');
  if (!joinHunter1Result.success) {
    console.error('Join failed:', joinHunter1Result.error.message);
    return;
  }
  console.log('✓ Hunter 1 joined');

  const hunter2Result = signup('charlie@example.com', 'password123', 'charlie');
  if (!hunter2Result.success) {
    console.error('Signup failed:', hunter2Result.error.message);
    return;
  }
  login('charlie@example.com', 'password123');
  joinRoom(roomResult.data.id);
  const joinHunter2Result = joinArena(arenaResult.data.id, 'hunter');
  if (!joinHunter2Result.success) {
    console.error('Join failed:', joinHunter2Result.error.message);
    return;
  }
  console.log('✓ Hunter 2 joined');

  // 6. Switch back to host and start arena
  console.log('\n6. Starting arena...');
  login('alice@example.com', 'password123');
  const startResult = startArena(arenaResult.data.id);
  if (!startResult.success) {
    console.error('Start failed:', startResult.error.message);
    return;
  }
  console.log('✓ Arena started! Status:', startResult.data.status);
  console.log('  Started at:', startResult.data.started_at);

  // 7. Get arena state
  console.log('\n7. Getting arena state...');
  const arenaStateResult = getArenaWithParticipants(arenaResult.data.id);
  if (arenaStateResult.success) {
    console.log('✓ Arena state:');
    console.log('  Status:', arenaStateResult.data.status);
    console.log('  Participants:', arenaStateResult.data.participants.length);
    arenaStateResult.data.participants.forEach(p => {
      console.log(`    - ${p.user_id}: ${p.role} (${p.status})`);
    });
  }

  // 8. End arena
  console.log('\n8. Ending arena...');
  const endResult = endArena(arenaResult.data.id, 'host_ended');
  if (!endResult.success) {
    console.error('End failed:', endResult.error.message);
    return;
  }
  console.log('✓ Arena ended! Status:', endResult.data.status);
  console.log('  Ended at:', endResult.data.ended_at);
  console.log('  Reason:', endResult.data.ended_reason);
}

// ============================================================================
// EXAMPLE 2: Invariant Enforcement
// ============================================================================

export function exampleInvariantEnforcement() {
  console.log('\n\n=== Example 2: Invariant Enforcement ===\n');

  store.clear();

  // Setup: Create user, room, and arena
  signup('user1@example.com', 'password123', 'user1');
  const roomResult = createRoom('Test Room');
  if (!roomResult.success) return;
  
  const arena1Result = createArena(roomResult.data.id);
  if (!arena1Result.success) return;

  // Test Invariant 1: Cannot create second active arena in same room
  console.log('Test: Cannot create second arena in room with active arena...');
  
  // Start first arena
  joinArena(arena1Result.data.id, 'prey');
  signup('user2@example.com', 'password123', 'user2');
  login('user2@example.com', 'password123');
  joinRoom(roomResult.data.id);
  joinArena(arena1Result.data.id, 'hunter');
  signup('user3@example.com', 'password123', 'user3');
  login('user3@example.com', 'password123');
  joinRoom(roomResult.data.id);
  joinArena(arena1Result.data.id, 'hunter');
  
  login('user1@example.com', 'password123');
  startArena(arena1Result.data.id);

  // Try to create second arena
  const arena2Result = createArena(roomResult.data.id);
  if (!arena2Result.success) {
    console.log('✓ Invariant 1 enforced:', arena2Result.error.message);
  } else {
    console.log('✗ Invariant 1 failed: Should not allow second arena');
  }

  // Test Invariant 2: Cannot join second arena while in active arena
  console.log('\nTest: Cannot join second arena while in active arena...');
  
  // Create second arena in different room
  signup('user4@example.com', 'password123', 'user4');
  const room2Result = createRoom('Test Room 2');
  if (!room2Result.success) return;
  
  const arena2Result2 = createArena(room2Result.data.id);
  if (!arena2Result2.success) return;

  // User 2 is in active arena 1, try to join arena 2
  login('user2@example.com', 'password123');
  joinRoom(room2Result.data.id);
  const joinResult = joinArena(arena2Result2.data.id);
  if (!joinResult.success) {
    console.log('✓ Invariant 2 enforced:', joinResult.error.message);
  } else {
    console.log('✗ Invariant 2 failed: Should not allow join');
  }

  // Test Invariant 3: Cannot join active arena
  console.log('\nTest: Cannot join active arena...');
  signup('user5@example.com', 'password123', 'user5');
  login('user5@example.com', 'password123');
  joinRoom(roomResult.data.id);
  const joinActiveResult = joinArena(arena1Result.data.id);
  if (!joinActiveResult.success) {
    console.log('✓ Invariant 3 enforced:', joinActiveResult.error.message);
  } else {
    console.log('✗ Invariant 3 failed: Should not allow join');
  }

  // Test Invariant 4: Cannot rejoin after leaving active arena
  console.log('\nTest: Cannot rejoin after leaving active arena...');
  login('user2@example.com', 'password123');
  leaveArena(arena1Result.data.id);
  const rejoinResult = joinArena(arena1Result.data.id);
  if (!rejoinResult.success) {
    console.log('✓ Invariant 4 enforced:', rejoinResult.error.message);
  } else {
    console.log('✗ Invariant 4 failed: Should not allow rejoin');
  }
}

// ============================================================================
// EXAMPLE 3: Role Assignment
// ============================================================================

export function exampleRoleAssignment() {
  console.log('\n\n=== Example 3: Role Assignment ===\n');

  store.clear();

  // Setup
  signup('host@example.com', 'password123', 'host');
  const roomResult = createRoom('Role Test Room');
  if (!roomResult.success) return;
  
  const arenaResult = createArena(roomResult.data.id);
  if (!arenaResult.success) return;

  // Join as spectator
  joinArena(arenaResult.data.id, 'spectator');
  console.log('✓ Joined as spectator');

  // Assign self as prey (host can assign roles)
  const assignPreyResult = assignRole(arenaResult.data.id, getCurrentUser()!.id, 'prey');
  if (assignPreyResult.success) {
    console.log('✓ Assigned self as prey');
  } else {
    console.error('Assign failed:', assignPreyResult.error.message);
  }

  // Add hunters
  signup('hunter1@example.com', 'password123', 'hunter1');
  login('hunter1@example.com', 'password123');
  joinRoom(roomResult.data.id);
  joinArena(arenaResult.data.id, 'hunter');
  console.log('✓ Hunter 1 joined');

  signup('hunter2@example.com', 'password123', 'hunter2');
  login('hunter2@example.com', 'password123');
  joinRoom(roomResult.data.id);
  joinArena(arenaResult.data.id, 'hunter');
  console.log('✓ Hunter 2 joined');

  // Switch back to host and start
  login('host@example.com', 'password123');
  const startResult = startArena(arenaResult.data.id);
  if (startResult.success) {
    console.log('✓ Arena started with valid roles');
  } else {
    console.error('Start failed:', startResult.error.message);
  }
}

// ============================================================================
// RUN EXAMPLES
// ============================================================================

if (require.main === module) {
  exampleCompleteGameFlow();
  exampleInvariantEnforcement();
  exampleRoleAssignment();
}

