-- Chatbot Service — Initial Schema

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE chat_sessions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL,
    school_id   UUID NOT NULL,
    role        VARCHAR(30) NOT NULL,
    eleve_id    UUID,
    classe_id   UUID,
    started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_msg_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed      BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX idx_sessions_user ON chat_sessions(user_id, last_msg_at DESC);
CREATE INDEX idx_sessions_school ON chat_sessions(school_id, started_at DESC);

CREATE TABLE chat_messages (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id  UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    role        VARCHAR(10) NOT NULL CHECK (role IN ('user', 'assistant')),
    content     TEXT NOT NULL,
    tokens_used INT,
    cached      BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_messages_session ON chat_messages(session_id, created_at ASC);

-- Feedback utilisateur (pouce haut/bas)
CREATE TABLE chat_feedback (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id  UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL,
    rating      SMALLINT NOT NULL CHECK (rating IN (-1, 1)),
    comment     TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_feedback_msg_user ON chat_feedback(message_id, user_id);
