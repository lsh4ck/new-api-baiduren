package atlas

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relay/channel"
	taskcommon "github.com/QuantumNous/new-api/relay/channel/task/taskcommon"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
	"github.com/pkg/errors"
)

// ============================================================================
// Atlas Cloud（atlascloud.ai）视频生成适配器
//
// 覆盖 Seedance / 可灵Kling 全系 / Veo3.1 / 海螺Hailuo / Wan / Vidu / Grok 等
// 149 个视频模型，一个 key 全打通。
//
// 鉴权：Authorization: Bearer {apiKey}
//
// 流程：异步 ——
//   提交  POST {base}/api/v1/model/generateVideo  → data.id（request_id）
//   轮询  GET  {base}/api/v1/model/prediction/{request_id}
//   响应统一裹在 {code, message, data:{...}} 信封里。
//
// 计费：上游在 data.completion_tokens 返回本次生成的计费 token 数，
//   该值已把"分辨率×时长"全部折算进去（实测 4s/480p Seedance2.0-Fast=40594）。
//   故只需把 completion_tokens 写入 TaskInfo.CompletionTokens，由 new-api 按
//   单一 model_ratio 结算 —— 480p/720p/1080p 自动按 token 量等比例计费，
//   无需为每个分辨率单独建模型。配置倍率即可加价并守住利润护栏。
// ============================================================================

const (
	pathGenerateVideo = "/api/v1/model/generateVideo"
	pathPrediction    = "/api/v1/model/prediction/" // + request_id
)

// ============================
// Request / Response structures
// ============================

type generateVideoRequest struct {
	Model           string `json:"model"`
	Prompt          string `json:"prompt"`
	Duration        int    `json:"duration,omitempty"`
	Resolution      string `json:"resolution,omitempty"`
	Ratio           string `json:"ratio,omitempty"`
	GenerateAudio   *bool  `json:"generate_audio,omitempty"`
	Watermark       *bool  `json:"watermark,omitempty"`
	Image           string `json:"image,omitempty"`
	LastImage       string `json:"last_image,omitempty"`
	ReturnLastFrame *bool  `json:"return_last_frame,omitempty"`
}

// atlasData 是统一信封中的 data 字段
type atlasData struct {
	ID               string            `json:"id"`
	Model            string            `json:"model"`
	Status           string            `json:"status"` // processing / completed / failed / timeout
	Outputs          []string          `json:"outputs"`
	URLs             map[string]string `json:"urls"`
	CompletionTokens int               `json:"completion_tokens"`
	TotalTokens      int               `json:"total_tokens"`
	Error            string            `json:"error"`
	CreatedAt        string            `json:"created_at"`
}

// atlasEnvelope 统一响应信封；code 可能是 int(200) 或 string("200")
type atlasEnvelope struct {
	Code    json.RawMessage `json:"code"`
	Message string          `json:"message"`
	Data    atlasData       `json:"data"`
	// 兼容部分接口把字段直接平铺在顶层（非 data 包裹）的情况
	atlasData
}

// data 优先取 data 包裹，缺失则回退顶层平铺
func (e *atlasEnvelope) get() atlasData {
	if e.Data.ID != "" || e.Data.Status != "" || len(e.Data.Outputs) > 0 {
		return e.Data
	}
	return e.atlasData
}

// ============================
// Adaptor
// ============================

type TaskAdaptor struct {
	taskcommon.BaseBilling
	ChannelType int
	apiKey      string
	baseURL     string
}

func (a *TaskAdaptor) Init(info *relaycommon.RelayInfo) {
	a.ChannelType = info.ChannelType
	a.baseURL = strings.TrimRight(info.ChannelBaseUrl, "/")
	if a.baseURL == "" {
		a.baseURL = "https://api.atlascloud.ai"
	}
	a.apiKey = info.ApiKey
}

func (a *TaskAdaptor) ValidateRequestAndSetAction(c *gin.Context, info *relaycommon.RelayInfo) (taskErr *dto.TaskError) {
	return relaycommon.ValidateBasicTaskRequest(c, info, constant.TaskActionGenerate)
}

// EstimateBilling 按「秒 × 分辨率」预扣费。
//
// 计费公式（框架）：quota = 模型按次基价(ModelPrice) × seconds × size。
// 因此每个视频模型在 new-api 里配「按次价格」= 该模型 1 秒 @480p 的对客单价，
// 由本方法乘以秒数与分辨率系数得到最终额度。
//
// ⚠️ 不依赖上游返回的 completion_tokens —— 上游（如 Kling/Veo）很多根本不返回，
// 一旦依赖就会出现客户白嫖、我方吃成本。改为提交时按客户请求参数锁价，
// 且 BuildRequestBody 显式回传同样的 duration/resolution，杜绝上游擅自加时长。
func (a *TaskAdaptor) EstimateBilling(c *gin.Context, info *relaycommon.RelayInfo) map[string]float64 {
	req, err := relaycommon.GetTaskRequest(c)
	if err != nil {
		return nil
	}
	duration, resolution := a.resolveParams(req)
	modelName := taskcommon.DefaultString(info.UpstreamModelName, req.Model)
	return map[string]float64{
		"seconds": float64(duration),
		"size":    sizeFactor(modelName, resolution),
	}
}

func (a *TaskAdaptor) BuildRequestURL(info *relaycommon.RelayInfo) (string, error) {
	return a.baseURL + pathGenerateVideo, nil
}

func (a *TaskAdaptor) BuildRequestHeader(c *gin.Context, req *http.Request, info *relaycommon.RelayInfo) error {
	req.Header.Set("Authorization", "Bearer "+a.apiKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	return nil
}

func (a *TaskAdaptor) BuildRequestBody(c *gin.Context, info *relaycommon.RelayInfo) (io.Reader, error) {
	req, err := relaycommon.GetTaskRequest(c)
	if err != nil {
		return nil, err
	}

	modelName := taskcommon.DefaultString(info.UpstreamModelName, req.Model)

	// 收集首帧图：优先 Images 列表首张，其次单张 Image
	image := req.Image
	if image == "" && len(req.Images) > 0 {
		image = req.Images[0]
	}

	duration, resolution := a.resolveParams(req)

	body := generateVideoRequest{
		Model:      modelName,
		Prompt:     req.Prompt,
		Duration:   duration,
		Resolution: resolution,
		Ratio:      a.ratioFromSize(req.Size),
		Image:      image,
	}

	// 客户端可通过 metadata 覆盖上游字段（generate_audio / watermark / ratio /
	// last_image / return_last_frame 等）。
	if err := taskcommon.UnmarshalMetadata(req.Metadata, &body); err != nil {
		return nil, errors.Wrap(err, "unmarshal metadata failed")
	}

	// 关键：duration / resolution 必须与 EstimateBilling 预扣费时一致，
	// 故在 metadata 合并之后强制锁回 resolveParams 的结果，
	// 防止客户端用 metadata 偷偷加时长/升分辨率却按低价计费。
	body.Duration = duration
	body.Resolution = resolution

	if body.Model == "" {
		return nil, fmt.Errorf("model is required")
	}
	if body.Prompt == "" && body.Image == "" {
		return nil, fmt.Errorf("prompt or image is required")
	}

	data, err := common.Marshal(body)
	if err != nil {
		return nil, err
	}
	return bytes.NewReader(data), nil
}

func (a *TaskAdaptor) DoRequest(c *gin.Context, info *relaycommon.RelayInfo, requestBody io.Reader) (*http.Response, error) {
	return channel.DoTaskApiRequest(a, c, info, requestBody)
}

func (a *TaskAdaptor) DoResponse(c *gin.Context, resp *http.Response, info *relaycommon.RelayInfo) (taskID string, taskData []byte, taskErr *dto.TaskError) {
	responseBody, err := io.ReadAll(resp.Body)
	if err != nil {
		taskErr = service.TaskErrorWrapper(err, "read_response_body_failed", http.StatusInternalServerError)
		return
	}

	var env atlasEnvelope
	if err = common.Unmarshal(responseBody, &env); err != nil {
		taskErr = service.TaskErrorWrapper(err, "unmarshal_response_failed", http.StatusInternalServerError)
		return
	}
	d := env.get()

	if d.ID == "" || strings.EqualFold(d.Status, "failed") {
		msg := env.Message
		if msg == "" {
			msg = d.Error
		}
		if msg == "" {
			msg = "atlas submit failed: " + string(responseBody)
		}
		taskErr = service.TaskErrorWrapperLocal(fmt.Errorf("%s", msg), "task_failed", http.StatusBadRequest)
		return
	}

	ov := dto.NewOpenAIVideo()
	ov.ID = info.PublicTaskID
	ov.TaskID = info.PublicTaskID
	ov.CreatedAt = time.Now().Unix()
	ov.Model = info.OriginModelName
	c.JSON(http.StatusOK, ov)
	return d.ID, responseBody, nil
}

// FetchTask 轮询任务：GET /api/v1/model/prediction/{request_id}
func (a *TaskAdaptor) FetchTask(baseUrl, key string, body map[string]any, proxy string) (*http.Response, error) {
	taskID, ok := body["task_id"].(string)
	if !ok || taskID == "" {
		return nil, fmt.Errorf("invalid task_id")
	}
	base := strings.TrimRight(baseUrl, "/")
	if base == "" {
		base = "https://api.atlascloud.ai"
	}
	url := base + pathPrediction + taskID

	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+key)
	req.Header.Set("Accept", "application/json")

	client, err := service.GetHttpClientWithProxy(proxy)
	if err != nil {
		return nil, fmt.Errorf("new proxy http client failed: %w", err)
	}
	return client.Do(req)
}

func (a *TaskAdaptor) ParseTaskResult(respBody []byte) (*relaycommon.TaskInfo, error) {
	var env atlasEnvelope
	if err := common.Unmarshal(respBody, &env); err != nil {
		return nil, errors.Wrap(err, "failed to unmarshal prediction response")
	}
	d := env.get()

	taskInfo := &relaycommon.TaskInfo{Code: 0}
	taskInfo.TaskID = d.ID
	taskInfo.Reason = d.Error

	switch strings.ToLower(d.Status) {
	case "", "processing", "pending", "queued", "running", "starting":
		taskInfo.Status = model.TaskStatusInProgress
		taskInfo.Progress = "50%"
	case "completed", "succeeded", "success":
		taskInfo.Status = model.TaskStatusSuccess
		taskInfo.Progress = "100%"
		if len(d.Outputs) > 0 {
			taskInfo.Url = d.Outputs[0]
		}
		// 按 completion_tokens 计费（已含分辨率/时长折算）
		if d.CompletionTokens > 0 {
			taskInfo.CompletionTokens = d.CompletionTokens
			taskInfo.TotalTokens = d.TotalTokens
			if taskInfo.TotalTokens == 0 {
				taskInfo.TotalTokens = d.CompletionTokens
			}
		}
	case "failed", "timeout", "canceled", "cancelled", "error":
		taskInfo.Status = model.TaskStatusFailure
		taskInfo.Progress = "100%"
		if taskInfo.Reason == "" {
			taskInfo.Reason = "task " + d.Status
		}
	default:
		taskInfo.Status = model.TaskStatusInProgress
		taskInfo.Progress = "30%"
	}
	return taskInfo, nil
}

func (a *TaskAdaptor) GetModelList() []string {
	return []string{
		// Seedance（字节）
		"bytedance/seedance-2.0/text-to-video",
		"bytedance/seedance-2.0/image-to-video",
		"bytedance/seedance-2.0/reference-to-video",
		"bytedance/seedance-2.0-fast/text-to-video",
		"bytedance/seedance-2.0-fast/image-to-video",
		"bytedance/seedance-2.0-fast/reference-to-video",
		"bytedance/seedance-v1.5-pro/text-to-video",
		"bytedance/seedance-v1.5-pro/image-to-video",
		"bytedance/seedance-v1-pro-t2v-720p",
		"bytedance/seedance-v1-pro-t2v-1080p",
		"bytedance/seedance-v1-pro-i2v-720p",
		"bytedance/seedance-v1-pro-i2v-1080p",
		// 可灵 Kling
		"kwaivgi/kling-v3.0-pro/text-to-video",
		"kwaivgi/kling-v3.0-pro/image-to-video",
		"kwaivgi/kling-v3.0-std/text-to-video",
		"kwaivgi/kling-v3.0-std/image-to-video",
		"kwaivgi/kling-v2.6-pro/text-to-video",
		"kwaivgi/kling-v2.6-pro/image-to-video",
		"kwaivgi/kling-v2.5-turbo-pro/text-to-video",
		"kwaivgi/kling-v2.5-turbo-pro/image-to-video",
		// Google Veo / Gemini Omni
		"google/veo3.1/text-to-video",
		"google/veo3.1/image-to-video",
		"google/veo3.1-fast/text-to-video",
		"google/veo3.1-fast/image-to-video",
		"google/veo3.1-lite/text-to-video",
		// 海螺 Hailuo（MiniMax）
		"minimax/hailuo-2.3/t2v-pro",
		"minimax/hailuo-2.3/i2v-pro",
		"minimax/hailuo-2.3/t2v-standard",
		"minimax/hailuo-2.3/i2v-standard",
		"minimax/hailuo-2.3/fast",
		// 通义万相 Wan
		"alibaba/wan-2.7/text-to-video",
		"alibaba/wan-2.7/image-to-video",
		"alibaba/wan-2.6/text-to-video",
		"alibaba/wan-2.6/image-to-video",
		"alibaba/wan-2.5/text-to-video",
		"alibaba/wan-2.5/image-to-video",
		// Vidu
		"vidu/q3-pro/text-to-video",
		"vidu/q3-pro/image-to-video",
		"vidu/q3-turbo/text-to-video",
		"vidu/q3-turbo/image-to-video",
		// Grok Imagine
		"xai/grok-imagine-video/text-to-video",
		"xai/grok-imagine-video/image-to-video",
	}
}

func (a *TaskAdaptor) GetChannelName() string {
	return "atlas"
}

func (a *TaskAdaptor) ConvertToOpenAIVideo(originTask *model.Task) ([]byte, error) {
	var env atlasEnvelope
	_ = common.Unmarshal(originTask.Data, &env)
	d := env.get()

	ov := dto.NewOpenAIVideo()
	ov.ID = originTask.TaskID
	ov.Status = originTask.Status.ToVideoStatus()
	ov.SetProgressStr(originTask.Progress)
	if len(d.Outputs) > 0 && d.Outputs[0] != "" {
		// 用本站代理 URL 替代上游直链，避免泄露上游存储域名/品牌
		ov.SetMetadata("url", taskcommon.BuildProxyURL(originTask.TaskID))
	}
	if d.Error != "" {
		ov.Error = &dto.OpenAIVideoError{Message: d.Error}
	}
	return common.Marshal(ov)
}

// ============================
// helpers
// ============================

// resolveParams 统一解析最终的 (时长, 分辨率)，供 EstimateBilling 与
// BuildRequestBody 共用，保证「预扣费」与「实际提交」完全一致。
// 优先级：metadata.duration/resolution > 标准字段(Duration/Seconds/Size) > 默认值。
func (a *TaskAdaptor) resolveParams(req relaycommon.TaskSubmitReq) (duration int, resolution string) {
	// ── 时长 ──
	d := req.Duration
	if d == 0 && req.Seconds != "" {
		if n, err := strconv.Atoi(req.Seconds); err == nil {
			d = n
		}
	}
	if md := req.Metadata; md != nil {
		if v, ok := md["duration"]; ok {
			d = toInt(v, d)
		}
	}
	if d <= 0 {
		d = 5 // Atlas 默认 5s；显式回传，避免上游擅自取更长时长
	}
	if d < 4 {
		d = 4
	}
	if d > 15 {
		d = 15
	}
	// Veo 仅接受 4/6/8 秒，吸附到最近合法值（否则上游报 invalid parameters）
	if strings.Contains(strings.ToLower(req.Model), "veo") {
		d = snapVeoDuration(d)
	}

	// ── 分辨率 ──
	resolution = resolutionFromSize(req.Size)
	if md := req.Metadata; md != nil {
		if v, ok := md["resolution"]; ok {
			if s, ok := v.(string); ok && s != "" {
				resolution = s
			}
		}
	}
	return d, resolution
}

// resolutionFromSize 把 OpenAI 风格的 size(如 1280x720) 映射成 Atlas 的 480p/720p/1080p
func resolutionFromSize(size string) string {
	s := strings.ToLower(size)
	switch {
	case strings.Contains(s, "1440"):
		return "1440p-SR"
	case strings.Contains(s, "1080") || strings.Contains(s, "1920"):
		return "1080p"
	case strings.Contains(s, "720") || strings.Contains(s, "1280"):
		return "720p"
	case strings.Contains(s, "480") || strings.Contains(s, "854"):
		return "480p"
	default:
		return "720p"
	}
}

// sizeFactor 分辨率计费系数。⚠️ 关键：Atlas 视频**只有 Seedance 按分辨率分档收费**，
// 可灵/万相/Vidu/Veo(非4k) 等都是**固定每秒价、不分辨率分档**。
// 故：
//   - Seedance：按真实 token 成本比分档，恒等于像素面积比(480p=1)。
//     2026-06-15 用 Atlas 实扣 total_tokens 反推(铁证)：
//       480p(720×480)=40594tok、720p(1280×720)=108900tok、1080p(1920×1080)=245025tok
//       → 比值 1 : 2.667 : 6.0 (= 面积比)，1440p(2560×1440)=10.667。
//       单价 fast=$7.616/Mtok、标准=$9.520/Mtok。
//     旧值 1/2.25/10/18 是错的(尤其 1080p 虚高 → 反向坑客户)，已按面积比修正。
//   - 其余家族：恒为 1.0（平价），ModelPrice 即每秒对客价，1080p=480p 同价。
// 这样杜绝了对平价家族高分辨率超额收费(旧 bug 会把可灵 1080p 多收 10 倍)。
func sizeFactor(model, resolution string) float64 {
	if !strings.Contains(strings.ToLower(model), "seedance") {
		return 1.0 // 平价家族：按秒固定，不随分辨率
	}
	r := strings.ToLower(resolution)
	switch {
	case strings.Contains(r, "1440"):
		return 10.667
	case strings.Contains(r, "1080"):
		return 6.0
	case strings.Contains(r, "720"):
		return 2.667
	case strings.Contains(r, "480"):
		return 1.0
	default:
		return 2.667
	}
}

// veoDurations Veo 仅接受 {4,6,8} 秒，把任意时长吸附到最近的合法值
func snapVeoDuration(d int) int {
	allowed := []int{4, 6, 8}
	best, bestDiff := 8, 1<<30
	for _, a := range allowed {
		diff := a - d
		if diff < 0 {
			diff = -diff
		}
		if diff < bestDiff {
			best, bestDiff = a, diff
		}
	}
	return best
}

// toInt 尽力把 metadata 里的数值（float64/json.Number/string）转成 int
func toInt(v any, def int) int {
	switch n := v.(type) {
	case float64:
		return int(n)
	case int:
		return n
	case json.Number:
		if i, err := n.Int64(); err == nil {
			return int(i)
		}
	case string:
		if i, err := strconv.Atoi(n); err == nil {
			return i
		}
	}
	return def
}

// ratioFromSize 从 size 推断画幅比例，无法判断时交给上游自适应
func (a *TaskAdaptor) ratioFromSize(size string) string {
	parts := strings.Split(strings.ToLower(size), "x")
	if len(parts) == 2 {
		w, e1 := strconv.Atoi(strings.TrimSpace(parts[0]))
		h, e2 := strconv.Atoi(strings.TrimSpace(parts[1]))
		if e1 == nil && e2 == nil && w > 0 && h > 0 {
			if w > h {
				return "16:9"
			} else if h > w {
				return "9:16"
			}
			return "1:1"
		}
	}
	return "adaptive"
}
