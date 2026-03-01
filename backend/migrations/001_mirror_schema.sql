-- ============================================================================
-- Mirror: Snowflake Schema Migration 001
-- ============================================================================
-- Run this entire script in a Snowflake SQL Worksheet (Snowsight).
-- Idempotent — safe to re-run.
-- ============================================================================

-- ── Database & Schema ──────────────────────────────────────────────────────

CREATE DATABASE IF NOT EXISTS MIRROR;
USE DATABASE MIRROR;
CREATE SCHEMA IF NOT EXISTS MATCHING;
USE SCHEMA MATCHING;

-- ── Dimension Ordering Reference ───────────────────────────────────────────
-- The VECTOR(FLOAT, 50) column stores scores in this canonical order.
-- Source of truth for index <-> variable mapping and per-context weights.

CREATE OR REPLACE TABLE DIMENSION_INDEX (
    dim_position      INT          NOT NULL,
    variable_name     VARCHAR(60)  NOT NULL,
    category          VARCHAR(40)  NOT NULL,
    match_mode        VARCHAR(12)  NOT NULL,  -- 'similarity' or 'complement'
    weight_hackathon  FLOAT        NOT NULL,
    weight_romantic   FLOAT        NOT NULL,
    weight_friendship FLOAT        NOT NULL,
    PRIMARY KEY (dim_position)
);

INSERT OVERWRITE INTO DIMENSION_INDEX VALUES
-- Cognitive Style (0-8)
(0,  'abstract_thinking',       'Cognitive Style',        'similarity',  0.4, 0.5, 0.4),
(1,  'systems_thinking',        'Cognitive Style',        'complement',  0.8, 0.2, 0.2),
(2,  'novelty_seeking',         'Cognitive Style',        'similarity',  0.6, 0.7, 0.8),
(3,  'detail_orientation',      'Cognitive Style',        'complement',  0.9, 0.2, 0.2),
(4,  'decisiveness',            'Cognitive Style',        'complement',  0.7, 0.3, 0.3),
(5,  'pattern_recognition',     'Cognitive Style',        'similarity',  0.5, 0.4, 0.4),
(6,  'risk_tolerance',          'Cognitive Style',        'similarity',  0.6, 0.5, 0.4),
(7,  'contrarianism',           'Cognitive Style',        'complement',  0.7, 0.3, 0.4),
(8,  'depth_vs_breadth',        'Cognitive Style',        'complement',  0.8, 0.3, 0.3),
-- Emotional Profile (9-18)
(9,  'emotional_expressiveness', 'Emotional Profile',     'similarity',  0.2, 0.8, 0.7),
(10, 'hotheadedness',            'Emotional Profile',     'similarity',  0.5, 0.5, 0.5),
(11, 'empathy_signaling',        'Emotional Profile',     'similarity',  0.3, 0.9, 0.8),
(12, 'self_criticism',           'Emotional Profile',     'similarity',  0.3, 0.5, 0.5),
(13, 'confidence_oscillation',   'Emotional Profile',     'complement',  0.4, 0.4, 0.4),
(14, 'optimism',                 'Emotional Profile',     'similarity',  0.5, 0.7, 0.7),
(15, 'vulnerability',            'Emotional Profile',     'similarity',  0.2, 0.9, 0.8),
(16, 'emotional_neediness',      'Emotional Profile',     'complement',  0.3, 0.6, 0.6),
(17, 'intensity',                'Emotional Profile',     'similarity',  0.6, 0.6, 0.5),
(18, 'frustration_tolerance',    'Emotional Profile',     'similarity',  0.7, 0.5, 0.5),
-- Collaboration & Work Style (19-28)
(19, 'leadership_drive',        'Collaboration & Work',   'complement',  1.0, 0.4, 0.3),
(20, 'structure_need',          'Collaboration & Work',   'complement',  0.8, 0.3, 0.3),
(21, 'feedback_receptivity',    'Collaboration & Work',   'similarity',  0.9, 0.4, 0.4),
(22, 'execution_bias',          'Collaboration & Work',   'complement',  0.9, 0.2, 0.2),
(23, 'async_preference',        'Collaboration & Work',   'similarity',  0.7, 0.5, 0.4),
(24, 'ownership_taking',        'Collaboration & Work',   'similarity',  0.8, 0.3, 0.3),
(25, 'perfectionism',           'Collaboration & Work',   'complement',  0.7, 0.3, 0.3),
(26, 'collaboration_enjoyment', 'Collaboration & Work',   'similarity',  0.8, 0.6, 0.9),
(27, 'adaptability',            'Collaboration & Work',   'similarity',  0.7, 0.4, 0.4),
(28, 'deadline_orientation',    'Collaboration & Work',   'similarity',  0.8, 0.2, 0.2),
-- Values & Motivation (29-37)
(29, 'intrinsic_motivation',    'Values & Motivation',    'similarity',  0.6, 0.7, 0.6),
(30, 'impact_orientation',      'Values & Motivation',    'similarity',  0.5, 0.7, 0.6),
(31, 'ambition',                'Values & Motivation',    'similarity',  0.7, 0.6, 0.5),
(32, 'ethical_sensitivity',     'Values & Motivation',    'similarity',  0.4, 0.9, 0.8),
(33, 'competitiveness',         'Values & Motivation',    'similarity',  0.5, 0.4, 0.4),
(34, 'loyalty',                 'Values & Motivation',    'similarity',  0.4, 1.0, 0.9),
(35, 'independence_value',      'Values & Motivation',    'similarity',  0.4, 0.6, 0.5),
(36, 'intellectual_humility',   'Values & Motivation',    'similarity',  0.6, 0.7, 0.7),
(37, 'long_term_thinking',      'Values & Motivation',    'similarity',  0.5, 0.8, 0.6),
-- Communication (38-44)
(38, 'directness',              'Communication',          'similarity',  0.7, 0.6, 0.6),
(39, 'verbosity',               'Communication',          'similarity',  0.5, 0.6, 0.6),
(40, 'humor_frequency',         'Communication',          'similarity',  0.4, 0.8, 0.9),
(41, 'humor_style',             'Communication',          'similarity',  0.3, 0.9, 0.8),
(42, 'question_asking_rate',    'Communication',          'similarity',  0.5, 0.6, 0.7),
(43, 'formality',               'Communication',          'similarity',  0.6, 0.5, 0.5),
(44, 'storytelling_tendency',   'Communication',          'similarity',  0.3, 0.6, 0.6),
-- Identity & Lifestyle (45-49)
(45, 'social_energy',           'Identity & Lifestyle',   'similarity',  0.4, 0.7, 0.8),
(46, 'routine_vs_spontaneity',  'Identity & Lifestyle',   'similarity',  0.3, 0.8, 0.7),
(47, 'creative_drive',          'Identity & Lifestyle',   'complement',  0.6, 0.5, 0.4),
(48, 'physical_lifestyle',      'Identity & Lifestyle',   'similarity',  0.1, 0.7, 0.6),
(49, 'life_pace',               'Identity & Lifestyle',   'similarity',  0.7, 0.8, 0.7);


-- ── Core Table: User Archetypes ────────────────────────────────────────────

CREATE OR REPLACE TABLE USER_ARCHETYPES (
    user_id             VARCHAR(128)      NOT NULL,
    server_id           VARCHAR(64)       NOT NULL,
    archetype_vector    VECTOR(FLOAT, 50) NOT NULL,
    scores_json         VARIANT           NOT NULL,
    evidence_json       VARIANT,
    reputation_score    FLOAT             DEFAULT 0.0,
    abandonment_count   INT               DEFAULT 0,
    confidence          VARCHAR(16)       DEFAULT 'unknown',
    message_count_used  INT               DEFAULT 0,
    status              VARCHAR(16)       DEFAULT 'active',
    created_at          TIMESTAMP_NTZ     DEFAULT CURRENT_TIMESTAMP(),
    updated_at          TIMESTAMP_NTZ     DEFAULT CURRENT_TIMESTAMP(),
    PRIMARY KEY (user_id, server_id)
);


-- ── Match History ──────────────────────────────────────────────────────────

CREATE OR REPLACE TABLE MATCH_HISTORY (
    match_id        VARCHAR(64)     NOT NULL DEFAULT UUID_STRING(),
    user_a_id       VARCHAR(128)    NOT NULL,
    user_b_id       VARCHAR(128)    NOT NULL,
    server_id       VARCHAR(64)     NOT NULL,
    context         VARCHAR(16)     NOT NULL,
    cosine_score    FLOAT,
    weighted_score  FLOAT,
    grade           VARCHAR(4),
    red_flags_json  VARIANT,
    blurb_json      VARIANT,
    created_at      TIMESTAMP_NTZ   DEFAULT CURRENT_TIMESTAMP(),
    PRIMARY KEY (match_id)
);


-- ============================================================================
-- Vector Search: Coarse Candidate Retrieval (Stored Procedure)
-- ============================================================================
-- Returns a JSON array of top candidates. Call with:
--   CALL FIND_VECTOR_CANDIDATES(<vector>, 'hackathon', 'user_to_exclude', 20);

CREATE OR REPLACE PROCEDURE FIND_VECTOR_CANDIDATES(
    query_vector    VARCHAR,
    target_server   VARCHAR,
    exclude_user    VARCHAR,
    candidate_limit INT
)
RETURNS VARIANT
LANGUAGE SQL
AS
$$
DECLARE
    res VARIANT;
BEGIN
    SELECT ARRAY_AGG(obj) INTO res
    FROM (
        SELECT OBJECT_CONSTRUCT(
            'user_id',          ua.user_id,
            'cosine_score',     VECTOR_COSINE_SIMILARITY(
                                    ua.archetype_vector,
                                    :query_vector::VECTOR(FLOAT, 50)
                                ),
            'scores_json',      ua.scores_json,
            'evidence_json',    ua.evidence_json,
            'reputation_score', ua.reputation_score
        ) AS obj
        FROM USER_ARCHETYPES ua
        WHERE ua.server_id = :target_server
          AND ua.user_id != :exclude_user
          AND ua.status = 'active'
          AND ua.abandonment_count < 3
        ORDER BY VECTOR_COSINE_SIMILARITY(
            ua.archetype_vector,
            :query_vector::VECTOR(FLOAT, 50)
        ) DESC
        LIMIT :candidate_limit
    );
    RETURN res;
END
$$;


-- ============================================================================
-- Red Flag Dimension Delta Check (Stored Procedure)
-- ============================================================================
-- Returns a JSON array of dimensions with dangerous deltas. Call with:
--   CALL RED_FLAG_DIMENSION_DELTAS(<scores_variant_a>, <scores_variant_b>);

CREATE OR REPLACE PROCEDURE RED_FLAG_DIMENSION_DELTAS(
    user_a_scores VARCHAR,
    user_b_scores VARCHAR
)
RETURNS VARIANT
LANGUAGE SQL
AS
$$
DECLARE
    res VARIANT;
    a_parsed VARIANT;
    b_parsed VARIANT;
BEGIN
    a_parsed := PARSE_JSON(:user_a_scores);
    b_parsed := PARSE_JSON(:user_b_scores);

    SELECT ARRAY_AGG(obj) INTO res
    FROM (
        SELECT OBJECT_CONSTRUCT(
            'variable_name', cd.var_name,
            'user_a_value',  :a_parsed[cd.var_name]::FLOAT,
            'user_b_value',  :b_parsed[cd.var_name]::FLOAT,
            'delta',         ABS(:a_parsed[cd.var_name]::FLOAT -
                                 :b_parsed[cd.var_name]::FLOAT),
            'severity',      cd.sev
        ) AS obj
        FROM (
            SELECT * FROM VALUES
                ('emotional_expressiveness', 0.50, 'high'),
                ('hotheadedness',            0.40, 'high'),
                ('feedback_receptivity',     0.45, 'high'),
                ('directness',               0.55, 'medium'),
                ('life_pace',                0.55, 'medium'),
                ('structure_need',           0.50, 'high'),
                ('leadership_drive',         0.45, 'high'),
                ('long_term_thinking',       0.50, 'medium'),
                ('emotional_neediness',      0.40, 'medium'),
                ('independence_value',       0.50, 'medium'),
                ('vulnerability',            0.45, 'medium')
            AS t(var_name, danger_threshold, sev)
        ) cd
        WHERE ABS(:a_parsed[cd.var_name]::FLOAT -
                   :b_parsed[cd.var_name]::FLOAT) >= cd.danger_threshold
    );
    RETURN res;
END
$$;


-- ============================================================================
-- Context-Weighted Re-ranking UDF
-- ============================================================================

CREATE OR REPLACE FUNCTION WEIGHTED_RERANK_SCORE(
    query_scores     VARIANT,
    candidate_scores VARIANT,
    match_context    VARCHAR
)
RETURNS FLOAT
LANGUAGE SQL
AS
$$
    (
        SELECT SUM(
            CASE
                WHEN d.match_mode = 'similarity'
                THEN (1.0 - ABS(query_scores[d.variable_name]::FLOAT -
                                candidate_scores[d.variable_name]::FLOAT))
                     * CASE match_context
                         WHEN 'hackathon'  THEN d.weight_hackathon
                         WHEN 'romantic'   THEN d.weight_romantic
                         WHEN 'friendship' THEN d.weight_friendship
                       END
                WHEN d.match_mode = 'complement'
                THEN ABS(query_scores[d.variable_name]::FLOAT -
                         candidate_scores[d.variable_name]::FLOAT)
                     * CASE match_context
                         WHEN 'hackathon'  THEN d.weight_hackathon
                         WHEN 'romantic'   THEN d.weight_romantic
                         WHEN 'friendship' THEN d.weight_friendship
                       END
            END
        ) / NULLIF(SUM(
            CASE match_context
                WHEN 'hackathon'  THEN d.weight_hackathon
                WHEN 'romantic'   THEN d.weight_romantic
                WHEN 'friendship' THEN d.weight_friendship
            END
        ), 0)
        FROM DIMENSION_INDEX d
    )
$$;


-- ============================================================================
-- Group Match: Find Optimal 4-Person Cluster
-- ============================================================================

CREATE OR REPLACE PROCEDURE FIND_OPTIMAL_TEAM(
    target_server VARCHAR,
    team_size     INT DEFAULT 4,
    result_limit  INT DEFAULT 5
)
RETURNS VARIANT
LANGUAGE SQL
AS
$$
DECLARE
    res VARIANT;
BEGIN
    CREATE OR REPLACE TEMPORARY TABLE _candidates AS
    SELECT
        user_id,
        archetype_vector,
        scores_json,
        ROW_NUMBER() OVER (ORDER BY reputation_score DESC) AS rn
    FROM USER_ARCHETYPES
    WHERE server_id = :target_server
      AND status = 'active'
      AND abandonment_count < 3;

    CREATE OR REPLACE TEMPORARY TABLE _team_scores AS
    SELECT
        a.user_id AS u1, b.user_id AS u2,
        c.user_id AS u3, d.user_id AS u4,
        (
            VECTOR_COSINE_SIMILARITY(a.archetype_vector, b.archetype_vector) +
            VECTOR_COSINE_SIMILARITY(a.archetype_vector, c.archetype_vector) +
            VECTOR_COSINE_SIMILARITY(a.archetype_vector, d.archetype_vector) +
            VECTOR_COSINE_SIMILARITY(b.archetype_vector, c.archetype_vector) +
            VECTOR_COSINE_SIMILARITY(b.archetype_vector, d.archetype_vector) +
            VECTOR_COSINE_SIMILARITY(c.archetype_vector, d.archetype_vector)
        ) / 6.0 AS avg_pairwise_cosine
    FROM _candidates a
    JOIN _candidates b ON b.rn > a.rn
    JOIN _candidates c ON c.rn > b.rn
    JOIN _candidates d ON d.rn > c.rn
    ORDER BY avg_pairwise_cosine DESC
    LIMIT :result_limit;

    SELECT ARRAY_AGG(
        OBJECT_CONSTRUCT(
            'team', ARRAY_CONSTRUCT(u1, u2, u3, u4),
            'avg_pairwise_cosine', ROUND(avg_pairwise_cosine, 4)
        )
    ) INTO res
    FROM _team_scores;

    RETURN res;
END
$$;
