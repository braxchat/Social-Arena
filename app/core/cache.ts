/**
 * Social Arena - Cache Management
 * 
 * Utilities for clearing cached data and resetting app state.
 * 
 * NOTE: This is TEMPORARY for development/testing purposes only.
 * TODO: Remove this entire file and all references when ready for production.
 */

import { store } from './store';
import { setCurrentUser } from './auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DEVICE_ID_KEY = '@social_arena:device_id';

/**
 * Clear all cached users and data
 * This will:
 * - Clear in-memory store (users, rooms, arenas, participants)
 * - Clear device ID from AsyncStorage
 * - Clear current user session
 */
export async function clearAllCache(): Promise<void> {
  try {
    // Clear in-memory store
    store.clear();
    
    // Clear device ID from AsyncStorage
    await AsyncStorage.removeItem(DEVICE_ID_KEY);
    
    // Clear current user session
    setCurrentUser(null);
    
    console.log('All cached data cleared');
  } catch (error) {
    console.error('Error clearing cache:', error);
    throw error;
  }
}

/**
 * Clear only in-memory store (keeps device ID and user session)
 */
export function clearInMemoryStore(): void {
  store.clear();
  console.log('In-memory store cleared');
}

/**
 * Clear only device ID (keeps in-memory store and user session)
 */
export async function clearDeviceId(): Promise<void> {
  try {
    await AsyncStorage.removeItem(DEVICE_ID_KEY);
    console.log('Device ID cleared');
  } catch (error) {
    console.error('Error clearing device ID:', error);
    throw error;
  }
}
