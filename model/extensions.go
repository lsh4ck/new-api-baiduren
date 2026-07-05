package model

import "gorm.io/gorm"

// 通用扩展注册点：供可选/独立编译的扩展模块（build tag 控制）在 init() 中注册自己的表迁移，
// 而不必修改核心迁移清单。不带对应 build tag 编译时，注册列表为空，核心行为不变。
var extraMigrations []func(db *gorm.DB) error

// RegisterMigration 注册一个扩展表迁移，会在核心迁移之后执行。
func RegisterMigration(fn func(db *gorm.DB) error) {
	extraMigrations = append(extraMigrations, fn)
}

func runExtraMigrations(db *gorm.DB) error {
	for _, fn := range extraMigrations {
		if err := fn(db); err != nil {
			return err
		}
	}
	return nil
}
