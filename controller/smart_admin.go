package controller

// 摆渡人 · https://apiai.xin —— 后台「智能管理」AI copilot。
// 管理员在 web 后台(尤其手机)用自然语言提问，后端用自己的 Claude key 调 Claude，
// Claude 通过只读 SQL 工具查库、算账、返回结果。仅管理员可用；SQL 强制只读。

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

// ---- 配置读取(OptionMap，admin 可在设置里改) ----
func smartAdminCfg() (base, key, mdl string) {
	common.OptionMapRWMutex.RLock()
	base = common.OptionMap["SmartAdminBaseUrl"]
	key = common.OptionMap["SmartAdminKey"]
	mdl = common.OptionMap["SmartAdminModel"]
	common.OptionMapRWMutex.RUnlock()
	if base == "" {
		base = "https://apiai.xin/v1"
	}
	base = strings.TrimRight(base, "/")
	if mdl == "" {
		mdl = "claude-sonnet-4-6"
	}
	return
}

const smartAdminSystemPrompt = `你是「摆渡人」API 中转站的后台智能管理助手，帮管理员查询和分析运营数据。

数据库是 PostgreSQL，你有一个只读 SQL 工具 sql_query 可以查询。关键表和字段：
- logs：运营日志。user_id, created_at(unix秒), type(1=充值 2=消费 5=错误), username, model_name, quota, prompt_tokens, completion_tokens, channel_id, channel_name, "group", content。
- users：id, username, "group"(分组), quota(剩余额度), used_quota(累计消费), status(1正常 2禁用)。
- channels：id, name, "group", status, models, priority, base_url。
- top_ups：用户充值记录。user_id, amount, status, create_time(unix秒)。
- options：站点配置 key/value(含 GroupRatio、ModelRatio 等 JSON)。

金额口径(务必算对数量级)：quota 是内部计费单位。换算公式：美元$ = quota ÷ 500000；人民币¥ = 美元 × 7。
举例：quota=45000000 → 45000000 ÷ 500000 = $90 → $90 × 7 = ¥630。再举例：quota=500000 → $1 → ¥7。
回答金额时严格按此公式，先算美元再×7，别少除或多除位数。同时把 quota 原值也报出来供核对。
时间：created_at 是 Unix 秒。今天=从当天 00:00(东八区 UTC+8)起。可用 extract(epoch from (date_trunc('day', now() AT TIME ZONE 'Asia/Shanghai')) AT TIME ZONE 'Asia/Shanghai')::int 取今天起点。
"group" 和 "key" 是保留字，写 SQL 时必须加双引号。

规则：
- 只能 SELECT 查询，禁止任何写操作。
- 先想清楚要查什么，用 sql_query 查数据，必要时多查几次，最后给管理员清晰的中文结论(带具体数字，金额换算成¥)。
- 简洁、直接、给结论。不要暴露 SQL 细节除非管理员要。`

// ---- 只读 SQL 守卫 ----
func isReadOnlySQL(q string) bool {
	s := strings.ToLower(strings.TrimSpace(q))
	if !strings.HasPrefix(s, "select") && !strings.HasPrefix(s, "with") {
		return false
	}
	for _, bad := range []string{"insert ", "update ", "delete ", "drop ", "alter ", "truncate ", "create ", "grant ", "revoke ", ";delete", ";update", ";drop", ";insert"} {
		if strings.Contains(s, bad) {
			return false
		}
	}
	return true
}

func execReadOnlySQL(q string) string {
	if !isReadOnlySQL(q) {
		return "ERROR: 仅允许只读 SELECT 查询"
	}
	var rows []map[string]interface{}
	err := model.DB.Raw(q).Scan(&rows).Error
	if err != nil {
		return "ERROR: " + err.Error()
	}
	if len(rows) > 500 {
		rows = rows[:500]
	}
	b, e := common.Marshal(rows)
	if e != nil {
		return "ERROR: 结果序列化失败"
	}
	out := string(b)
	if len(out) > 20000 {
		out = out[:20000] + "...(结果过长已截断)"
	}
	return out
}

// ---- Claude 调用(原生 /v1/messages + tools) ----
func callClaudeAdmin(base, key, mdl string, messages []map[string]interface{}) (map[string]interface{}, error) {
	tools := []map[string]interface{}{{
		"name":        "sql_query",
		"description": "对运营数据库执行一条只读 SELECT 查询，返回 JSON 行。用于查询用户/账单/分组/渠道/日志等数据。",
		"input_schema": map[string]interface{}{
			"type":       "object",
			"properties": map[string]interface{}{"query": map[string]interface{}{"type": "string", "description": "PostgreSQL 只读 SELECT 语句"}},
			"required":   []string{"query"},
		},
	}}
	payload := map[string]interface{}{
		"model":      mdl,
		"max_tokens": 3000,
		"system":     smartAdminSystemPrompt,
		"messages":   messages,
		"tools":      tools,
	}
	body, _ := common.Marshal(payload)
	req, err := http.NewRequest("POST", base+"/messages", strings.NewReader(string(body)))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", key)
	req.Header.Set("Authorization", "Bearer "+key)
	req.Header.Set("anthropic-version", "2023-06-01")
	client := &http.Client{Timeout: 120 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	var out map[string]interface{}
	if err := common.DecodeJson(resp.Body, &out); err != nil {
		return nil, err
	}
	return out, nil
}

type smartAdminReq struct {
	Messages []map[string]interface{} `json:"messages"`
}

// SmartAdminChat 后台智能管理对话：跑 Claude 工具循环(查库→算→答)，返回最终文本。
func SmartAdminChat(c *gin.Context) {
	base, key, mdl := smartAdminCfg()
	if key == "" {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "尚未配置 Claude key（在设置里填 SmartAdminKey）"})
		return
	}
	var req smartAdminReq
	if err := c.ShouldBindJSON(&req); err != nil || len(req.Messages) == 0 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "消息为空"})
		return
	}
	messages := req.Messages
	var toolLog []string
	for i := 0; i < 8; i++ { // 最多 8 轮工具调用
		resp, err := callClaudeAdmin(base, key, mdl, messages)
		if err != nil {
			c.JSON(http.StatusOK, gin.H{"success": false, "message": "调用 Claude 失败: " + err.Error()})
			return
		}
		if em, ok := resp["error"]; ok {
			c.JSON(http.StatusOK, gin.H{"success": false, "message": fmt.Sprintf("Claude 错误: %v", em)})
			return
		}
		content, _ := resp["content"].([]interface{})
		stop, _ := resp["stop_reason"].(string)
		// 收集文本 + 工具调用
		var textOut strings.Builder
		var toolUses []map[string]interface{}
		for _, blk := range content {
			m, _ := blk.(map[string]interface{})
			switch m["type"] {
			case "text":
				if t, ok := m["text"].(string); ok {
					textOut.WriteString(t)
				}
			case "tool_use":
				toolUses = append(toolUses, m)
			}
		}
		if stop != "tool_use" || len(toolUses) == 0 {
			c.JSON(http.StatusOK, gin.H{"success": true, "reply": textOut.String(), "tool_calls": toolLog})
			return
		}
		// 执行工具 → 回填 tool_result
		messages = append(messages, map[string]interface{}{"role": "assistant", "content": content})
		var results []map[string]interface{}
		for _, tu := range toolUses {
			input, _ := tu["input"].(map[string]interface{})
			q, _ := input["query"].(string)
			toolLog = append(toolLog, q)
			results = append(results, map[string]interface{}{
				"type":        "tool_result",
				"tool_use_id": tu["id"],
				"content":     execReadOnlySQL(q),
			})
		}
		messages = append(messages, map[string]interface{}{"role": "user", "content": results})
	}
	c.JSON(http.StatusOK, gin.H{"success": false, "message": "工具调用超过上限，请把问题拆细一点"})
}
