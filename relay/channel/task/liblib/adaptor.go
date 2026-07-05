package liblib

import (
	"bytes"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha1"
	"encoding/base64"
	"encoding/hex"
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
// LiblibAI（哩布哩布）开放平台视频适配器 —— 可灵 Kling 系列
//
// 鉴权：AccessKey + SecretKey，HMAC-SHA1 签名走 query 参数
//   签名原文 = URI路径 + "&" + 毫秒时间戳 + "&" + 随机串
//   签名 = base64URLSafe(hmacSha1(原文, SecretKey))   // 无 padding
//   每次请求 query 固定带：AccessKey / Signature / Timestamp / SignatureNonce
//
// 流程：异步 —— 提交任务返回 generateUuid → 轮询 /api/generate/status
//
// 计费：上游按"积分"计费(100积分=¥1)，任务完成后 status 返回 pointsCost。
//   本适配器把 pointsCost 写入 TaskInfo.CompletionTokens，由 new-api 按
//   模型倍率(model_ratio)结算 —— 即"客户扣费 = pointsCost × 倍率"，
//   配置倍率即可镜像上游积分体系并加价(进 ¥0.01/积分，卖更高)。
// ============================================================================

const (
	pathText2Video     = "/api/generate/video/kling/text2video"
	pathImg2Video      = "/api/generate/video/kling/img2video"
	pathMultiImg2Video = "/api/generate/video/kling/multiImg2video"
	pathStatus         = "/api/generate/status"

	tmplText2Video     = "61cd8b60d340404394f2a545eeaf197a"
	tmplImg2Video      = "180f33c6748041b48593030156d2a71d"
	tmplMultiImg2Video = "ca01e798b4424587b0dfdb98b089da05"
)

// ============================
// Request / Response structures
// ============================

type generateParams struct {
	Model           string   `json:"model,omitempty"`
	Prompt          string   `json:"prompt"`
	PromptMagic     int      `json:"promptMagic,omitempty"`
	AspectRatio     string   `json:"aspectRatio,omitempty"`
	Duration        string   `json:"duration,omitempty"`
	Mode            string   `json:"mode,omitempty"`
	Sound           string   `json:"sound,omitempty"`
	StartFrame      string   `json:"startFrame,omitempty"`
	EndFrame        string   `json:"endFrame,omitempty"`
	ReferenceImages []string `json:"referenceImages,omitempty"`
}

type submitRequest struct {
	TemplateUuid   string         `json:"templateUuid"`
	GenerateParams generateParams `json:"generateParams"`
}

type submitResponse struct {
	Code int    `json:"code"`
	Msg  string `json:"msg"`
	Data struct {
		GenerateUuid string `json:"generateUuid"`
	} `json:"data"`
}

type statusResponse struct {
	Code int    `json:"code"`
	Msg  string `json:"msg"`
	Data struct {
		GenerateUuid   string `json:"generateUuid"`
		GenerateStatus int    `json:"generateStatus"`
		GenerateMsg    string `json:"generateMsg"`
		PointsCost     int    `json:"pointsCost"`
		AccountBalance int    `json:"accountBalance"`
		Videos         []struct {
			VideoUrl    string `json:"videoUrl"`
			CoverPath   string `json:"coverPath"`
			AuditStatus int    `json:"auditStatus"`
		} `json:"videos"`
	} `json:"data"`
}

// ============================
// Adaptor
// ============================

type TaskAdaptor struct {
	taskcommon.BaseBilling
	ChannelType int
	apiKey      string
	baseURL     string
	submitPath  string // 在 BuildRequestBody 阶段确定，供 BuildRequestURL 复用
}

func (a *TaskAdaptor) Init(info *relaycommon.RelayInfo) {
	a.ChannelType = info.ChannelType
	a.baseURL = strings.TrimRight(info.ChannelBaseUrl, "/")
	a.apiKey = info.ApiKey
	a.submitPath = pathText2Video // 默认文生视频，BuildRequestBody 会按图片数覆盖
}

func (a *TaskAdaptor) ValidateRequestAndSetAction(c *gin.Context, info *relaycommon.RelayInfo) (taskErr *dto.TaskError) {
	return relaycommon.ValidateBasicTaskRequest(c, info, constant.TaskActionGenerate)
}

func (a *TaskAdaptor) BuildRequestURL(info *relaycommon.RelayInfo) (string, error) {
	query, err := a.signQuery(a.submitPath)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%s%s?%s", a.baseURL, a.submitPath, query), nil
}

func (a *TaskAdaptor) BuildRequestHeader(c *gin.Context, req *http.Request, info *relaycommon.RelayInfo) error {
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	return nil
}

func (a *TaskAdaptor) BuildRequestBody(c *gin.Context, info *relaycommon.RelayInfo) (io.Reader, error) {
	v, exists := c.Get("task_request")
	if !exists {
		return nil, fmt.Errorf("request not found in context")
	}
	req := v.(relaycommon.TaskSubmitReq)

	model := taskcommon.DefaultString(info.UpstreamModelName, "kling-v2-1-master")

	// 收集参考图：优先 Images 列表，其次单张 Image
	images := req.Images
	if len(images) == 0 && req.Image != "" {
		images = []string{req.Image}
	}

	gp := generateParams{
		Model:       model,
		Prompt:      req.Prompt,
		PromptMagic: 1,
		AspectRatio: a.aspectRatioFromSize(req.Size),
		Duration:    a.normalizeDuration(req),
		Mode:        taskcommon.DefaultString(req.Mode, "std"),
	}

	var body submitRequest
	switch {
	case len(images) >= 2:
		// 多图参考：仅 kling-v1-6 支持
		a.submitPath = pathMultiImg2Video
		gp.Model = "kling-v1-6"
		gp.ReferenceImages = images
		body = submitRequest{TemplateUuid: tmplMultiImg2Video, GenerateParams: gp}
		c.Set("action", constant.TaskActionGenerate)
	case len(images) == 1:
		// 图生视频（首帧）
		a.submitPath = pathImg2Video
		gp.StartFrame = images[0]
		body = submitRequest{TemplateUuid: tmplImg2Video, GenerateParams: gp}
		c.Set("action", constant.TaskActionGenerate)
	default:
		// 文生视频
		a.submitPath = pathText2Video
		body = submitRequest{TemplateUuid: tmplText2Video, GenerateParams: gp}
		c.Set("action", constant.TaskActionTextGenerate)
	}

	// 允许客户端通过 metadata 覆盖 Kling 专有字段（sound/endFrame/aspectRatio/duration/mode/promptMagic）
	if err := taskcommon.UnmarshalMetadata(req.Metadata, &body.GenerateParams); err != nil {
		return nil, errors.Wrap(err, "unmarshal metadata failed")
	}

	data, err := common.Marshal(body)
	if err != nil {
		return nil, err
	}
	return bytes.NewReader(data), nil
}

func (a *TaskAdaptor) DoRequest(c *gin.Context, info *relaycommon.RelayInfo, requestBody io.Reader) (*http.Response, error) {
	if action := c.GetString("action"); action != "" {
		info.Action = action
	}
	return channel.DoTaskApiRequest(a, c, info, requestBody)
}

func (a *TaskAdaptor) DoResponse(c *gin.Context, resp *http.Response, info *relaycommon.RelayInfo) (taskID string, taskData []byte, taskErr *dto.TaskError) {
	responseBody, err := io.ReadAll(resp.Body)
	if err != nil {
		taskErr = service.TaskErrorWrapper(err, "read_response_body_failed", http.StatusInternalServerError)
		return
	}

	var sResp submitResponse
	if err = common.Unmarshal(responseBody, &sResp); err != nil {
		taskErr = service.TaskErrorWrapper(err, "unmarshal_response_failed", http.StatusInternalServerError)
		return
	}
	if sResp.Code != 0 {
		msg := sResp.Msg
		if msg == "" {
			msg = fmt.Sprintf("liblib error code %d", sResp.Code)
		}
		taskErr = service.TaskErrorWrapperLocal(fmt.Errorf("%s", msg), "task_failed", http.StatusBadRequest)
		return
	}
	if sResp.Data.GenerateUuid == "" {
		taskErr = service.TaskErrorWrapperLocal(fmt.Errorf("empty generateUuid"), "task_failed", http.StatusBadRequest)
		return
	}

	ov := dto.NewOpenAIVideo()
	ov.ID = info.PublicTaskID
	ov.TaskID = info.PublicTaskID
	ov.CreatedAt = time.Now().Unix()
	ov.Model = info.OriginModelName
	c.JSON(http.StatusOK, ov)
	return sResp.Data.GenerateUuid, responseBody, nil
}

// FetchTask 查询任务状态：统一 POST /api/generate/status
func (a *TaskAdaptor) FetchTask(baseUrl, key string, body map[string]any, proxy string) (*http.Response, error) {
	taskID, ok := body["task_id"].(string)
	if !ok || taskID == "" {
		return nil, fmt.Errorf("invalid task_id")
	}

	access, secret, err := parseKey(key)
	if err != nil {
		return nil, err
	}
	query, err := signQueryWith(access, secret, pathStatus)
	if err != nil {
		return nil, err
	}
	url := fmt.Sprintf("%s%s?%s", strings.TrimRight(baseUrl, "/"), pathStatus, query)

	payload, err := common.Marshal(map[string]string{"generateUuid": taskID})
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	client, err := service.GetHttpClientWithProxy(proxy)
	if err != nil {
		return nil, fmt.Errorf("new proxy http client failed: %w", err)
	}
	return client.Do(req)
}

func (a *TaskAdaptor) ParseTaskResult(respBody []byte) (*relaycommon.TaskInfo, error) {
	var sResp statusResponse
	if err := common.Unmarshal(respBody, &sResp); err != nil {
		return nil, errors.Wrap(err, "failed to unmarshal status response")
	}
	taskInfo := &relaycommon.TaskInfo{}
	taskInfo.Code = sResp.Code
	taskInfo.TaskID = sResp.Data.GenerateUuid
	taskInfo.Reason = sResp.Data.GenerateMsg

	// generateStatus: 1等待 2执行中 3已生成 4审核中 5成功 6失败 7超时
	switch sResp.Data.GenerateStatus {
	case 1:
		taskInfo.Status = model.TaskStatusSubmitted
	case 2, 3, 4:
		taskInfo.Status = model.TaskStatusInProgress
	case 5:
		taskInfo.Status = model.TaskStatusSuccess
		if vids := sResp.Data.Videos; len(vids) > 0 {
			taskInfo.Url = vids[0].VideoUrl
		}
		// 按 pointsCost 计费：写入 CompletionTokens，由模型倍率结算
		if pc := sResp.Data.PointsCost; pc > 0 {
			taskInfo.CompletionTokens = pc
			taskInfo.TotalTokens = pc
		}
	case 6, 7:
		taskInfo.Status = model.TaskStatusFailure
	default:
		return nil, fmt.Errorf("unknown generateStatus: %d", sResp.Data.GenerateStatus)
	}
	return taskInfo, nil
}

func (a *TaskAdaptor) GetModelList() []string {
	return []string{
		"kling-v1-6",
		"kling-v2-master",
		"kling-v2-1",
		"kling-v2-1-master",
		"kling-v2-5-turbo",
		"kling-v2-6",
	}
}

func (a *TaskAdaptor) GetChannelName() string {
	return "liblib"
}

func (a *TaskAdaptor) ConvertToOpenAIVideo(originTask *model.Task) ([]byte, error) {
	var sResp statusResponse
	if err := common.Unmarshal(originTask.Data, &sResp); err != nil {
		// 提交阶段存的可能是 submitResponse，缺字段不致命
		_ = err
	}
	ov := dto.NewOpenAIVideo()
	ov.ID = originTask.TaskID
	ov.Status = originTask.Status.ToVideoStatus()
	ov.SetProgressStr(originTask.Progress)
	if len(sResp.Data.Videos) > 0 && sResp.Data.Videos[0].VideoUrl != "" {
		ov.SetMetadata("url", sResp.Data.Videos[0].VideoUrl)
	}
	if sResp.Code != 0 && sResp.Msg != "" {
		ov.Error = &dto.OpenAIVideoError{Message: sResp.Msg, Code: fmt.Sprintf("%d", sResp.Code)}
	}
	return common.Marshal(ov)
}

// ============================
// helpers
// ============================

func (a *TaskAdaptor) signQuery(uri string) (string, error) {
	access, secret, err := parseKey(a.apiKey)
	if err != nil {
		return "", err
	}
	return signQueryWith(access, secret, uri)
}

// signQueryWith 生成 LiblibAI 鉴权 query 串
func signQueryWith(accessKey, secretKey, uri string) (string, error) {
	if accessKey == "" || secretKey == "" {
		return "", errors.New("invalid liblib key, required format is accessKey|secretKey")
	}
	timestamp := strconv.FormatInt(time.Now().UnixMilli(), 10)
	nonce := randomNonce()
	content := uri + "&" + timestamp + "&" + nonce

	mac := hmac.New(sha1.New, []byte(secretKey))
	mac.Write([]byte(content))
	signature := base64.RawURLEncoding.EncodeToString(mac.Sum(nil)) // url-safe, 无 padding

	return fmt.Sprintf("AccessKey=%s&Signature=%s&Timestamp=%s&SignatureNonce=%s",
		accessKey, signature, timestamp, nonce), nil
}

func parseKey(apiKey string) (accessKey, secretKey string, err error) {
	parts := strings.SplitN(apiKey, "|", 2)
	if len(parts) != 2 {
		return "", "", errors.New("invalid liblib key, required format is accessKey|secretKey")
	}
	return strings.TrimSpace(parts[0]), strings.TrimSpace(parts[1]), nil
}

func randomNonce() string {
	b := make([]byte, 8)
	if _, err := rand.Read(b); err != nil {
		// 退化：用时间戳兜底，极低概率
		return strconv.FormatInt(time.Now().UnixNano(), 16)
	}
	return hex.EncodeToString(b)
}

func (a *TaskAdaptor) aspectRatioFromSize(size string) string {
	switch size {
	case "1024x1024", "512x512":
		return "1:1"
	case "1280x720", "1920x1080", "1664x936":
		return "16:9"
	case "720x1280", "1080x1920", "936x1664":
		return "9:16"
	default:
		return "16:9"
	}
}

// normalizeDuration 可灵仅支持 5s / 10s
func (a *TaskAdaptor) normalizeDuration(req relaycommon.TaskSubmitReq) string {
	d := req.Duration
	if d == 0 && req.Seconds != "" {
		if n, err := strconv.Atoi(req.Seconds); err == nil {
			d = n
		}
	}
	if d >= 10 {
		return "10"
	}
	return "5"
}
