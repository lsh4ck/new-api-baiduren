-- 支付系统配置预置（对应线上 zhuanzhuan.pw 的设置）
-- 此文件在 PostgreSQL 首次初始化时自动执行
-- 注意：options 表由 new-api 启动时 GORM 自动创建，这里需要提前建好同结构的表

CREATE TABLE IF NOT EXISTS options (
    key   VARCHAR(255) PRIMARY KEY,
    value TEXT NOT NULL DEFAULT ''
);

-- 使用 ON CONFLICT DO UPDATE 确保幂等（重复执行不报错）
INSERT INTO options (key, value) VALUES
  -- ── epay（易支付）配置 ──
  ('EpayId',             'CHANGE_ME_epay_id'),
  ('EpayKey',            'CHANGE_ME_epay_key'),
  ('PayAddress',         'https://zhuanzhuan.pw/pay-gateway'),

  -- ── 微信服务器（docker 内网地址） ──
  ('WeChatServerAddress','http://wechat-server:3002'),
  ('WeChatServerToken',  'CHANGE_ME_wechat_server_token'),
  ('WeChatAuthEnabled',  'true'),
  ('WeChatAccountQRCodeImageURL', 'https://zhuanzhuan.pw/wechat-qr.png'),

  -- ── 支付方式：微信 + USDT/Crypto ──
  ('PayMethods', '[{"color":"rgba(var(--semi-green-5), 1)","name":"微信","type":"wxpay"},{"color":"#F7931A","name":"USDT / Crypto","type":"crypto"}]'),

  -- ── 充值额度选项 ──
  ('payment_setting.amount_options', '[10, 20, 50, 100, 200, 500]'),
  ('MinTopUp', '1')

ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
