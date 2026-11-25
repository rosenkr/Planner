CREATE TABLE meetings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    invite_code text NOT NULL UNIQUE CHECK (invite_code ~ '^[A-Za-z0-9_-]{8}$'),
    name text NOT NULL CHECK (btrim(name) <> ''),
    first_date date NOT NULL,
    last_date date NOT NULL CHECK (last_date >= first_date),
    time_zone text NOT NULL CHECK (btrim(time_zone) <> ''),
    min_minutes smallint NOT NULL CHECK (min_minutes BETWEEN 15 AND 1440 AND min_minutes % 15 = 0),
    max_minutes smallint NOT NULL CHECK (max_minutes BETWEEN min_minutes AND 1440 AND max_minutes % 15 = 0),
    capacity integer NOT NULL CHECK (capacity >= 2),
    created_at timestamptz NOT NULL DEFAULT now(),
    response_deadline timestamptz NOT NULL,
    expires_at timestamptz NOT NULL,
    CHECK (created_at < response_deadline AND response_deadline < expires_at),
    CHECK ((response_deadline AT TIME ZONE time_zone) <= (first_date - 1) + TIME '22:00')
);

CREATE TABLE participants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_id uuid NOT NULL REFERENCES meetings (id) ON DELETE CASCADE,
    display_name text NOT NULL CHECK (btrim(display_name) <> ''),
    -- An empty schedule can still be a submitted response.
    has_submitted boolean NOT NULL DEFAULT false,
    revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
    recovery_code_verifier text,
    UNIQUE (meeting_id, id)
);

CREATE TABLE participant_sessions (
    meeting_id uuid NOT NULL,
    participant_id uuid NOT NULL,
    token_hash text NOT NULL CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    PRIMARY KEY (meeting_id, token_hash),
    FOREIGN KEY (meeting_id, participant_id) REFERENCES participants (meeting_id, id) ON DELETE CASCADE
);

CREATE INDEX participant_sessions_participant_idx ON participant_sessions (participant_id);

CREATE TABLE availability_intervals (
    participant_id uuid NOT NULL REFERENCES participants (id) ON DELETE CASCADE,
    schedule_kind text NOT NULL CHECK (schedule_kind IN ('draft', 'submitted')),
    available_date date NOT NULL,
    -- Minutes in the meeting time zone. The end is exclusive and 1440 means midnight.
    start_minute smallint NOT NULL CHECK (start_minute BETWEEN 0 AND 1425 AND start_minute % 15 = 0),
    end_minute smallint NOT NULL CHECK (end_minute BETWEEN 15 AND 1440 AND end_minute % 15 = 0),
    CHECK (start_minute < end_minute),
    PRIMARY KEY (participant_id, schedule_kind, available_date, start_minute)
);
