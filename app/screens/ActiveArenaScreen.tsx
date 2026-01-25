/**
 * Social Arena - Active Arena Screen
 * 
 * Shows active arena with live map view, participant markers, and proximity-based capture.
 * Uses real GPS location tracking and automatic capture detection.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Dimensions,
  Vibration,
} from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/AppNavigator';
import {
  getArena,
  getArenaParticipants,
  endArena,
  leaveArena,
  getCurrentUser,
  updateParticipantLocation,
  MOCK_CENTER,
  startProximityTracking,
  stopProximityTracking,
  getHunterDistance,
  getClosestHunterDistance,
  WARNING_DISTANCE_METERS,
  CAPTURE_DISTANCE_METERS,
} from '../core';
import { Arena, ArenaParticipant } from '../core/types';

type ActiveArenaScreenNavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  'ActiveArena'
>;
type ActiveArenaScreenRouteProp = RouteProp<RootStackParamList, 'ActiveArena'>;

interface Props {
  navigation: ActiveArenaScreenNavigationProp;
  route: ActiveArenaScreenRouteProp;
}

const { width, height } = Dimensions.get('window');

// Location update interval (5 seconds)
const LOCATION_UPDATE_INTERVAL = 5000;
// Proximity feedback update interval (1 second)
const PROXIMITY_FEEDBACK_INTERVAL = 1000;
// Debug mode toggle
const DEBUG_MODE = __DEV__; // Enable in development

export default function ActiveArenaScreen({ navigation, route }: Props) {
  const { arenaId } = route.params;
  const [arena, setArena] = useState<Arena | null>(null);
  const [participants, setParticipants] = useState<ArenaParticipant[]>([]);
  const [loading, setLoading] = useState(true);
  const [locationPermission, setLocationPermission] = useState<Location.PermissionStatus | null>(null);
  const [userLocation, setUserLocation] = useState<Location.LocationObject | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [showDebug, setShowDebug] = useState(DEBUG_MODE);
  
  // Proximity feedback state
  const [hunterDistance, setHunterDistance] = useState<number | null>(null);
  const [closestHunterDistance, setClosestHunterDistance] = useState<number | null>(null);
  const [showWarningBanner, setShowWarningBanner] = useState(false);
  const [showTargetNearby, setShowTargetNearby] = useState(false);
  const [showCaptureRange, setShowCaptureRange] = useState(false);
  
  const locationSubscriptionRef = useRef<Location.LocationSubscription | null>(null);
  const locationUpdateIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const proximityFeedbackIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastVibrationTimeRef = useRef<number>(0);
  const lastHapticTimeRef = useRef<number>(0);

  const currentUser = getCurrentUser();

  // Request location permissions
  const requestLocationPermission = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setLocationPermission(status);

      if (status !== 'granted') {
        setLocationError('Location permission is required to play');
        Alert.alert(
          'Location Permission Required',
          'Social Arena needs your location to track your position during gameplay. Please enable location permissions in settings.',
          [{ text: 'OK' }]
        );
        return false;
      }

      // Request background location if available
      try {
        await Location.requestBackgroundPermissionsAsync();
      } catch (error) {
        // Background permission not available on all platforms
        console.log('Background location permission not available');
      }

      return true;
    } catch (error) {
      console.error('Error requesting location permission:', error);
      setLocationError('Failed to request location permission');
      return false;
    }
  };

  // Start location tracking
  const startLocationTracking = async () => {
    if (!currentUser || !arena) return;

    // Check if already tracking
    if (locationSubscriptionRef.current) {
      return;
    }

    // Request permission first
    const hasPermission = await requestLocationPermission();
    if (!hasPermission) {
      return;
    }

    try {
      // Get initial location
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      setUserLocation(location);

      // Update location in store
      try {
        updateParticipantLocation(
          arenaId,
          currentUser.id,
          location.coords.latitude,
          location.coords.longitude
        );
        // Refresh participants to show updated location
        loadArenaData();
      } catch (error) {
        console.error('Error updating location in store:', error);
      }

      // Start watching location
      locationSubscriptionRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: LOCATION_UPDATE_INTERVAL,
          distanceInterval: 5, // Update every 5 meters
        },
        (location) => {
          setUserLocation(location);
          
          // Update location in store
          try {
            updateParticipantLocation(
              arenaId,
              currentUser.id,
              location.coords.latitude,
              location.coords.longitude
            );
          } catch (error) {
            console.error('Error updating location in store:', error);
          }
        }
      );

      // Also set up periodic refresh of participant data
      locationUpdateIntervalRef.current = setInterval(() => {
        loadArenaData();
      }, LOCATION_UPDATE_INTERVAL);
    } catch (error) {
      console.error('Error starting location tracking:', error);
      setLocationError('Failed to start location tracking');
    }
  };

  // Stop location tracking
  const stopLocationTracking = () => {
    if (locationSubscriptionRef.current) {
      locationSubscriptionRef.current.remove();
      locationSubscriptionRef.current = null;
    }
    if (locationUpdateIntervalRef.current) {
      clearInterval(locationUpdateIntervalRef.current);
      locationUpdateIntervalRef.current = null;
    }
    if (proximityFeedbackIntervalRef.current) {
      clearInterval(proximityFeedbackIntervalRef.current);
      proximityFeedbackIntervalRef.current = null;
    }
  };

  // Update proximity feedback
  const updateProximityFeedback = () => {
    if (!currentUser || !arena || arena.mode !== 'predators') {
      return;
    }

    const currentParticipant = participants.find(
      (p) => p.user_id === currentUser.id && p.status === 'joined'
    );

    if (!currentParticipant) {
      return;
    }

    if (currentParticipant.role === 'prey') {
      // Prey: Show closest hunter distance
      const closestDistance = getClosestHunterDistance(arenaId);
      setClosestHunterDistance(closestDistance);

      if (closestDistance !== null) {
        // Show warning banner if hunter within 10m
        setShowWarningBanner(closestDistance <= WARNING_DISTANCE_METERS);

        // Vibration warning when hunter within 10m
        if (closestDistance <= WARNING_DISTANCE_METERS) {
          const now = Date.now();
          if (now - lastVibrationTimeRef.current > 2000) {
            // Pulse vibration every 2 seconds
            Vibration.vibrate(200);
            lastVibrationTimeRef.current = now;
          }
        }
      }
    } else if (currentParticipant.role === 'hunter') {
      // Hunter: Show distance to prey
      const distance = getHunterDistance(arenaId, currentUser.id);
      setHunterDistance(distance);

      if (distance !== null) {
        // Show "Target nearby" when within 10m
        setShowTargetNearby(distance <= WARNING_DISTANCE_METERS);

        // Show capture range indicator and haptic feedback
        const inCaptureRange = distance <= CAPTURE_DISTANCE_METERS;
        setShowCaptureRange(inCaptureRange);

        if (inCaptureRange) {
          // Heavy haptic feedback when in capture range
          const now = Date.now();
          if (now - lastHapticTimeRef.current > 500) {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            lastHapticTimeRef.current = now;
          }
        } else if (distance <= WARNING_DISTANCE_METERS) {
          // Light haptic feedback when within warning range
          const now = Date.now();
          if (now - lastHapticTimeRef.current > 1000) {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            lastHapticTimeRef.current = now;
          }
        }
      }
    }
  };

  const loadArenaData = async () => {
    // Load arena
    const arenaResult = getArena(arenaId);
    if (arenaResult.success) {
      setArena(arenaResult.data);

      // If arena is not active, navigate away
      if (arenaResult.data.status === 'ended') {
        stopLocationTracking();
        stopProximityTracking(arenaId);
        navigation.replace('Results', { arenaId });
        return;
      } else if (arenaResult.data.status === 'lobby') {
        stopLocationTracking();
        stopProximityTracking(arenaId);
        navigation.replace('Lobby', { arenaId });
        return;
      }
    } else {
      Alert.alert('Error', arenaResult.error.message);
      stopLocationTracking();
      stopProximityTracking(arenaId);
      navigation.goBack();
      return;
    }

    // Load participants
    const participantsResult = getArenaParticipants(arenaId);
    if (participantsResult.success) {
      setParticipants(participantsResult.data);
    }
  };

  useEffect(() => {
    loadArenaData().then(() => {
      setLoading(false);
    });
  }, [arenaId]);

  // Start location tracking and proximity monitoring when arena is active
  useEffect(() => {
    if (!loading && arena && arena.status === 'active' && currentUser) {
      const currentParticipant = participants.find(
        (p) => p.user_id === currentUser.id && p.status === 'joined'
      );
      
      if (currentParticipant) {
        // Start location tracking
        startLocationTracking();

        // Start proximity tracking for predators mode
        if (arena.mode === 'predators') {
          startProximityTracking(arenaId);

          // Start proximity feedback loop
          proximityFeedbackIntervalRef.current = setInterval(() => {
            updateProximityFeedback();
          }, PROXIMITY_FEEDBACK_INTERVAL);
        }
      }
    }

    // Cleanup on unmount or when leaving
    return () => {
      stopLocationTracking();
      stopProximityTracking(arenaId);
    };
  }, [loading, arena, participants, currentUser]);

  // Refresh on focus
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      loadArenaData();
    });
    return unsubscribe;
  }, [navigation]);

  // Stop tracking when leaving screen
  useEffect(() => {
    return () => {
      stopLocationTracking();
      stopProximityTracking(arenaId);
    };
  }, []);

  const handleEndArena = () => {
    if (!arena) return;

    Alert.alert('End Arena?', 'Are you sure you want to end this arena?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End',
        style: 'destructive',
        onPress: async () => {
          stopLocationTracking();
          stopProximityTracking(arenaId);
          const result = await endArena(arenaId, 'host_ended');
          if (result.success) {
            navigation.replace('Results', { arenaId });
          } else {
            Alert.alert('Error', result.error.message);
          }
        },
      },
    ]);
  };

  const handleLeave = () => {
    Alert.alert(
      'Leave Arena?',
      'Leaving is final. You cannot rejoin this session. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            stopLocationTracking();
            stopProximityTracking(arenaId);
            const result = leaveArena(arenaId);
            if (result.success) {
              navigation.goBack();
            } else {
              Alert.alert('Error', result.error.message);
            }
          },
        },
      ]
    );
  };

  const getCurrentParticipant = () => {
    if (!currentUser) return null;
    return participants.find((p) => p.user_id === currentUser.id && p.status === 'joined');
  };

  const isHost = arena?.host_id === currentUser?.id;
  const currentParticipant = getCurrentParticipant();

  // Get participants with valid locations
  const participantsWithLocations = participants.filter(
    (p) =>
      p.status === 'joined' &&
      p.last_latitude !== undefined &&
      p.last_longitude !== undefined
  );

  // Determine map region
  const getMapRegion = (): Region => {
    if (userLocation) {
      return {
        latitude: userLocation.coords.latitude,
        longitude: userLocation.coords.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      };
    }
    
    if (currentParticipant && currentParticipant.last_latitude && currentParticipant.last_longitude) {
      return {
        latitude: currentParticipant.last_latitude,
        longitude: currentParticipant.last_longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      };
    }

    if (participantsWithLocations.length > 0) {
      return {
        latitude: participantsWithLocations[0].last_latitude!,
        longitude: participantsWithLocations[0].last_longitude!,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      };
    }

    // Fallback to mock center
    return {
      latitude: MOCK_CENTER.latitude,
      longitude: MOCK_CENTER.longitude,
      latitudeDelta: 0.02,
      longitudeDelta: 0.02,
    };
  };

  const mapRegion = getMapRegion();

  // Get marker color based on role
  const getMarkerColor = (role: string, isCurrentUser: boolean) => {
    if (isCurrentUser) {
      return role === 'prey' ? '#ff3b30' : role === 'hunter' ? '#34C759' : '#4A90E2';
    }
    return role === 'prey' ? '#ff6b6b' : role === 'hunter' ? '#51cf66' : '#74c0fc';
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#4A90E2" />
      </View>
    );
  }

  if (!arena) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Arena not found</Text>
      </View>
    );
  }

  // Calculate time remaining
  const timeRemaining = arena.started_at
    ? Math.max(
        0,
        arena.duration_minutes * 60 -
          Math.floor((Date.now() - arena.started_at.getTime()) / 1000)
      )
    : 0;
  const minutes = Math.floor(timeRemaining / 60);
  const seconds = timeRemaining % 60;

  return (
    <View style={styles.container}>
      {/* Map View */}
      <MapView
        style={styles.map}
        initialRegion={mapRegion}
        region={userLocation ? {
          latitude: userLocation.coords.latitude,
          longitude: userLocation.coords.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        } : undefined}
        showsUserLocation={true}
        showsMyLocationButton={true}
        mapType="standard"
        followsUserLocation={true}
      >
        {participantsWithLocations.map((participant) => {
          const isCurrentUser = participant.user_id === currentUser?.id;
          const markerColor = getMarkerColor(participant.role, isCurrentUser);

          return (
            <Marker
              key={participant.id}
              coordinate={{
                latitude: participant.last_latitude!,
                longitude: participant.last_longitude!,
              }}
              title={participant.role === 'prey' ? 'Prey' : participant.role === 'hunter' ? 'Hunter' : 'Spectator'}
              description={isCurrentUser ? 'You' : `User ${participant.user_id.slice(-6)}`}
              pinColor={markerColor}
            />
          );
        })}
      </MapView>

      {/* Overlay UI */}
      <View style={styles.overlay}>
        {/* Timer and Role Badge */}
        <View style={styles.topBar}>
          <View style={styles.timerContainer}>
            <Text style={styles.timer}>
              {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
            </Text>
          </View>
          {currentParticipant && (
            <View
              style={[
                styles.roleBadge,
                currentParticipant.role === 'prey' && styles.roleBadgePrey,
                currentParticipant.role === 'hunter' && styles.roleBadgeHunter,
              ]}
            >
              <Text style={styles.roleBadgeText}>
                You are {currentParticipant.role === 'prey' ? 'Prey' : currentParticipant.role === 'hunter' ? 'Hunter' : 'Spectator'}
              </Text>
            </View>
          )}

          {/* Prey: "You are being hunted" banner */}
          {currentParticipant?.role === 'prey' && (
            <View style={styles.huntedBanner}>
              <Text style={styles.huntedBannerText}>You are being hunted</Text>
            </View>
          )}

          {/* Prey: Hunter nearby warning */}
          {currentParticipant?.role === 'prey' && showWarningBanner && (
            <View style={styles.warningBanner}>
              <Text style={styles.warningBannerText}>
                ⚠️ Hunter nearby! ({closestHunterDistance?.toFixed(1)}m)
              </Text>
            </View>
          )}

          {/* Hunter: Target nearby */}
          {currentParticipant?.role === 'hunter' && showTargetNearby && !showCaptureRange && (
            <View style={styles.targetBanner}>
              <Text style={styles.targetBannerText}>
                🎯 Target nearby ({hunterDistance?.toFixed(1)}m)
              </Text>
            </View>
          )}

          {/* Hunter: In capture range */}
          {currentParticipant?.role === 'hunter' && showCaptureRange && (
            <View style={styles.captureBanner}>
              <Text style={styles.captureBannerText}>
                🔥 CAPTURE RANGE! ({hunterDistance?.toFixed(1)}m)
              </Text>
            </View>
          )}

          {locationError && (
            <View style={styles.errorBadge}>
              <Text style={styles.errorBadgeText}>{locationError}</Text>
            </View>
          )}
          {locationPermission === 'denied' && (
            <View style={styles.errorBadge}>
              <Text style={styles.errorBadgeText}>Location permission denied</Text>
            </View>
          )}
        </View>

        {/* Debug Overlay */}
        {showDebug && currentParticipant && (
          <View style={styles.debugOverlay}>
            <TouchableOpacity
              style={styles.debugToggle}
              onPress={() => setShowDebug(false)}
            >
              <Text style={styles.debugToggleText}>Hide Debug</Text>
            </TouchableOpacity>
            {currentParticipant.role === 'prey' && closestHunterDistance !== null && (
              <Text style={styles.debugText}>
                Closest Hunter: {closestHunterDistance.toFixed(2)}m
              </Text>
            )}
            {currentParticipant.role === 'hunter' && hunterDistance !== null && (
              <Text style={styles.debugText}>
                Distance to Prey: {hunterDistance.toFixed(2)}m
              </Text>
            )}
            <Text style={styles.debugText}>
              Capture Distance: {CAPTURE_DISTANCE_METERS}m
            </Text>
            <Text style={styles.debugText}>
              Warning Distance: {WARNING_DISTANCE_METERS}m
            </Text>
          </View>
        )}

        {/* Actions */}
        <View style={styles.actions}>
          {isHost && (
            <TouchableOpacity style={styles.endButton} onPress={handleEndArena}>
              <Text style={styles.endButtonText}>End Arena</Text>
            </TouchableOpacity>
          )}
          {currentParticipant && (
            <TouchableOpacity style={styles.leaveButton} onPress={handleLeave}>
              <Text style={styles.leaveButtonText}>Leave Arena</Text>
            </TouchableOpacity>
          )}
          {DEBUG_MODE && !showDebug && (
            <TouchableOpacity
              style={styles.debugButton}
              onPress={() => setShowDebug(true)}
            >
              <Text style={styles.debugButtonText}>Show Debug</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  map: {
    width: width,
    height: height,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    pointerEvents: 'box-none',
  },
  topBar: {
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 10,
    backgroundColor: 'rgba(11, 11, 11, 0.8)',
  },
  timerContainer: {
    alignItems: 'center',
    marginBottom: 10,
  },
  timer: {
    color: '#34C759',
    fontSize: 36,
    fontWeight: '700',
  },
  roleBadge: {
    backgroundColor: '#1a1a1a',
    padding: 10,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#333',
    marginTop: 5,
  },
  roleBadgePrey: {
    borderColor: '#ff3b30',
    backgroundColor: 'rgba(255, 59, 48, 0.2)',
  },
  roleBadgeHunter: {
    borderColor: '#34C759',
    backgroundColor: 'rgba(52, 199, 89, 0.2)',
  },
  roleBadgeText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  huntedBanner: {
    backgroundColor: 'rgba(255, 59, 48, 0.9)',
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  huntedBannerText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  warningBanner: {
    backgroundColor: 'rgba(255, 149, 0, 0.9)',
    padding: 10,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 5,
  },
  warningBannerText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  targetBanner: {
    backgroundColor: 'rgba(52, 199, 89, 0.9)',
    padding: 10,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 5,
  },
  targetBannerText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  captureBanner: {
    backgroundColor: 'rgba(255, 59, 48, 0.9)',
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 5,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  captureBannerText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  errorBadge: {
    backgroundColor: 'rgba(255, 59, 48, 0.8)',
    padding: 8,
    borderRadius: 6,
    alignItems: 'center',
    marginTop: 5,
  },
  errorBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  debugOverlay: {
    position: 'absolute',
    top: 200,
    right: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    padding: 15,
    borderRadius: 12,
    minWidth: 200,
  },
  debugToggle: {
    marginBottom: 10,
  },
  debugToggleText: {
    color: '#4A90E2',
    fontSize: 12,
    fontWeight: '600',
  },
  debugText: {
    color: '#FFFFFF',
    fontSize: 12,
    marginBottom: 5,
    fontFamily: 'monospace',
  },
  actions: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    gap: 10,
  },
  endButton: {
    backgroundColor: '#ff3b30',
    padding: 15,
    borderRadius: 12,
    alignItems: 'center',
  },
  endButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  leaveButton: {
    backgroundColor: '#ff3b30',
    padding: 15,
    borderRadius: 12,
    alignItems: 'center',
  },
  leaveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  debugButton: {
    backgroundColor: '#333',
    padding: 10,
    borderRadius: 12,
    alignItems: 'center',
  },
  debugButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  errorText: {
    color: '#ff3b30',
    fontSize: 16,
    textAlign: 'center',
  },
});
