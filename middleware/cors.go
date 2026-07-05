package middleware

import (
	"os"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

func CORS() gin.HandlerFunc {
	config := cors.DefaultConfig()
	// AllowAllOrigins=true sends "Access-Control-Allow-Origin: *" which the CORS
	// spec forbids when AllowCredentials=true (browsers reject the response).
	// AllowOriginFunc echoes the specific request Origin, which is spec-compliant.
	// Set CORS_ALLOWED_ORIGINS=https://your-domain.com to restrict in production.
	if allowed := os.Getenv("CORS_ALLOWED_ORIGINS"); allowed != "" {
		origins := strings.Split(allowed, ",")
		trimmed := make([]string, 0, len(origins))
		for _, o := range origins {
			if o = strings.TrimSpace(o); o != "" {
				trimmed = append(trimmed, o)
			}
		}
		config.AllowOrigins = trimmed
	} else {
		config.AllowOriginFunc = func(origin string) bool { return true }
	}
	config.AllowCredentials = true
	config.AllowMethods = []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"}
	config.AllowHeaders = []string{"*"}
	return cors.New(config)
}

func PoweredBy() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("X-New-Api-Version", common.Version)
		c.Next()
	}
}
