# CivicGuard：让其他电脑打开并使用

网站代码包含首页、注册登录、邮箱验证、找回密码、个人草稿和账户设置。
要让别人通过网址使用，需要把它部署到公网服务器；运行 `python app.py`
只会启动本机开发版本，不等于已经上线。网站提供山火模拟演练，不发送公众警报。

## 先发布代码，再部署

本次自动推送被 GitHub 连接拒绝（403，无写入权限），尚未创建发布分支或公网网址。
完整改动在本机项目中，另附 `release/civicguard-website.zip` 源码包。

先用 GitHub Desktop 打开本项目，在当前 `codex/reliable-simulation` 分支选择本次
网站代码、模板、测试和部署文件，提交后 **Push origin / Publish branch**。
不要把本机凭据、数据库或其他个人文件一起提交。也可以将源码包解压成一个独立
项目，通过 GitHub Desktop 创建并发布新仓库，保持目录结构。

1. 打开 [Render 控制台](https://dashboard.render.com)，登录并连接 GitHub，选择 **New → Blueprint**，选择刚才发布的仓库和分支。
2. 准备一个邮件服务的 SMTP 设置，并在它的后台完成发件地址验证。
3. Render 会读取 `render.yaml`。填入下表的四项邮件设置。
4. 检查网站和数据库两个服务的费用预估，再决定是否创建。配置使用付费资源。
5. 等待构建、数据库升级、启动和健康检查完成，状态显示 **Live**。
6. 复制网站服务页面显示的实际 `https://…onrender.com` 网址，在另一台电脑打开。

不需要先买域名。这里无法代填你的托管账户付款信息或邮件服务密钥。
把密钥填在平台的环境变量页面，不要写入仓库或聊天消息。

| 需要填写 | 从哪里取得 |
| --- | --- |
| `MAIL_FROM` | 邮件服务已验证的发件地址，例如 `CivicGuard <hello@你的域名>` |
| `SMTP_HOST` | 邮件服务提供的 SMTP 主机名 |
| `SMTP_USERNAME` | SMTP 用户名，可能与网站登录邮箱不同 |
| `SMTP_PASSWORD` | SMTP 专用密码或服务密钥 |

默认端口为 `587`，加密方式为 `starttls`。若服务要求 `465`，同时改为
`SMTP_PORT=465` 和 `SMTP_SECURITY=ssl`。发件服务必须允许向真实收件人发送，
只有沙盒收件人权限的账号不能开放注册。先用你自己的邮箱测试收信和垃圾邮件箱。

## 已经配置好的部分

| 部分 | 配置 |
| --- | --- |
| 网站运行 | Python 3.13 + Gunicorn，多进程监听平台分配的端口 |
| 安装依赖 | `pip install -r requirements-production.txt` |
| 数据库升级 | `flask --app app db upgrade` |
| 启动命令 | `gunicorn --config gunicorn.conf.py wsgi:app` |
| 健康检查 | `/healthz` |
| 账号、草稿、会话和限流 | 同一个持久化 PostgreSQL 数据库 |
| 登录密钥 | Render 自动生成 `SECRET_KEY` |
| 生产环境 | `APP_ENV=production`，HTTPS Cookie，CSRF，限流，邮箱验证 |
| 邮件内的网址 | 自动使用平台的 `RENDER_EXTERNAL_HOSTNAME` |
| 自动更新 | 关闭；测试通过后手动部署 |

不要将本机 `.env` 整个复制到 Render，它含有本地地址和邮件预览设置。
无需 Redis；无需 Anthropic key 即可使用账号、地图和草稿。

## 上线后实际验收

1. 用真实邮箱注册，收到验证邮件并确认，进入工作区。
2. 保存一份中英文草稿，关闭浏览器。
3. 在另一台电脑打开同一个公网网址，登录同一账号，打开原草稿并修改。
4. 创建第二个账号，确认它看不到第一个账号的草稿。
5. 使用 **Forgot password** 收到重置邮件；重置后旧密码和其他设备会话应失效。
6. 在 **Account** 下载数据，确认导出可读；用测试账号验证删除流程。
7. 用手机打开首页、注册和工作区，检查页面及按钮。

草稿需要点击保存。多台设备同时编辑时，旧版本会提示冲突，可点击 **Save as new**
保留副本。本机和线上是两份数据库，本机测试账号不会自动迁移到线上。

## 本机运行

```sh
cd /Users/zhixuan/CivicGuard
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
cp -n .env.example .env
python app.py
```

打开 <http://127.0.0.1:5000>。如果已有 `.env`，保留原文件并补齐缺失变量。
注册后点击 **Open email preview → Open account link → Verify email**。
本地预览不会发真实邮件，且在线上禁用。本地密钥自动生成并保留。
端口被占用时，将 `.env` 的 `PUBLIC_BASE_URL` 改为 `http://127.0.0.1:5050`，
再执行 `PORT=5050 python app.py`。不要直接双击 HTML 文件运行网站。

## 测试与更新

```sh
source .venv/bin/activate
python -m unittest discover -s tests -p 'test_*.py' -v
npm ci
npm test
npx playwright install chromium
PYTHON="$PWD/.venv/bin/python" npm run test:browser
```

GitHub Actions 还会启动一次性 PostgreSQL，检查多进程共享限流、跨设备读取和并发
修改，再执行浏览器测试。测试不会发真实邮件或调用 AI。查看对应提交的绿色检查。
本次本机已通过 38 项后端和 35 项 JavaScript 单元测试。两项 PostgreSQL 测试需
CI 数据库，本机跳过。浏览器测试受当前运行环境限制尚未执行，需推送后确认 CI 结果。

后续更新：推送发布分支 → 等待检查通过 → Render 的 **Manual Deploy**。
更新数据库结构前建立数据库备份；升级脚本保留旧数据，不要删表重建。
部署后再次检查注册、保存和找回密码。生产环境定期运行：

```sh
flask --app app db prune
```

这只清理已过期的登录会话、邮件令牌和限流窗口，不删除用户或草稿。

## 常见故障

| 现象 | 检查 |
| --- | --- |
| 网站构建失败 | Build 命令是否使用 `requirements-production.txt` |
| 启动提示生产配置缺失 | 环境变量、SMTP、数据库连接是否齐全；不要改成 development 绕过 |
| 注册后收不到邮件 | 发件地址是否验证、SMTP 凭据/端口/TLS、垃圾邮件箱；可重新发送 |
| 邮件链接打不开 | `PUBLIC_BASE_URL` 是否误填本机地址；默认应使用 Render 提供的地址 |
| 数据库故障返回 503 | PostgreSQL 状态、连接变量、数据库升级日志 |
| 登录表单过期 | 刷新当前页面后重新提交 |
| 草稿保存提示冲突 | 打开服务器最新版或选择 Save as new 保留当前编辑 |
| 地图显示 Sample | 外部数据源暂不可用，已回退到标明的示例；不是实时信息 |

## 自定义域名

先在 Render 添加并完成域名验证、DNS 和 HTTPS，再设置：

```text
PUBLIC_BASE_URL=https://你的域名
TRUSTED_HOSTS=你的域名,实际服务名.onrender.com
```

重新部署并重新申请验证邮件。HTTPS Cookie 不应被关闭。其他平台也可部署，
但需提供 PostgreSQL、TLS SMTP、HTTPS，以及正确的受信代理配置。

官方说明：[Flask 部署](https://render.com/docs/deploy-flask)、
[部署入口](https://render.com/docs/deploy-to-render)、
[Blueprint](https://render.com/docs/blueprint-spec)。
