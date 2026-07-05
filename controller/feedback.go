package controller

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

type feedbackReq struct {
	Subject string `json:"subject"`
	Message string `json:"message"`
	Contact string `json:"contact"`
}

// SubmitFeedback POST /api/user/feedback
// 已登录用户提交反馈 → 发邮件到管理员邮箱
func SubmitFeedback(c *gin.Context) {
	userId := c.GetInt("id")
	if userId == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "message": "请先登录"})
		return
	}
	var req feedbackReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "参数无效"})
		return
	}
	subject := strings.TrimSpace(req.Subject)
	message := strings.TrimSpace(req.Message)
	contact := strings.TrimSpace(req.Contact)
	if subject == "" || len(subject) > 200 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "标题不能为空且 ≤ 200 字"})
		return
	}
	if message == "" || len(message) > 5000 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "正文不能为空且 ≤ 5000 字"})
		return
	}

	user, err := model.GetUserById(userId, true)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "用户信息异常"})
		return
	}

	// 拼邮件正文
	body := fmt.Sprintf(`<p><b>用户反馈</b></p>
<table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse;border-color:#ccc;">
<tr><td>用户 ID</td><td>%d</td></tr>
<tr><td>用户名</td><td>%s</td></tr>
<tr><td>注册邮箱</td><td>%s</td></tr>
<tr><td>当前 IP</td><td>%s</td></tr>
<tr><td>客户端 UA</td><td>%s</td></tr>
<tr><td>提交时间</td><td>%s</td></tr>
<tr><td>反馈联系方式</td><td>%s</td></tr>
<tr><td>主题</td><td><b>%s</b></td></tr>
</table>
<hr>
<p><b>正文：</b></p>
<pre style="white-space:pre-wrap;font-family:inherit;">%s</pre>
<hr>
<p style="color:#888;font-size:12px;">本邮件由转转接口自动发出，请直接回复用户 %s 联系。</p>`,
		userId, user.Username, user.Email,
		c.ClientIP(), c.GetHeader("User-Agent"),
		time.Now().Format("2006-01-02 15:04:05"),
		contact, subject, message,
		user.Email,
	)

	// 发邮件给管理员（用 SMTP 配置里的 from 邮箱作收件人，或 RootUserEmail）
	adminEmail := common.OptionMap["RootUserEmail"]
	if adminEmail == "" {
		adminEmail = common.OptionMap["SMTPFrom"]
	}
	if adminEmail == "" {
		// 兜底
		adminEmail = "support@zhuanzhuan.pw"
	}

	mailSubject := fmt.Sprintf("[转转接口·用户反馈] %s", subject)
	if err := common.SendEmail(mailSubject, adminEmail, body); err != nil {
		common.SysLog(fmt.Sprintf("反馈邮件发送失败 user_id=%d: %v", userId, err))
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "邮件发送失败，请稍后重试"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "message": "反馈已提交，我们会尽快回复"})
}
