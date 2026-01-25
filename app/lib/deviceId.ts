/**
 * Social Arena - Device ID Utility
 * 
 * Manages a persistent device ID stored in AsyncStorage.
 * Used as userId before authentication is implemented.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const DEVICE_ID_KEY = '@social_arena:device_id';

/**
 * Get or create a device ID
 * Returns a UUID stored in AsyncStorage, creating one if it doesn't exist
 */
export async function getDeviceId(): Promise<string> {
  try {
    let deviceId = await AsyncStorage.getItem(DEVICE_ID_KEY);
    
    if (!deviceId) {
      // Generate a new UUID v4
      deviceId = generateUUID();
      await AsyncStorage.setItem(DEVICE_ID_KEY, deviceId);
    }
    
    return deviceId;
  } catch (error) {
    console.error('Error getting device ID:', error);
    // Fallback: generate a temporary ID (won't persist across app restarts)
    return generateUUID();
  }
}

/**
 * Generate a UUID v4
 */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

