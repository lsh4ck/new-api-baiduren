package model

import (
	"errors"

	"gorm.io/gorm"
)

// RenderJob 漫剧成片渲染任务（网关侧记录，对应渲染机的一次 /api/render）。
// 计费在任务完成时按成片时长 + 后处理项一次性结算（与上游 task 一致：失败不扣）。
type RenderJob struct {
	Id          int     `json:"id" gorm:"primaryKey"`
	UserId      int     `json:"user_id" gorm:"index"`
	TokenId     int     `json:"token_id"`
	WorkerJobId string  `json:"worker_job_id" gorm:"index;size:64"` // 渲染机返回的 job_id
	Status      string  `json:"status" gorm:"size:16"`               // queued/running/done/failed
	Progress    int     `json:"progress"`
	Stage       string  `json:"stage" gorm:"size:64"`
	DurationSec float64 `json:"duration_sec"` // 成片时长（秒），完成后回填
	Dub         bool    `json:"dub"`
	Subtitle    bool    `json:"subtitle"`
	Quota       int     `json:"quota"`  // 已结算 quota
	Billed      bool    `json:"billed"` // 是否已扣费（幂等保护）
	OutputURL   string  `json:"-" gorm:"type:text"`         // 渲染机真实成片直链（不对客户暴露，走代理）
	FailReason  string  `json:"fail_reason" gorm:"type:text"`
	CreatedTime int64   `json:"created_time" gorm:"index"`
	UpdatedTime int64   `json:"updated_time"`
}

func (r *RenderJob) Insert() error {
	return DB.Create(r).Error
}

func (r *RenderJob) Update() error {
	return DB.Model(r).Select("status", "progress", "stage", "duration_sec",
		"quota", "billed", "output_url", "fail_reason", "updated_time").Updates(r).Error
}

// GetRenderJob 按 用户 + 渲染机 job_id 取任务（鉴权：只能查自己的）。
func GetRenderJob(userId int, workerJobId string) (*RenderJob, error) {
	if workerJobId == "" {
		return nil, errors.New("worker_job_id is empty")
	}
	var job RenderJob
	err := DB.Where("user_id = ? AND worker_job_id = ?", userId, workerJobId).First(&job).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &job, nil
}

// CleanExpiredRenderJobs 删除超过 retainDays 的渲染任务记录（与渲染机 7 天清理同步）。
func CleanExpiredRenderJobs(cutoffUnix int64) (int64, error) {
	res := DB.Where("created_time < ?", cutoffUnix).Delete(&RenderJob{})
	return res.RowsAffected, res.Error
}
