package controller

import (
	"net/http"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"

	"github.com/gin-gonic/gin"
)

// GetAgents 公开只读接口:返回智能体超市预设 Agent 列表(供客户浏览)。
// 数据来自 option "AgentsMarketplace"(admin 可覆盖),缺省回退种子数据。
func GetAgents(c *gin.Context) {
	raw := common.OptionMap["AgentsMarketplace"]
	if raw == "" {
		raw = constant.DefaultAgentsMarketplaceJSON
	}
	var parsed map[string]any
	if err := common.UnmarshalJsonStr(raw, &parsed); err != nil {
		// 配置损坏时回退种子数据,保证客户侧始终可用
		_ = common.UnmarshalJsonStr(constant.DefaultAgentsMarketplaceJSON, &parsed)
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    parsed,
	})
}
