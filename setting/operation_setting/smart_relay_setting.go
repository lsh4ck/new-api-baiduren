package operation_setting

import "github.com/QuantumNous/new-api/setting/config"

// SmartRelaySetting SmartRelay 缓存/优化代理路由配置。
//
// 开启后，命中「分组白名单」的 chat/completions 请求在发往真上游前，先经本机
// smart-relay sidecar（L1 响应缓存 + 上游 prompt 缓存注入 + 上下文压缩）。
// new-api 通过 X-SmartRelay-Upstream 头把「真上游完整 URL」告诉 sidecar，
// sidecar 据此转发——因此无需在 sidecar 侧维护渠道清单，new-api 始终是路由唯一真源。
//
// 可靠性：sidecar 不可达 / 返回内部错时，new-api 自动 failsafe 直连真上游，
// 并将 sidecar 标记为「近 30s 不健康」以避免每请求重试死进程；保证不因代理故障中断服务。
//
// 灰度：Groups 为空且 Enabled=true 时对所有分组生效；非空则仅白名单内分组经 sidecar。
//
// 真正的缓存/优化逻辑全在 sidecar 内（独立进程，HTTP 边界，非本 AGPL 工程的衍生作品）。
type SmartRelaySetting struct {
	Enabled bool     `json:"smart_relay_enabled"` // 总开关
	URL     string   `json:"smart_relay_url"`     // sidecar 基址，如 http://127.0.0.1:9090
	Groups  []string `json:"smart_relay_groups"`  // 灰度分组白名单；空=对所有分组生效（总开关开时）
}

var smartRelaySetting = SmartRelaySetting{
	Enabled: false,
	URL:     "http://127.0.0.1:9090",
	Groups:  []string{},
}

func init() {
	config.GlobalConfig.Register("smart_relay_setting", &smartRelaySetting)
}

func GetSmartRelaySetting() *SmartRelaySetting {
	return &smartRelaySetting
}

// ShouldRoute 判断某分组的请求是否应经 smart-relay。
func (s *SmartRelaySetting) ShouldRoute(group string) bool {
	if !s.Enabled || s.URL == "" {
		return false
	}
	if len(s.Groups) == 0 {
		return true
	}
	for _, g := range s.Groups {
		if g == group {
			return true
		}
	}
	return false
}
