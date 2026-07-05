package service

import (
	"bytes"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"

	"github.com/gin-gonic/gin"
)

// smartRouterPeek 只从请求体里"窥探"分类所需字段，不消费 body（UnmarshalBodyReusable 会复位）。
// messages: OpenAI(/v1/chat/completions) 与 Claude(/v1/messages) 都用此字段。
// system:   Claude 原生把系统提示放顶层 system 字段。
type smartRouterPeek struct {
	Messages json.RawMessage `json:"messages"`
	System   json.RawMessage `json:"system"`
	Tools    json.RawMessage `json:"tools"`
}

// smartRouterRequest 发给 sidecar 的信封（只含通用数据，无任何选模逻辑）。
type smartRouterRequest struct {
	Group      string          `json:"group"`
	Trigger    string          `json:"trigger"`
	Candidates []string        `json:"candidate_models"`
	Messages   json.RawMessage `json:"messages,omitempty"`
	System     json.RawMessage `json:"system,omitempty"`
	Tools      json.RawMessage `json:"tools,omitempty"`
}

type smartRouterResponse struct {
	Model string `json:"model"`
}

// ResolveSmartModel 调用闭源 sidecar，为「智能路由触发请求」选出最佳真实模型。
// 返回 (chosenModel, true) 表示成功且 chosenModel 合法（属候选集）；否则返回 ("", false)，
// 调用方应改用配置里的 FallbackModel。本函数只做"通用转发 + 结果校验"，不含选模策略。
func ResolveSmartModel(c *gin.Context, group, trigger string, candidates []string) (string, bool) {
	srs := operation_setting.GetSmartRouterSetting()
	if srs.SidecarURL == "" || len(candidates) == 0 {
		return "", false
	}

	var peek smartRouterPeek
	// 失败不致命：messages 取不到就让 sidecar 用空内容兜底
	_ = common.UnmarshalBodyReusable(c, &peek)

	payload := smartRouterRequest{
		Group:      group,
		Trigger:    trigger,
		Candidates: candidates,
		Messages:   peek.Messages,
		System:     peek.System,
		Tools:      peek.Tools,
	}
	body, err := common.Marshal(payload)
	if err != nil {
		return "", false
	}

	timeout := time.Duration(srs.TimeoutMs) * time.Millisecond
	if timeout <= 0 {
		timeout = 1800 * time.Millisecond
	}
	req, err := http.NewRequestWithContext(c.Request.Context(), http.MethodPost, srs.SidecarURL, bytes.NewReader(body))
	if err != nil {
		return "", false
	}
	req.Header.Set("Content-Type", "application/json")
	if srs.SidecarToken != "" {
		req.Header.Set("X-Router-Token", srs.SidecarToken)
	}

	client := &http.Client{Timeout: timeout}
	resp, err := client.Do(req)
	if err != nil {
		return "", false
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", false
	}

	var out smartRouterResponse
	if err := common.DecodeJson(resp.Body, &out); err != nil {
		return "", false
	}
	if out.Model == "" {
		return "", false
	}
	// 安全校验：sidecar 返回的模型必须在客户分组可用集内，杜绝越权/幻觉模型
	for _, m := range candidates {
		if m == out.Model {
			return out.Model, true
		}
	}
	return "", false
}

// SmartFallbackModel 在 sidecar 不可用时挑一个"客户分组内一定存在"的兜底模型：
// 优先用配置的 FallbackModel(若在候选集内)，否则按 sonnet>haiku>便宜国产 取候选，
// 再不行取第一个候选，杜绝兜底到一个该组没有的模型而硬报无渠道(纯国产组尤甚)。
func SmartFallbackModel(candidates []string, configured string) string {
	for _, m := range candidates {
		if m == configured {
			return configured
		}
	}
	for _, kw := range []string{"sonnet", "haiku", "deepseek", "qwen", "glm", "gemini", "gpt"} {
		for _, m := range candidates {
			if strings.Contains(strings.ToLower(m), kw) {
				return m
			}
		}
	}
	if len(candidates) > 0 {
		return candidates[0]
	}
	return configured
}
