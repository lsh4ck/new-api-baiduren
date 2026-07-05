package controller

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
)

type initialSetupRequest struct {
	Username         string `json:"username"`
	Email            string `json:"email"`
	VerificationCode string `json:"verification_code"`
	Password         string `json:"password"`
}

// InitialProfileSetup 用户首次登录后补完资料（用户名/邮箱/密码）。
// 根据当前用户实际状态判断需要补哪些：缺啥才校验和保存哪个字段。
// 路由：POST /api/user/self/initial-setup（需 UserAuth）
func InitialProfileSetup(c *gin.Context) {
	userId := c.GetInt("id")
	if userId == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "message": "未登录"})
		return
	}

	var req initialSetupRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "无效请求"})
		return
	}

	req.Username = strings.TrimSpace(req.Username)
	req.Email = strings.TrimSpace(strings.ToLower(req.Email))
	req.Password = strings.TrimSpace(req.Password)

	// 取当前用户
	user, err := model.GetUserById(userId, true)
	if err != nil || user == nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "用户不存在"})
		return
	}

	missingEmail := user.Email == ""
	missingPassword := user.Password == ""

	// 没缺东西，无需补完
	if !missingEmail && !missingPassword {
		c.JSON(http.StatusOK, gin.H{"success": true, "message": "资料已完整"})
		return
	}

	// 用户名按需校验：仅在用户名自动生成（wechat_/github_/discord_ 前缀）时强制要求改
	autogenUsername := looksAutogenUsername(user.Username)
	if autogenUsername {
		if req.Username == "" || len(req.Username) > 30 {
			c.JSON(http.StatusOK, gin.H{"success": false, "message": "用户名长度需在 1-30"})
			return
		}
	} else {
		// 非自动生成用户名，request.Username 可不填，保持原值
		if req.Username == "" {
			req.Username = user.Username
		}
	}

	// === 邮箱补完：仅当 email 缺失时校验 ===
	if missingEmail {
		if err := common.Validate.Var(req.Email, "required,email"); err != nil {
			c.JSON(http.StatusOK, gin.H{"success": false, "message": "无效的邮箱地址"})
			return
		}
		// 邮箱验证码校验
		if req.VerificationCode == "" {
			common.ApiErrorI18n(c, i18n.MsgUserEmailVerificationRequired)
			return
		}
		if !common.VerifyCodeWithKey(req.Email, req.VerificationCode, common.EmailVerificationPurpose) {
			common.ApiErrorI18n(c, i18n.MsgUserVerificationCodeError)
			return
		}
		// 邮箱冲突（排除自己，且排除软删用户）
		var existing model.User
		if err := model.DB.Where("email = ? AND id != ?", req.Email, user.Id).First(&existing).Error; err == nil && existing.Id != 0 {
			c.JSON(http.StatusOK, gin.H{
				"success": false,
				"message": "该邮箱已被账号 \"" + existing.Username + "\" (ID: " + strconv.Itoa(existing.Id) + ") 注册，请换一个邮箱或联系管理员合并",
			})
			return
		}
	}

	// === 密码补完：仅当 password 缺失时校验 ===
	if missingPassword {
		if len(req.Password) < 6 || len(req.Password) > 32 {
			c.JSON(http.StatusOK, gin.H{"success": false, "message": "密码长度需在 6-32"})
			return
		}
	}

	// 用户名冲突校验
	if req.Username != user.Username {
		exist, perr := model.CheckUserExistOrDeleted(req.Username, "")
		if perr != nil {
			common.ApiErrorI18n(c, i18n.MsgDatabaseError)
			return
		}
		if exist {
			c.JSON(http.StatusOK, gin.H{"success": false, "message": "用户名已被占用"})
			return
		}
	}

	// 应用变更
	user.Username = req.Username
	if missingEmail {
		user.Email = req.Email
	}
	if missingPassword {
		user.Password = req.Password
	}

	// 仅当密码字段被修改时让 Update hash 它
	if err := user.Update(missingPassword); err != nil {
		common.ApiError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "资料补完成功",
	})
}

func looksAutogenUsername(u string) bool {
	for _, p := range []string{"wechat_", "github_", "discord_", "oidc_", "linuxdo_"} {
		if strings.HasPrefix(u, p) {
			return true
		}
	}
	return false
}
