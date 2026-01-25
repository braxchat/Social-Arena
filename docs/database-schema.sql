-- ============================================================================
-- SOCIAL ARENA - DATABASE SCHEMA
-- ============================================================================
-- This schema defines the core data model for Social Arena
-- Designed for PostgreSQL (Supabase compatible)
-- ============================================================================

-- ============================================================================
-- EXTENSIONS
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For text search on usernames

-- ============================================================================
-- ENUMS
-- ============================================================================

CREATE TYPE arena_status AS ENUM ('lobby', 'active', 'ended');
CREATE TYPE game_mode AS ENUM ('predators', 'outbreak', 'specter', 'duel');
CREATE TYPE participant_role AS ENUM ('prey', 'hunter', 'spectator');
CREATE TYPE participant_status AS ENUM ('joined', 'left', 'captured', 'escaped', 'disconnected');

-- ============================================================================
-- USERS TABLE
-- ============================================================================

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL, -- Hashed password (bcrypt/argon2)
    username TEXT NOT NULL UNIQUE,
    
    -- Profile
    display_name TEXT,
    avatar_url TEXT,
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ,
    
    -- Constraints
    CONSTRAINT username_length CHECK (char_length(username) >= 3 AND char_length(username) <= 20),
    CONSTRAINT username_format CHECK (username ~ '^[a-zA-Z0-9_]+$'),
    CONSTRAINT email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

-- Indexes for users
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_username_trgm ON users USING gin(username gin_trgm_ops); -- For fuzzy search

-- ============================================================================
-- ROOMS TABLE
-- ============================================================================

CREATE TABLE rooms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Settings
    is_public BOOLEAN NOT NULL DEFAULT false,
    max_members INTEGER DEFAULT 50,
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT room_name_length CHECK (char_length(name) >= 1 AND char_length(name) <= 50)
);

-- Indexes for rooms
CREATE INDEX idx_rooms_owner ON rooms(owner_id);
CREATE INDEX idx_rooms_public ON rooms(is_public) WHERE is_public = true;
CREATE INDEX idx_rooms_created ON rooms(created_at DESC);

-- ============================================================================
-- ROOM MEMBERS TABLE
-- ============================================================================

CREATE TABLE room_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Role in room
    role TEXT NOT NULL DEFAULT 'member', -- 'owner', 'admin', 'member'
    
    -- Metadata
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(room_id, user_id),
    CONSTRAINT valid_role CHECK (role IN ('owner', 'admin', 'member'))
);

-- Indexes for room_members
CREATE INDEX idx_room_members_room ON room_members(room_id);
CREATE INDEX idx_room_members_user ON room_members(user_id);
CREATE UNIQUE INDEX idx_room_members_unique ON room_members(room_id, user_id);

-- ============================================================================
-- ARENAS TABLE
-- ============================================================================

CREATE TABLE arenas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    
    -- Game configuration
    mode game_mode NOT NULL DEFAULT 'predators',
    status arena_status NOT NULL DEFAULT 'lobby',
    
    -- Host
    host_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    
    -- Timing
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    duration_minutes INTEGER NOT NULL DEFAULT 12,
    
    -- Game-specific settings (JSONB for flexibility)
    settings JSONB DEFAULT '{}',
    
    -- Results
    winner_team TEXT, -- 'hunters' | 'prey' | null
    ended_reason TEXT, -- 'capture' | 'timeout' | 'host_ended' | 'error'
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT valid_duration CHECK (duration_minutes > 0 AND duration_minutes <= 60),
    CONSTRAINT valid_winner CHECK (winner_team IS NULL OR winner_team IN ('hunters', 'prey')),
    CONSTRAINT started_before_ended CHECK (
        started_at IS NULL OR 
        ended_at IS NULL OR 
        started_at <= ended_at
    )
);

-- Indexes for arenas
CREATE INDEX idx_arenas_room ON arenas(room_id);
CREATE INDEX idx_arenas_status ON arenas(status);
CREATE INDEX idx_arenas_host ON arenas(host_id);
CREATE INDEX idx_arenas_active ON arenas(status, room_id) WHERE status = 'active';
CREATE INDEX idx_arenas_created ON arenas(created_at DESC);

-- ============================================================================
-- ARENA PARTICIPANTS TABLE
-- ============================================================================

CREATE TABLE arena_participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    arena_id UUID NOT NULL REFERENCES arenas(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Role assignment
    role participant_role NOT NULL,
    
    -- Status tracking
    status participant_status NOT NULL DEFAULT 'joined',
    
    -- Timing
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    left_at TIMESTAMPTZ,
    
    -- Game state
    is_captured BOOLEAN NOT NULL DEFAULT false,
    captured_at TIMESTAMPTZ,
    captured_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    
    -- Location tracking (last known)
    last_latitude DECIMAL(10, 8),
    last_longitude DECIMAL(11, 8),
    last_location_updated_at TIMESTAMPTZ,
    
    -- BLE state (for prey)
    is_ble_broadcasting BOOLEAN NOT NULL DEFAULT false,
    ble_started_at TIMESTAMPTZ,
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(arena_id, user_id),
    CONSTRAINT valid_capture_state CHECK (
        (is_captured = false AND captured_at IS NULL AND captured_by_user_id IS NULL) OR
        (is_captured = true AND captured_at IS NOT NULL)
    ),
    CONSTRAINT valid_location CHECK (
        (last_latitude IS NULL AND last_longitude IS NULL) OR
        (last_latitude IS NOT NULL AND last_longitude IS NOT NULL AND
         last_latitude BETWEEN -90 AND 90 AND
         last_longitude BETWEEN -180 AND 180)
    )
);

-- Indexes for arena_participants
CREATE INDEX idx_arena_participants_arena ON arena_participants(arena_id);
CREATE INDEX idx_arena_participants_user ON arena_participants(user_id);
CREATE INDEX idx_arena_participants_status ON arena_participants(status);
CREATE INDEX idx_arena_participants_role ON arena_participants(role);
CREATE INDEX idx_arena_participants_active ON arena_participants(arena_id, status) WHERE status = 'joined';
CREATE UNIQUE INDEX idx_arena_participants_unique ON arena_participants(arena_id, user_id);

-- ============================================================================
-- BLE PROXIMITY LOGS (for debugging and analytics)
-- ============================================================================

CREATE TABLE ble_proximity_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    arena_id UUID NOT NULL REFERENCES arenas(id) ON DELETE CASCADE,
    
    -- Participants involved
    broadcaster_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, -- Prey
    scanner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,    -- Hunter
    
    -- Signal data
    rssi INTEGER NOT NULL, -- Received Signal Strength Indicator
    distance_estimate_meters DECIMAL(8, 2), -- Estimated distance based on RSSI
    
    -- Location context
    broadcaster_latitude DECIMAL(10, 8),
    broadcaster_longitude DECIMAL(11, 8),
    scanner_latitude DECIMAL(10, 8),
    scanner_longitude DECIMAL(11, 8),
    
    -- Metadata
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for ble_proximity_logs
CREATE INDEX idx_ble_logs_arena ON ble_proximity_logs(arena_id);
CREATE INDEX idx_ble_logs_broadcaster ON ble_proximity_logs(broadcaster_user_id);
CREATE INDEX idx_ble_logs_scanner ON ble_proximity_logs(scanner_user_id);
CREATE INDEX idx_ble_logs_recorded ON ble_proximity_logs(recorded_at DESC);

-- ============================================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================================

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_rooms_updated_at BEFORE UPDATE ON rooms
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_arenas_updated_at BEFORE UPDATE ON arenas
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_arena_participants_updated_at BEFORE UPDATE ON arena_participants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- VIEWS (for common queries)
-- ============================================================================

-- Active arenas with participant counts
CREATE VIEW active_arenas_view AS
SELECT 
    a.id,
    a.room_id,
    a.mode,
    a.status,
    a.host_id,
    a.started_at,
    a.duration_minutes,
    COUNT(ap.id) FILTER (WHERE ap.status = 'joined') as participant_count,
    COUNT(ap.id) FILTER (WHERE ap.role = 'prey' AND ap.status = 'joined') as prey_count,
    COUNT(ap.id) FILTER (WHERE ap.role = 'hunter' AND ap.status = 'joined') as hunter_count
FROM arenas a
LEFT JOIN arena_participants ap ON a.id = ap.arena_id
WHERE a.status = 'active'
GROUP BY a.id;

-- User's active arena (if any)
CREATE VIEW user_active_arenas_view AS
SELECT 
    ap.user_id,
    ap.arena_id,
    a.room_id,
    a.mode,
    a.status,
    ap.role,
    ap.status as participant_status
FROM arena_participants ap
INNER JOIN arenas a ON ap.arena_id = a.id
WHERE a.status = 'active' AND ap.status = 'joined';

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) Policies
-- ============================================================================
-- Note: Enable RLS on tables and define policies based on your auth system
-- This is a placeholder structure

-- ALTER TABLE users ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE room_members ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE arenas ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE arena_participants ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- COMMENTS (Documentation)
-- ============================================================================

COMMENT ON TABLE users IS 'Core user identity and authentication';
COMMENT ON TABLE rooms IS 'Long-lived communities that host multiple arenas';
COMMENT ON TABLE room_members IS 'Many-to-many relationship between users and rooms';
COMMENT ON TABLE arenas IS 'Game sessions within rooms with lifecycle: lobby -> active -> ended';
COMMENT ON TABLE arena_participants IS 'Players in an arena with roles, status, and location tracking';
COMMENT ON TABLE ble_proximity_logs IS 'Historical log of BLE proximity events for debugging';

COMMENT ON COLUMN arenas.status IS 'Current state: lobby (accepting players), active (locked, game running), ended (finished)';
COMMENT ON COLUMN arena_participants.status IS 'joined (in game), left (voluntarily left), captured (hunter caught prey), escaped (prey survived), disconnected (connection lost)';
COMMENT ON COLUMN arena_participants.is_ble_broadcasting IS 'True when prey is actively broadcasting BLE signal';
COMMENT ON COLUMN ble_proximity_logs.rssi IS 'RSSI value: typically -30 to -100, closer = higher (less negative)';

