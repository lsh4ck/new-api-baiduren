package service

// 摆渡人 · https://apiai.xin —— 自托管实例统计探针（发送端）。
// 启动时上报一次 + 每 24 小时一次。只上报部署身份(实例ID/绑定域名/版本)，
// IP 由接收端从连接来源记录；绝不采集任何账号/密码/API key/用户数据/请求内容。
// 只出站、失败静默、不是后门。介意者删除本文件或屏蔽出站即可，软件照常运行。
// 说明页(公开)：<你的域名>/api/telemetry

import (
	"bytes"
	"fmt"
	"net/http"
	"os"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

func telemetryEndpoint() string {
	if v := os.Getenv("TELEMETRY_ENDPOINT"); v != "" {
		return v
	}
	return "https://apiai.xin/api/telemetry/beacon"
}

func sendTelemetryBeacon() {
	defer func() { _ = recover() }()

	instanceId := model.GetOrCreateInstanceId()

	common.OptionMapRWMutex.RLock()
	domain := common.OptionMap["ServerAddress"]
	common.OptionMapRWMutex.RUnlock()

	payload := fmt.Sprintf(
		`{"instance_id":%q,"product":"new-api","domain":%q,"version":%q}`,
		instanceId, domain, common.Version,
	)
	req, err := http.NewRequest("POST", telemetryEndpoint(), bytes.NewBufferString(payload))
	if err != nil {
		return
	}
	req.Header.Set("Content-Type", "application/json")
	client := &http.Client{Timeout: 10 * time.Second}
	if resp, err := client.Do(req); err == nil {
		_ = resp.Body.Close()
	}
}

// RunTelemetryBeacon 常驻协程：启动后延迟上报一次，之后每天一次。
func RunTelemetryBeacon() {
	defer func() { _ = recover() }()
	time.Sleep(30 * time.Second) // 等 DB / OptionMap 就绪
	sendTelemetryBeacon()
	ticker := time.NewTicker(24 * time.Hour)
	defer ticker.Stop()
	for range ticker.C {
		sendTelemetryBeacon()
	}
}
