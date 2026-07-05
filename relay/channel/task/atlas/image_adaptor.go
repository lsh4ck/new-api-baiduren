package atlas

import (
	"bytes"
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
// Atlas Cloud 图像生成适配器（与视频同构，复用本包的 atlasEnvelope/atlasData）
//
// 提交  POST {base}/api/v1/model/generateImage  → data.id（request_id）
// 轮询  GET  {base}/api/v1/model/prediction/{request_id}（与视频共用）
//
// 计费：图像 **不返 token**，按「张」自算（loss-proof）。每个图像模型在 new-api 里
//   配「按次价格」= 该模型对客单张价（已含毛利）；EstimateBilling 返回 count=张数，
//   框架 quota = ModelPrice × QuotaPerUnit × groupRatio × count。
//   图像组 GR=1.0，故对客实付 = ModelPrice = max(官网×0.9, Atlas成本÷0.7)，每张稳赚≥30%。
//
// 复用视频 task 提交/轮询路由（/v1/video/generations），前端图像广场无感。
// 输出 url 在 atlas OSS → 经 maskVideoResultURL/VideoProxy 走本站域名，隐藏上游品牌。
// ============================================================================

const pathGenerateImage = "/api/v1/model/generateImage"

type generateImageRequest struct {
	Model          string `json:"model"`
	Prompt         string `json:"prompt"`
	Size           string `json:"size,omitempty"`
	AspectRatio    string `json:"aspect_ratio,omitempty"`
	N              int    `json:"n,omitempty"`
	Seed           *int   `json:"seed,omitempty"`
	NegativePrompt string `json:"negative_prompt,omitempty"`
	Image          string `json:"image,omitempty"` // 图生图 / 编辑的输入图
}

// ImageTaskAdaptor —— Atlas 图像渠道（type 60）。结构与视频 TaskAdaptor 平行。
type ImageTaskAdaptor struct {
	taskcommon.BaseBilling
	ChannelType int
	apiKey      string
	baseURL     string
}

func (a *ImageTaskAdaptor) Init(info *relaycommon.RelayInfo) {
	a.ChannelType = info.ChannelType
	a.baseURL = strings.TrimRight(info.ChannelBaseUrl, "/")
	if a.baseURL == "" {
		a.baseURL = "https://api.atlascloud.ai"
	}
	a.apiKey = info.ApiKey
}

func (a *ImageTaskAdaptor) ValidateRequestAndSetAction(c *gin.Context, info *relaycommon.RelayInfo) (taskErr *dto.TaskError) {
	return relaycommon.ValidateBasicTaskRequest(c, info, constant.TaskActionGenerate)
}

// EstimateBilling 按「张」预扣费：quota = ModelPrice × QuotaPerUnit × GR × count。
// 不依赖上游 token（图像根本不返），故按客户请求的张数锁价。
func (a *ImageTaskAdaptor) EstimateBilling(c *gin.Context, info *relaycommon.RelayInfo) map[string]float64 {
	req, err := relaycommon.GetTaskRequest(c)
	if err != nil {
		return nil
	}
	count := a.resolveCount(req)
	return map[string]float64{"count": float64(count)}
}

func (a *ImageTaskAdaptor) BuildRequestURL(info *relaycommon.RelayInfo) (string, error) {
	return a.baseURL + pathGenerateImage, nil
}

func (a *ImageTaskAdaptor) BuildRequestHeader(c *gin.Context, req *http.Request, info *relaycommon.RelayInfo) error {
	req.Header.Set("Authorization", "Bearer "+a.apiKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	return nil
}

func (a *ImageTaskAdaptor) BuildRequestBody(c *gin.Context, info *relaycommon.RelayInfo) (io.Reader, error) {
	req, err := relaycommon.GetTaskRequest(c)
	if err != nil {
		return nil, err
	}

	modelName := taskcommon.DefaultString(info.UpstreamModelName, req.Model)

	// 输入图：图生图/编辑模型用，优先 Images 首张，其次单张 Image
	image := req.Image
	if image == "" && len(req.Images) > 0 {
		image = req.Images[0]
	}

	count := a.resolveCount(req)

	body := generateImageRequest{
		Model:       modelName,
		Prompt:      req.Prompt,
		Size:        req.Size,
		AspectRatio: a.ratioFromSize(req.Size),
		N:           count,
		Image:       image,
	}

	// 客户端可通过 metadata 覆盖上游字段（aspect_ratio / negative_prompt / seed / size 等）
	if err := taskcommon.UnmarshalMetadata(req.Metadata, &body); err != nil {
		return nil, errors.Wrap(err, "unmarshal metadata failed")
	}

	// 锁回张数，防止 metadata 偷偷加 n 却按低价计费
	body.N = count

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

func (a *ImageTaskAdaptor) DoRequest(c *gin.Context, info *relaycommon.RelayInfo, requestBody io.Reader) (*http.Response, error) {
	return channel.DoTaskApiRequest(a, c, info, requestBody)
}

func (a *ImageTaskAdaptor) DoResponse(c *gin.Context, resp *http.Response, info *relaycommon.RelayInfo) (taskID string, taskData []byte, taskErr *dto.TaskError) {
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
			msg = "atlas image submit failed: " + string(responseBody)
		}
		taskErr = service.TaskErrorWrapperLocal(fmt.Errorf("%s", msg), "task_failed", http.StatusBadRequest)
		return
	}

	// 返回通用提交回执（task_id + 排队状态），前端据此轮询
	c.JSON(http.StatusOK, gin.H{
		"id":         info.PublicTaskID,
		"task_id":    info.PublicTaskID,
		"object":     "image.generation",
		"model":      info.OriginModelName,
		"status":     "queued",
		"created_at": time.Now().Unix(),
	})
	return d.ID, responseBody, nil
}

// FetchTask 复用与视频相同的 prediction 轮询端点
func (a *ImageTaskAdaptor) FetchTask(baseUrl, key string, body map[string]any, proxy string) (*http.Response, error) {
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

func (a *ImageTaskAdaptor) ParseTaskResult(respBody []byte) (*relaycommon.TaskInfo, error) {
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

func (a *ImageTaskAdaptor) GetModelList() []string {
	return []string{
		// Seedream（字节）
		"bytedance/seedream-v5.0-lite", "bytedance/seedream-v5.0-lite/edit",
		"bytedance/seedream-v5.0-lite/sequential", "bytedance/seedream-v5.0-lite/edit-sequential",
		"bytedance/seedream-v4.5", "bytedance/seedream-v4.5/edit",
		"bytedance/seedream-v4.5/sequential", "bytedance/seedream-v4.5/edit-sequential",
		"bytedance/seedream-v4", "bytedance/seedream-v4/edit",
		"bytedance/seedream-v4/sequential", "bytedance/seedream-v4/edit-sequential",
		// FLUX（Black Forest Labs）
		"black-forest-labs/flux-schnell", "black-forest-labs/flux-dev", "black-forest-labs/flux-dev-lora",
		"black-forest-labs/flux-kontext-dev", "black-forest-labs/flux-kontext-dev-lora",
		"black-forest-labs/flux-2-pro/text-to-image", "black-forest-labs/flux-2-pro/edit",
		"black-forest-labs/flux-2-flex/text-to-image", "black-forest-labs/flux-2-flex/edit",
		// GPT Image（OpenAI）
		"openai/gpt-image-2/text-to-image", "openai/gpt-image-2/edit",
		"openai/gpt-image-1.5/text-to-image", "openai/gpt-image-1.5/edit",
		"openai/gpt-image-1/text-to-image", "openai/gpt-image-1/edit",
		"openai/gpt-image-1-mini/text-to-image", "openai/gpt-image-1-mini/edit",
		// Imagen（Google）
		"google/imagen4", "google/imagen4-fast", "google/imagen4-ultra",
		"google/imagen3", "google/imagen3-fast",
		// Nano-Banana（Google Gemini 图像）
		"google/nano-banana/text-to-image", "google/nano-banana/edit",
		"google/nano-banana-pro/text-to-image", "google/nano-banana-pro/edit",
		"google/nano-banana-pro/text-to-image-ultra", "google/nano-banana-pro/edit-ultra",
		"google/nano-banana-2/text-to-image", "google/nano-banana-2/edit",
		"google/nano-banana-2/reference-to-image", "google/nano-banana-2/reference-to-image-developer",
		// Qwen-Image（阿里）
		"qwen/qwen-image-2.0/text-to-image", "qwen/qwen-image-2.0/edit",
		"qwen/qwen-image-2.0-pro/text-to-image", "qwen/qwen-image-2.0-pro/edit",
		"alibaba/qwen-image/text-to-image-max", "alibaba/qwen-image/text-to-image-plus",
		"alibaba/qwen-image/edit", "alibaba/qwen-image/edit-plus", "alibaba/qwen-image/edit-plus-20251215",
		"atlascloud/qwen-image/text-to-image", "atlascloud/qwen-image/edit",
		// Wan 图像（阿里）
		"alibaba/wan-2.7/text-to-image", "alibaba/wan-2.7/image-edit",
		"alibaba/wan-2.7-pro/text-to-image", "alibaba/wan-2.7-pro/image-edit",
		"alibaba/wan-2.6/text-to-image", "alibaba/wan-2.6/image-edit",
		"alibaba/wan-2.5/text-to-image", "alibaba/wan-2.5/image-edit",
		// Grok Imagine 图像（xAI）
		"xai/grok-imagine-image-quality/text-to-image", "xai/grok-imagine-image-quality/edit",
		// 其他
		"baidu/ERNIE-Image-Turbo/text-to-image",
		"z-image/turbo",
	}
}

func (a *ImageTaskAdaptor) GetChannelName() string {
	return "atlas-image"
}

// ConvertToOpenAIVideo —— 接口要求实现；图像不走 /v1/videos OpenAI 视频格式，
// 仅在被调用时返回带（代理化）url 的最小结构，避免泄露上游直链。
func (a *ImageTaskAdaptor) ConvertToOpenAIVideo(originTask *model.Task) ([]byte, error) {
	ov := dto.NewOpenAIVideo()
	ov.ID = originTask.TaskID
	ov.Status = originTask.Status.ToVideoStatus()
	ov.SetProgressStr(originTask.Progress)
	if originTask.Status == model.TaskStatusSuccess {
		ov.SetMetadata("url", taskcommon.BuildProxyURL(originTask.TaskID))
	}
	return common.Marshal(ov)
}

// resolveCount 解析张数：metadata.n > 默认 1，夹在 1..8
func (a *ImageTaskAdaptor) resolveCount(req relaycommon.TaskSubmitReq) int {
	n := 1
	if md := req.Metadata; md != nil {
		if v, ok := md["n"]; ok {
			n = toInt(v, n)
		}
	}
	if n <= 0 {
		n = 1
	}
	if n > 8 {
		n = 8
	}
	return n
}

// ratioFromSize 从 size(如 1024x1024 / 1280x720) 推断画幅比例；无法判断交给上游自适应
func (a *ImageTaskAdaptor) ratioFromSize(size string) string {
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
	return ""
}
