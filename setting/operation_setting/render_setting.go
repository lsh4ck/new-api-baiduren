package operation_setting

import "github.com/QuantumNous/new-api/setting/config"

// RenderSetting 漫剧成片渲染（render-worker）配置。
// 计费费率以人民币(¥)存储，网关按 USDExchangeRate 折算成 quota 扣费。
type RenderSetting struct {
	Enabled     bool   `json:"render_enabled"`      // 总开关；关闭时「一键成片」接口返回未启用
	WorkerURL   string `json:"render_worker_url"`   // 渲染机地址，如 http://1.2.3.4:8080（仅网关内部用，不对客户暴露）
	WorkerToken string `json:"render_worker_token"` // 渲染机 X-Render-Token
	PublicBase  string `json:"render_public_base"`  // 成片对外域名（网关代理用），如 https://aigc.zhuanzhuan.pw

	// 计费费率(¥)。成片渲染上游零成本（自有 CPU + 免费 TTS），这些基本是纯利润服务费。
	PricePerSecCNY   float64 `json:"render_price_per_sec_cny"`  // 成片 ¥/秒
	PriceDubCNY      float64 `json:"render_price_dub_cny"`      // AI 配音 ¥/次
	PriceSubtitleCNY float64 `json:"render_price_subtitle_cny"` // 字幕烧录 ¥/次
	PriceConcatCNY   float64 `json:"render_price_concat_cny"`   // 视频拼接 ¥/次
}

// 默认费率 = 激进档（用户 2026-06-04 拍板）
var renderSetting = RenderSetting{
	Enabled:          false,
	WorkerURL:        "",
	WorkerToken:      "",
	PublicBase:       "",
	PricePerSecCNY:   0.10,
	PriceDubCNY:      0.80,
	PriceSubtitleCNY: 0.50,
	PriceConcatCNY:   0.50,
}

func init() {
	config.GlobalConfig.Register("render_setting", &renderSetting)
}

func GetRenderSetting() *RenderSetting {
	return &renderSetting
}
