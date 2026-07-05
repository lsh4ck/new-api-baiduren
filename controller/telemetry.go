package controller

// 摆渡人 · https://apiai.xin —— 自托管实例统计探针 接收端。
// 干净透明：只接收部署身份上报，IP 从连接来源自动记录（探针不自采）。
// GET /api/telemetry 是公开申明页，任何发现探针的人都能看到它在做什么 + 有多少部署在用。

import (
	"fmt"
	"net/http"

	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

type telemetryBeaconReq struct {
	InstanceId string `json:"instance_id"`
	Product    string `json:"product"`
	Domain     string `json:"domain"`
	Version    string `json:"version"`
}

func clip(s string, n int) string {
	if len(s) > n {
		return s[:n]
	}
	return s
}

// ReceiveBeacon 接收一次自托管部署上报。来源 IP 自动记录，不采集任何用户数据。
func ReceiveBeacon(c *gin.Context) {
	var req telemetryBeaconReq
	if err := c.ShouldBindJSON(&req); err != nil || req.InstanceId == "" {
		c.JSON(http.StatusOK, gin.H{"ok": false})
		return
	}
	_ = model.UpsertBeacon(
		clip(req.InstanceId, 64),
		clip(req.Product, 32),
		clip(req.Domain, 255),
		c.ClientIP(),
		clip(req.Version, 32),
	)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// TelemetryPage 公开申明页 + 部署统计。
func TelemetryPage(c *gin.Context) {
	total, active := model.CountDeployments()
	c.Data(http.StatusOK, "text/html; charset=utf-8",
		[]byte(fmt.Sprintf(telemetryHTML, active, total)))
}

// TelemetryDeployments 管理员专用：返回所有部署明细(IP/域名/实例ID等不公开细节)。
func TelemetryDeployments(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"success": true, "data": model.ListDeployments()})
}

const telemetryHTML = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>部署统计探针 · 说明</title>
<style>
:root{color-scheme:dark}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
  background:#0a0a0f;color:#e6e6ea;font-family:-apple-system,"Segoe UI",Roboto,"PingFang SC",sans-serif;padding:24px}
.card{max-width:640px;width:100%%;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);
  border-radius:20px;padding:36px 34px}
h1{font-size:20px;margin:0 0 6px;letter-spacing:.5px}
.sub{color:#8a8a95;font-size:13px;margin-bottom:24px}
.stats{display:flex;gap:16px;margin:24px 0}
.stat{flex:1;background:rgba(16,185,129,.08);border:1px solid rgba(16,185,129,.25);border-radius:14px;padding:18px 20px}
.num{font-size:30px;font-weight:700;color:#34d399;font-variant-numeric:tabular-nums}
.lab{font-size:12px;color:#8a8a95;margin-top:4px}
.decl{background:rgba(255,255,255,.02);border-radius:12px;padding:16px 18px;font-size:13.5px;line-height:1.8;color:#c4c4cc}
.decl b{color:#e6e6ea}
.ok{color:#34d399}.no{color:#f87171}
.foot{margin-top:22px;font-size:12px;color:#6a6a75;text-align:center}
a{color:#34d399;text-decoration:none}
</style></head>
<body><div class="card">
<h1>🛰️ 自托管实例统计探针</h1>
<div class="sub">本页面公开可查 —— 谁发现了这个探针，都能看到它在做什么。</div>
<div class="stats">
  <div class="stat"><div class="num">%d</div><div class="lab">近 30 天活跃部署</div></div>
  <div class="stat"><div class="num">%d</div><div class="lab">累计已知部署</div></div>
</div>
<div class="decl">
本软件内置一个<b>透明的部署统计探针</b>，用于让作者了解<b>有多少人在自部署本软件、部署在哪</b>。它只做一件事：<br><br>
<span class="ok">✔ 会上报</span>：部署的<b>域名</b>、<b>公网 IP</b>、软件<b>版本</b>、一个随机<b>实例ID</b>、时间戳。<br>
<span class="no">✗ 绝不采集</span>：任何账号、密码、API key、用户数据、数据库内容或请求内容。<br>
<span class="no">✗ 不是后门</span>：只出站上报，不开任何入站控制通道，不影响你的正常运行。<br><br>
如果你介意，<b>删掉相关代码或屏蔽出站即可</b>，软件照常工作 —— 作者并不会因此做任何事，只是想知道有多少人在用。
</div>
<div class="foot">摆渡人 · <a href="https://apiai.xin">apiai.xin</a></div>
</div></body></html>`
