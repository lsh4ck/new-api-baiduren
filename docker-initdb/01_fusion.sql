-- Subscription capability migration

-- Subscription account management
CREATE TABLE IF NOT EXISTS subscription_accounts (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP,
    platform VARCHAR(50) NOT NULL,          -- claude, codex, gemini
    account_name VARCHAR(200) NOT NULL,
    email VARCHAR(200) NOT NULL,
    access_token TEXT,
    refresh_token TEXT,
    expires_at TIMESTAMP,
    status VARCHAR(20) DEFAULT 'active',    -- active, expired, disabled
    usage_limit DECIMAL(10,2) DEFAULT 0,
    used_this_month DECIMAL(10,2) DEFAULT 0,
    last_used_at TIMESTAMP,
    group_id INTEGER DEFAULT 0              -- 分组 (粘性会话用)
);

CREATE INDEX IF NOT EXISTS idx_subscription_accounts_platform ON subscription_accounts(platform);
CREATE INDEX IF NOT EXISTS idx_subscription_accounts_group ON subscription_accounts(group_id);
CREATE INDEX IF NOT EXISTS idx_subscription_accounts_status ON subscription_accounts(status);

-- 粘性会话映射
CREATE TABLE IF NOT EXISTS sticky_sessions (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP,
    user_id INTEGER NOT NULL,
    api_key VARCHAR(255) NOT NULL,
    account_id INTEGER NOT NULL,
    platform VARCHAR(50) NOT NULL,
    last_assigned TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sticky_sessions_apikey_platform ON sticky_sessions(api_key, platform) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sticky_sessions_user ON sticky_sessions(user_id);

-- 用户订阅
CREATE TABLE IF NOT EXISTS user_subscriptions (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP,
    user_id INTEGER UNIQUE NOT NULL,
    plan VARCHAR(50) NOT NULL,              -- free, monthly_99, monthly_299, enterprise
    status VARCHAR(20) DEFAULT 'active',
    start_date TIMESTAMP,
    end_date TIMESTAMP,
    auto_renew BOOLEAN DEFAULT false,
    monthly_quota DECIMAL(10,2) DEFAULT 0,
    used_this_month DECIMAL(10,2) DEFAULT 0,
    preferred_group VARCHAR(50) DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user ON user_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_plan ON user_subscriptions(plan);

-- 订阅计划价格
INSERT INTO model_prices (model_name, rate, group) VALUES
    ('claude-code-monthly-99', 0, 'subscription') ON CONFLICT (model_name) DO NOTHING,
    ('claude-code-monthly-299', 0, 'subscription') ON CONFLICT (model_name) DO NOTHING,
    ('codex-monthly-99', 0, 'subscription') ON CONFLICT (model_name) DO NOTHING,
    ('codex-monthly-299', 0, 'subscription') ON CONFLICT (model_name) DO NOTHING,
    ('gemini-cli-monthly-99', 0, 'subscription') ON CONFLICT (model_name) DO NOTHING,
    ('gemini-cli-monthly-299', 0, 'subscription') ON CONFLICT (model_name) DO NOTHING;

-- 新增渠道类型
-- 在 channels 表中添加订阅类渠道
INSERT INTO channels (type, name, status, auto_ban, test_model, base_url, other_info, group_id, used_quota, model_mapping, tags) VALUES
    ('Claude', 'Claude 订阅池', 1, false, 'claude-sonnet-4-20250514', 'https://api.anthropic.com', '{"subscription_pool": true}', 0, 0, '{}', 'subscription') ON CONFLICT DO NOTHING,
    ('Codex', 'Codex 订阅池', 1, false, 'codex-mini', 'https://api.openai.com', '{"subscription_pool": true}', 0, 0, '{}', 'subscription') ON CONFLICT DO NOTHING,
    ('Gemini', 'Gemini 订阅池', 1, false, 'gemini-2.5-pro', 'https://generativelanguage.googleapis.com', '{"subscription_pool": true}', 0, 0, '{}', 'subscription') ON CONFLICT DO NOTHING;
