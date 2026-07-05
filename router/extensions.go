package router

import "github.com/gin-gonic/gin"

// 通用路由扩展注册点：供可选/独立编译的扩展模块（build tag 控制）在 init() 中注册自己的路由，
// 而不必修改核心路由文件。不带对应 build tag 编译时，注册列表为空，核心路由不变。
var apiRouterExtensions []func(apiRouter *gin.RouterGroup)

// RegisterApiRouterExtension 注册一个扩展路由装配函数，会在核心 API 路由装配完成后执行。
func RegisterApiRouterExtension(fn func(apiRouter *gin.RouterGroup)) {
	apiRouterExtensions = append(apiRouterExtensions, fn)
}

func applyApiRouterExtensions(apiRouter *gin.RouterGroup) {
	for _, fn := range apiRouterExtensions {
		fn(apiRouter)
	}
}
