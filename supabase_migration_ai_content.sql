-- ============================================
-- FIT 3.0 — AI-генерований контент (аудит, кеш, вартість)
-- AI_Integration_FIT3_Basic.md, Частина 1
-- ============================================

CREATE TABLE IF NOT EXISTS ai_generated_content (
    id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    content_type    text NOT NULL,
    entity_id       text NOT NULL,
    prompt_hash     text,
    ai_response    jsonb NOT NULL DEFAULT '{}',
    tokens_used    integer,
    cost_usd       decimal(10,6),
    created_at     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_generated_content_type_entity
    ON ai_generated_content(content_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_ai_generated_content_prompt_hash
    ON ai_generated_content(prompt_hash) WHERE prompt_hash IS NOT NULL;

COMMENT ON TABLE ai_generated_content IS 'AI-згенерований контент: plan_comment, reminder, failure_analysis';
COMMENT ON COLUMN ai_generated_content.prompt_hash IS 'Для кешу однакових запитів';

-- Опційно: налаштування AI по користувачу
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_features_enabled boolean DEFAULT true;
