/**
 * Social Arena - App Navigation
 * 
 * Stack navigator for the app screens.
 */

import React, { useEffect, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as Linking from 'expo-linking';
import { getCurrentUser } from '../core';

// Screens
import AuthScreen from '../screens/AuthScreen';
import RoomsScreen from '../screens/RoomsScreen';
import RoomScreen from '../screens/RoomScreen';
import LobbyScreen from '../screens/LobbyScreen';
import ActiveArenaScreen from '../screens/ActiveArenaScreen';
import ResultsScreen from '../screens/ResultsScreen';
import JoinArenaScreen from '../screens/JoinArenaScreen';

export type RootStackParamList = {
  Auth: undefined;
  Rooms: undefined;
  Room: { roomId: string };
  Lobby: { arenaId: string };
  ActiveArena: { arenaId: string };
  Results: { arenaId: string };
  JoinArena: { roomCode?: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

// Deep linking configuration
const linking = {
  prefixes: ['socialarena://'],
  config: {
    screens: {
      JoinArena: {
        path: 'join/:roomCode',
        parse: {
          roomCode: (roomCode: string) => roomCode.toUpperCase(),
        },
      },
      Auth: '',
      Rooms: 'rooms',
      Room: 'room/:roomId',
      Lobby: 'lobby/:arenaId',
      ActiveArena: 'arena/:arenaId',
      Results: 'results/:arenaId',
    },
  },
};

export default function AppNavigator() {
  // Determine initial route based on auth state
  const isAuthenticated = getCurrentUser() !== null;
  const initialRouteName = isAuthenticated ? 'Rooms' : 'Auth';
  const navigationRef = useRef<any>(null);

  useEffect(() => {
    // Handle deep links when app is already open
    const handleDeepLink = (event: { url: string }) => {
      const { url } = event;
      if (url.startsWith('socialarena://join/')) {
        const roomCode = url.replace('socialarena://join/', '').toUpperCase();
        if (navigationRef.current && isAuthenticated) {
          navigationRef.current.navigate('JoinArena', { roomCode });
        }
      }
    };

    const subscription = Linking.addEventListener('url', handleDeepLink);

    // Check if app was opened with a deep link
    Linking.getInitialURL().then((url) => {
      if (url && url.startsWith('socialarena://join/')) {
        const roomCode = url.replace('socialarena://join/', '').toUpperCase();
        if (navigationRef.current && isAuthenticated) {
          // Small delay to ensure navigation is ready
          setTimeout(() => {
            navigationRef.current?.navigate('JoinArena', { roomCode });
          }, 100);
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, [isAuthenticated]);

  return (
    <NavigationContainer
      ref={navigationRef}
      linking={linking}
    >
      <Stack.Navigator
        initialRouteName={initialRouteName}
        screenOptions={{
          headerStyle: {
            backgroundColor: '#000000',
          },
          headerTintColor: '#FFFFFF',
          headerTitleStyle: {
            fontWeight: 'bold',
            color: '#FFFFFF',
          },
          headerBackTitle: '',
          headerBackTitleVisible: false,
        }}
      >
        <Stack.Screen
          name="Auth"
          component={AuthScreen}
          options={{ title: 'Social Arena' }}
        />
        <Stack.Screen
          name="Rooms"
          component={RoomsScreen}
          options={{ title: 'Social Arena' }}
        />
        <Stack.Screen
          name="Room"
          component={RoomScreen}
          options={{ title: 'Room' }}
        />
        <Stack.Screen
          name="Lobby"
          component={LobbyScreen}
          options={{ title: 'Predators' }}
        />
        <Stack.Screen
          name="ActiveArena"
          component={ActiveArenaScreen}
          options={{ title: 'Active Arena' }}
        />
        <Stack.Screen
          name="Results"
          component={ResultsScreen}
          options={{ title: 'Results' }}
        />
        <Stack.Screen
          name="JoinArena"
          component={JoinArenaScreen}
          options={{ title: 'Join Room' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

