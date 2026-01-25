# Supabase Setup Guide

This guide will help you set up Supabase for Social Arena's cross-device multiplayer functionality.

## Prerequisites

- A Supabase account (sign up at https://supabase.com)
- A Supabase project created

## Step 1: Create Database Tables

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Copy and paste the contents of `app/database/schema.sql`
4. Click **Run** to execute the SQL

This will create:
- `rooms` table - stores room information
- `room_members` table - stores room membership
- Indexes for performance
- Row Level Security (RLS) policies

## Step 2: Get Your Supabase Credentials

1. In your Supabase project dashboard, go to **Settings** → **API**
2. Copy the following values:
   - **Project URL** (this is your `EXPO_PUBLIC_SUPABASE_URL`)
   - **anon/public key** (this is your `EXPO_PUBLIC_SUPABASE_ANON_KEY`)

## Step 3: Configure Environment Variables

Create a `.env` file in the `app` directory (or add to your existing `.env`):

```env
EXPO_PUBLIC_SUPABASE_URL=your_project_url_here
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
```

**Important**: Make sure `.env` is in your `.gitignore` to avoid committing secrets!

## Step 4: Install Dependencies

Dependencies are already installed, but if you need to reinstall:

```bash
cd app
npm install @supabase/supabase-js @react-native-async-storage/async-storage
```

## Step 5: Test the Integration

1. Start your Expo app
2. Create a room - it should persist to Supabase
3. On another device, join using the room code
4. Both devices should see the same room

## How It Works

- **Device ID**: Each device gets a unique ID stored in AsyncStorage (used as `userId` before auth)
- **Room Codes**: 5-6 character uppercase codes for easy sharing
- **Real-time**: Rooms are stored in Supabase and accessible from any device
- **Cross-device**: Two phones can join the same room using a code

## Troubleshooting

### "Missing Supabase environment variables"
- Make sure your `.env` file exists and has the correct variable names
- Restart your Expo development server after adding environment variables

### "Room not found"
- Check that the database tables were created successfully
- Verify your Supabase URL and key are correct
- Check the Supabase logs for any errors

### "Failed to create room"
- Check that RLS policies allow inserts
- Verify your Supabase project is active
- Check network connectivity

## Next Steps

After this setup, rooms will work across devices! The next phase would be to:
- Add proper authentication (replace deviceId with real user accounts)
- Add real-time subscriptions for live updates
- Add room settings and permissions

