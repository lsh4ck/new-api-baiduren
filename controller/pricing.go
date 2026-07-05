package controller

import (
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"

	"github.com/gin-gonic/gin"
)

func filterPricingByUsableGroups(pricing []model.Pricing, usableGroup map[string]string) []model.Pricing {
	if len(pricing) == 0 {
		return pricing
	}
	if len(usableGroup) == 0 {
		return []model.Pricing{}
	}

	filtered := make([]model.Pricing, 0, len(pricing))
	for _, item := range pricing {
		hasAll := common.StringsContains(item.EnableGroup, "all")
		// 收窄 enable_groups 到当前用户可见的分组，避免向客户泄露其它私有/内部分组名
		// （如 keymyran-private / qy001-private / provider-n-烧 / 含上游品牌的组名等）。
		// item 是 GetPricing 返回切片的值拷贝，这里用新 slice 重新赋值，不会污染共享缓存。
		visibleGroups := make([]string, 0, len(item.EnableGroup))
		for _, group := range item.EnableGroup {
			if group == "all" {
				continue
			}
			if _, ok := usableGroup[group]; ok {
				visibleGroups = append(visibleGroups, group)
			}
		}
		if !hasAll && len(visibleGroups) == 0 {
			// 该模型没有任何当前用户可见的分组 → 不展示
			continue
		}
		if hasAll {
			visibleGroups = append(visibleGroups, "all")
		}
		item.EnableGroup = visibleGroups
		filtered = append(filtered, item)
	}
	return filtered
}

func GetPricing(c *gin.Context) {
	pricing := model.GetPricing()
	userId, exists := c.Get("id")
	usableGroup := map[string]string{}
	groupRatio := map[string]float64{}
	for s, f := range ratio_setting.GetGroupRatioCopy() {
		groupRatio[s] = f
	}
	var group string
	if exists {
		user, err := model.GetUserCache(userId.(int))
		if err == nil {
			group = user.Group
			for g := range groupRatio {
				ratio, ok := ratio_setting.GetGroupGroupRatio(group, g)
				if ok {
					groupRatio[g] = ratio
				}
			}
		}
	}

	usableGroup = service.GetUserUsableGroups(group)
	pricing = filterPricingByUsableGroups(pricing, usableGroup)

	// 注入「摆渡人智能」入口卡(仅当智能路由启用):对客可见的智能选模门面。
	// model_name=bdr-auto 同时是 API 触发名;动态计费,前端对 bdr-auto 特判渲染
	// (琥珀"智能·按实付费"徽标 + 按实际模型计费文案)。prepend 置顶为推荐位。
	if srs := operation_setting.GetSmartRouterSetting(); srs.Enabled && len(usableGroup) > 0 {
		groups := make([]string, 0, len(usableGroup))
		for g := range usableGroup {
			groups = append(groups, g)
		}
		bdrAuto := model.Pricing{
			ModelName:   "bdr-auto",
			Description: "摆渡人智能 · 自动为你选用最优模型——简单问答走轻量模型、复杂任务自动上旗舰,按实际选中的模型计费,无需纠结选型。在 API 里把 model 填 bdr-auto 即可。",
			Tags:        "智能精选",
			QuotaType:   0,
			EnableGroup: groups,
			BillingMode: "smart_auto",
		}
		pricing = append([]model.Pricing{bdrAuto}, pricing...)
	}
	// check groupRatio contains usableGroup
	for group := range ratio_setting.GetGroupRatioCopy() {
		if _, ok := usableGroup[group]; !ok {
			delete(groupRatio, group)
		}
	}

	c.JSON(200, gin.H{
		"success":            true,
		"data":               pricing,
		"vendors":            model.GetVendors(),
		"group_ratio":        groupRatio,
		"usable_group":       usableGroup,
		"supported_endpoint": model.GetSupportedEndpointMap(),
		"auto_groups":        service.GetUserAutoGroup(group),
		"pricing_version":    "a42d372ccf0b5dd13ecf71203521f9d2",
	})
}

func ResetModelRatio(c *gin.Context) {
	defaultStr := ratio_setting.DefaultModelRatio2JSONString()
	err := model.UpdateOption("ModelRatio", defaultStr)
	if err != nil {
		c.JSON(200, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	err = ratio_setting.UpdateModelRatioByJSONString(defaultStr)
	if err != nil {
		c.JSON(200, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	c.JSON(200, gin.H{
		"success": true,
		"message": "重置模型倍率成功",
	})
}
