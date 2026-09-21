-- ============================================================================
-- IronClaw Fleet Dashboard — event log schema
-- ============================================================================
-- Single append-only table recording everything that happens THROUGH the
-- dashboard: interventions (pause/resume/restart), prompts sent, and — as
-- plugins arrive — their lifecycle and custom events.
--
-- This is the dashboard's OWN database (ironclaw_dashboard), separate from the
-- per-agent databases (ironclaw_agent1..5). Created once, manually:
--
--   1. Create the database (run against the default 'ironclaw' db):
--        docker exec -it ironclaw-postgres \
--          psql -U ironclaw -d ironclaw -c "CREATE DATABASE ironclaw_dashboard;"
--
--   2. Apply this schema to it:
--        docker exec -i ironclaw-postgres \
--          psql -U ironclaw -d ironclaw_dashboard < dashboard/schema.sql
--
-- Both commands are idempotent-friendly: step 1 errors harmlessly if the DB
-- already exists; the statements below use IF NOT EXISTS.
-- ============================================================================

CREATE TABLE IF NOT EXISTS events (
    event_id       uuid                     NOT NULL DEFAULT gen_random_uuid(),
    timestamp      timestamptz              NOT NULL DEFAULT now(),
    plugin         text,                    -- null = dashboard-base action; else plugin name
    agent          text,                    -- e.g. 'agent1'; null = fleet-wide or non-agent event
    kind           text                     NOT NULL,  -- 'intervention' | 'skill_invoked' | 'plugin_lifecycle' | …
    payload        jsonb                    NOT NULL DEFAULT '{}'::jsonb,
    researcher_id  text                     NOT NULL,

    PRIMARY KEY (event_id)
);

-- Access patterns (fleet spec §3.6):
--   "show me one plugin's activity over time"  → (plugin, timestamp)
--   "show me one agent's activity over time"   → (agent, timestamp)
-- Both DESC because the feed is always newest-first.
CREATE INDEX IF NOT EXISTS idx_events_plugin_ts
    ON events (plugin, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_events_agent_ts
    ON events (agent, timestamp DESC);

-- A plain timestamp index for the default unfiltered "everything, newest first" feed.
CREATE INDEX IF NOT EXISTS idx_events_ts
    ON events (timestamp DESC);