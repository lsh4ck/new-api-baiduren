package service

import (
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/types"
)

// 回归测试: 上游渠道欠费返回的 insufficient_user_quota 不得被当成"客户自身额度不足"。
// 见 RelayErrorHandler 中的重映射逻辑 + types.isQuotaError。
func mockResp(status int, body string) *http.Response {
	return &http.Response{
		StatusCode: status,
		Body:       io.NopCloser(strings.NewReader(body)),
		Header:     http.Header{"Content-Type": []string{"application/json"}},
	}
}

func TestRelayErrorHandler_UpstreamInsufficientNotMisclassified(t *testing.T) {
	// 上游(kk类网关)欠费: code=insufficient_user_quota
	resp := mockResp(http.StatusForbidden,
		`{"error":{"code":"insufficient_user_quota","type":"kk_api_error","message":"用户额度不足, 剩余额度: ¥-0.72"}}`)
	e := RelayErrorHandler(nil, resp, false)
	if e == nil {
		t.Fatal("expected error, got nil")
	}
	if e.GetErrorCode() == types.ErrorCodeInsufficientUserQuota {
		t.Fatalf("上游欠费被误判为客户额度不足(会给客户弹402请充值): code=%s", e.GetErrorCode())
	}
	if e.GetErrorCode() != "upstream_channel_error" {
		t.Fatalf("期望重映射为 upstream_channel_error, 实际=%s", e.GetErrorCode())
	}
	// 状态码应保留(403),以便重试逻辑 cascade 到备用渠道
	if e.StatusCode != http.StatusForbidden {
		t.Fatalf("期望状态码保留403, 实际=%d", e.StatusCode)
	}
}

func TestRelayErrorHandler_OtherUpstreamErrorUntouched(t *testing.T) {
	// 普通上游错误不受影响
	resp := mockResp(http.StatusBadGateway,
		`{"error":{"code":"server_error","type":"api_error","message":"Service temporarily unavailable"}}`)
	e := RelayErrorHandler(nil, resp, false)
	if e == nil {
		t.Fatal("expected error, got nil")
	}
	if e.GetErrorCode() != "server_error" {
		t.Fatalf("普通上游错误码不应被改动, 实际=%s", e.GetErrorCode())
	}
}
