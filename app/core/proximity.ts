/**
 * Social Arena - Proximity-Based Capture Engine
 * 
 * Real-time proximity detection for Predators mode.
 * Automatically captures prey when hunters get close enough for long enough.
 */

import { Arena, ArenaParticipant } from './types';
import { store } from './store';
import { capturePrey } from './arenas';

// ============================================================================
// CONSTANTS
// ============================================================================

export const CAPTURE_DISTANCE_METERS = 2.5; // Distance required for capture
export const CAPTURE_HOLD_MS = 1500; // Duration hunter must maintain proximity
export const WARNING_DISTANCE_METERS = 10; // Distance for warning feedback
export const PROXIMITY_CHECK_INTERVAL_MS = 1500; // Check every 1.5 seconds

// ============================================================================
// DISTANCE CALCULATION
// ============================================================================

/**
 * Calculate distance between two coordinates using Haversine formula
 * Returns distance in meters
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

// ============================================================================
// PROXIMITY TRACKING
// ============================================================================

interface HunterProximityState {
  hunterId: string;
  closeContactStartTime: number | null; // Timestamp when hunter entered capture range
  lastDistance: number;
}

class ProximityTracker {
  private arenaId: string;
  private hunterStates: Map<string, HunterProximityState> = new Map();
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;
  private captureFired = false; // Prevent multiple captures

  constructor(arenaId: string) {
    this.arenaId = arenaId;
  }

  /**
   * Start proximity monitoring loop
   */
  start(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.captureFired = false;

    // Initial check
    this.checkProximity();

    // Set up interval
    this.intervalId = setInterval(() => {
      this.checkProximity();
    }, PROXIMITY_CHECK_INTERVAL_MS);
  }

  /**
   * Stop proximity monitoring
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    this.hunterStates.clear();
  }

  /**
   * Check proximity between all hunters and prey
   */
  private checkProximity(): void {
    // Safety: Don't check if capture already fired
    if (this.captureFired) {
      return;
    }

    // Get arena
    const arena = store.getArenaById(this.arenaId);
    if (!arena || arena.status !== 'active' || arena.mode !== 'predators') {
      this.stop();
      return;
    }

    // Get participants
    const participants = store.getArenaParticipants(this.arenaId);
    const joinedParticipants = participants.filter((p) => p.status === 'joined');

    // Find prey
    const prey = joinedParticipants.find((p) => p.role === 'prey');
    if (!prey) {
      // No prey, skip check
      return;
    }

    // Safety: Prey must have valid coordinates
    if (
      prey.last_latitude === undefined ||
      prey.last_longitude === undefined
    ) {
      return;
    }

    // Find all hunters
    const hunters = joinedParticipants.filter((p) => p.role === 'hunter');

    // Check each hunter's proximity to prey
    for (const hunter of hunters) {
      // Safety: Hunter must have valid coordinates
      if (
        hunter.last_latitude === undefined ||
        hunter.last_longitude === undefined
      ) {
        // Reset this hunter's state if no coordinates
        this.hunterStates.delete(hunter.user_id);
        continue;
      }

      // Calculate distance
      const distance = calculateDistance(
        prey.last_latitude,
        prey.last_longitude,
        hunter.last_latitude,
        hunter.last_longitude
      );

      // Update hunter state
      let hunterState = this.hunterStates.get(hunter.user_id);
      if (!hunterState) {
        hunterState = {
          hunterId: hunter.user_id,
          closeContactStartTime: null,
          lastDistance: distance,
        };
        this.hunterStates.set(hunter.user_id, hunterState);
      }

      hunterState.lastDistance = distance;

      // Check if within capture distance
      if (distance <= CAPTURE_DISTANCE_METERS) {
        // Hunter is in capture range
        const now = Date.now();

        if (hunterState.closeContactStartTime === null) {
          // Just entered capture range - start timer
          hunterState.closeContactStartTime = now;
        } else {
          // Already in range - check if held long enough
          const holdDuration = now - hunterState.closeContactStartTime;
          if (holdDuration >= CAPTURE_HOLD_MS) {
            // Capture condition met!
            this.fireCapture(hunter.user_id, prey.user_id);
            return; // Exit after capture
          }
        }
      } else {
        // Hunter moved out of capture range - reset timer
        hunterState.closeContactStartTime = null;
      }
    }
  }

  /**
   * Fire capture event
   */
  private fireCapture(hunterId: string, preyId: string): void {
    if (this.captureFired) {
      return; // Already captured
    }

    this.captureFired = true;
    this.stop(); // Stop monitoring

    try {
      // Call capture function
      const result = capturePrey(this.arenaId, preyId, hunterId);
      if (!result.success) {
        console.error('Capture failed:', result.error.message);
        // Reset capture flag to allow retry
        this.captureFired = false;
      }
    } catch (error) {
      console.error('Error firing capture:', error);
      // Reset capture flag to allow retry
      this.captureFired = false;
    }
  }

  /**
   * Get proximity state for a specific hunter
   */
  getHunterProximityState(hunterId: string): HunterProximityState | null {
    return this.hunterStates.get(hunterId) || null;
  }

  /**
   * Get closest hunter distance to prey
   */
  getClosestHunterDistance(): number | null {
    let minDistance: number | null = null;

    for (const state of this.hunterStates.values()) {
      if (minDistance === null || state.lastDistance < minDistance) {
        minDistance = state.lastDistance;
      }
    }

    return minDistance;
  }

  /**
   * Get distance from a specific hunter to prey
   */
  getHunterDistance(hunterId: string): number | null {
    const state = this.hunterStates.get(hunterId);
    return state ? state.lastDistance : null;
  }
}

// ============================================================================
// PROXIMITY MANAGER (Singleton per arena)
// ============================================================================

const proximityTrackers: Map<string, ProximityTracker> = new Map();

/**
 * Start proximity tracking for an arena
 */
export function startProximityTracking(arenaId: string): void {
  // Stop existing tracker if any
  stopProximityTracking(arenaId);

  // Create and start new tracker
  const tracker = new ProximityTracker(arenaId);
  proximityTrackers.set(arenaId, tracker);
  tracker.start();
}

/**
 * Stop proximity tracking for an arena
 */
export function stopProximityTracking(arenaId: string): void {
  const tracker = proximityTrackers.get(arenaId);
  if (tracker) {
    tracker.stop();
    proximityTrackers.delete(arenaId);
  }
}

/**
 * Get proximity tracker for an arena (for querying state)
 */
export function getProximityTracker(arenaId: string): ProximityTracker | null {
  return proximityTrackers.get(arenaId) || null;
}

/**
 * Get distance from hunter to prey
 */
export function getHunterDistance(
  arenaId: string,
  hunterId: string
): number | null {
  const tracker = getProximityTracker(arenaId);
  return tracker ? tracker.getHunterDistance(hunterId) : null;
}

/**
 * Get closest hunter distance to prey
 */
export function getClosestHunterDistance(arenaId: string): number | null {
  const tracker = getProximityTracker(arenaId);
  return tracker ? tracker.getClosestHunterDistance() : null;
}

