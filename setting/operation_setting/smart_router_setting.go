package operation_setting

import "github.com/QuantumNous/new-api/setting/config"

// SmartRouterSetting 智能模型路由配置。
//
// 设计：客户用「触发名」(如 bdr-auto / 摆渡人智能) 调用时，new-api 把请求的
// messages + 分组可用模型清单 转发给本机闭源 sidecar，sidecar 用廉价分类器选出
// 最佳模型并返回，new-api 据此改写 model 后正常走渠道选择 + 计费(按实际模型)。
//
// 本 struct 只承载「如何连 sidecar」这种通用配置；真正的选模策略/分类逻辑全在
// sidecar 内(独立进程，HTTP 边界，非本 AGPL 工程的衍生作品)。
type SmartRouterSetting struct {
	Enabled       bool     `json:"smart_router_enabled"`        // 总开关
	SidecarURL    string   `json:"smart_router_sidecar_url"`    // sidecar /route 地址，如 http://127.0.0.1:9100/route
	SidecarToken  string   `json:"smart_router_sidecar_token"`  // 与 sidecar 约定的共享密钥(X-Router-Token)
	TriggerModels []string `json:"smart_router_trigger_models"` // 触发名清单(对客模型名)
	TimeoutMs     int      `json:"smart_router_timeout_ms"`     // 调 sidecar 超时(毫秒)，超时即用 FallbackModel
	FallbackModel string   `json:"smart_router_fallback_model"` // sidecar 失败/超时/返回非法时的安全兜底模型
}

var smartRouterSetting = SmartRouterSetting{
	Enabled:       false,
	SidecarURL:    "",
	SidecarToken:  "",
	TriggerModels: []string{"bdr-auto", "摆渡人智能"},
	TimeoutMs:     1800,
	FallbackModel: "claude-sonnet-4-6",
}

func init() {
	config.GlobalConfig.Register("smart_router_setting", &smartRouterSetting)
}

func GetSmartRouterSetting() *SmartRouterSetting {
	return &smartRouterSetting
}

// IsTrigger 判断请求的 model 是否为智能路由触发名。
func (s *SmartRouterSetting) IsTrigger(modelName string) bool {
	if !s.Enabled || modelName == "" {
		return false
	}
	for _, t := range s.TriggerModels {
		if t == modelName {
			return true
		}
	}
	return false
}
