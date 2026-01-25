/**
 * Social Arena - Location Utilities
 * 
 * Helper functions for location management and fake coordinate generation.
 */

import { ArenaParticipant } from './types';
import { store } from './store';
import { requireAuth } from './auth';

// Mock center location (e.g., a park)
export const MOCK_CENTER = {
  latitude: 37.7749, // San Francisco
  longitude: -122.4194,
};

// Spread radius in degrees (approximately 500 meters)
const SPREAD_RADIUS = 0.005;

/**
 * Generate fake coordinates for a participant
 * Spreads players around the center point
 */
export function generateFakeCoordinates(
  arenaId: string,
  userId: string
): { latitude: number; longitude: number } {
  // Get existing participants to avoid overlap
  const participants = store.getArenaParticipants(arenaId);
  const existingLocations = participants
    .filter((p) => p.last_latitude && p.last_longitude)
    .map((p) => ({
      lat: p.last_latitude!,
      lng: p.last_longitude!,
    }));

  // Generate random angle and distance
  let attempts = 0;
  let latitude: number;
  let longitude: number;

  do {
    const angle = Math.random() * 2 * Math.PI;
    const distance = Math.random() * SPREAD_RADIUS;
    latitude = MOCK_CENTER.latitude + distance * Math.cos(angle);
    longitude = MOCK_CENTER.longitude + distance * Math.sin(angle);
    attempts++;
  } while (
    attempts < 10 &&
    existingLocations.some(
      (loc) =>
        Math.abs(loc.lat - latitude) < 0.0005 &&
        Math.abs(loc.lng - longitude) < 0.0005
    )
  );

  return { latitude, longitude };
}

/**
 * Initialize locations for all participants when arena starts
 */
export function initializeParticipantLocations(arenaId: string): void {
  const participants = store.getArenaParticipants(arenaId);
  const joinedParticipants = participants.filter((p) => p.status === 'joined');

  for (const participant of joinedParticipants) {
    if (!participant.last_latitude || !participant.last_longitude) {
      const coords = generateFakeCoordinates(arenaId, participant.user_id);
      const now = new Date();
      store.updateArenaParticipant(arenaId, participant.user_id, {
        last_latitude: coords.latitude,
        last_longitude: coords.longitude,
        last_location_updated_at: now,
      });
    }
  }
}

/**
 * Update participant location
 */
export function updateParticipantLocation(
  arenaId: string,
  userId: string,
  latitude: number,
  longitude: number
): void {
  requireAuth();

  // Validate coordinates
  if (
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw new Error('Invalid coordinates');
  }

  const now = new Date();
  store.updateArenaParticipant(arenaId, userId, {
    last_latitude: latitude,
    last_longitude: longitude,
    last_location_updated_at: now,
  });
}

