# FreshLife 官网构建
# 仓库根目录 = 部署产物（GitHub → 阿里云静态托管）
PY ?= python3

.PHONY: build check serve clean

build:
	$(PY) scripts/build.py

check:
	$(PY) scripts/build.py --check-only

serve: build
	$(PY) -m http.server 8080

# 清空构建产物（site/ 源文件保留）；重新 make build 即可完整恢复
clean:
	rm -f index.html 404.html robots.txt sitemap.xml _headers BUILD_PROVENANCE.txt
	rm -f app-icon.png favicon.svg
	rm -rf assets privacy terms support safety
	@echo "已清理生成产物；运行 'make build' 重新生成。"
