package model

// 摆渡人 · https://apiai.xin
// 自托管实例统计（探针接收端存储）。只记录"部署身份"：实例ID / 产品 / 绑定域名 / 来源IP /
// 版本 / 首末次上报时间。绝不涉及任何账号、密码、API key、用户数据或请求内容。
// 用途：了解本软件有多少人在自部署、部署在哪。公开可查（见 /api/telemetry 申明页）。

import (
	"crypto/rand"
	"encoding/hex"
	"time"
)

type TelemetryDeployment struct {
	Id          int    `json:"id" gorm:"primaryKey"`
	InstanceId  string `json:"instance_id" gorm:"size:64;uniqueIndex"`
	Product     string `json:"product" gorm:"size:32"`
	Domain      string `json:"domain" gorm:"size:255"`
	IP          string `json:"ip" gorm:"size:64"`
	Version     string `json:"version" gorm:"size:32"`
	FirstSeen   int64  `json:"first_seen"`
	LastSeen    int64  `json:"last_seen"`
	BeaconCount int    `json:"beacon_count"`
}

func (TelemetryDeployment) TableName() string { return "telemetry_deployments" }

// UpsertBeacon 按 instance_id 归并一次上报。
func UpsertBeacon(instanceId, product, domain, ip, version string) error {
	now := time.Now().Unix()
	var d TelemetryDeployment
	if err := DB.Where(&TelemetryDeployment{InstanceId: instanceId}).First(&d).Error; err != nil {
		return DB.Create(&TelemetryDeployment{
			InstanceId:  instanceId,
			Product:     product,
			Domain:      domain,
			IP:          ip,
			Version:     version,
			FirstSeen:   now,
			LastSeen:    now,
			BeaconCount: 1,
		}).Error
	}
	return DB.Model(&d).Updates(map[string]interface{}{
		"product":      product,
		"domain":       domain,
		"ip":           ip,
		"version":      version,
		"last_seen":    now,
		"beacon_count": d.BeaconCount + 1,
	}).Error
}

// CountDeployments 返回 (总部署数, 近30天活跃数)。
func CountDeployments() (total int64, active int64) {
	DB.Model(&TelemetryDeployment{}).Count(&total)
	DB.Model(&TelemetryDeployment{}).Where("last_seen > ?", time.Now().Unix()-30*86400).Count(&active)
	return
}

// ListDeployments 管理员查看：所有部署明细，按最近上报倒序。
func ListDeployments() []TelemetryDeployment {
	var d []TelemetryDeployment
	DB.Order("last_seen desc").Find(&d)
	return d
}

// GetOrCreateInstanceId 本部署唯一实例ID（持久化在 options 表，重启不变）。
func GetOrCreateInstanceId() string {
	var opt Option
	if err := DB.Where(&Option{Key: "TelemetryInstanceId"}).First(&opt).Error; err == nil && opt.Value != "" {
		return opt.Value
	}
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	id := hex.EncodeToString(b)
	_ = UpdateOption("TelemetryInstanceId", id)
	return id
}
