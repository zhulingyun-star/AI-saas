# 非容器部署

当前入口：http://121.40.164.221:58271/#login 。账号为原admin，密码保持不变。2026-11-25发布版本96c683fca871，用户级systemd服务lightshadow-cloud已启动。

需要放行入站TCP58271用于网站，TCP22用于SSH维护；本次没有更改Nginx、80/443或同机其他服务。服务器内部健康及管理员检查通过，但从部署电脑访问公网58271连接超时，需要核对云安全组或主机防火墙放行。当前入口仍为HTTP。

代码位于~/apps/lightshadow-cloud/current，持久化数据在shared/data，管理员与数据库凭据继续由shared/auth.env、shared/database.env加载。SilvaMux Key单独存放shared/silvamux.private.cjs，0600权限，并链接到当前版本backend/silvamux.private.cjs。URL与模型在代码内置，真实Key不进Git、发布包、前端或任务快照。不要上传整个本地env或复制其他供应商凭据。

发布包使用package-release.py白名单，排除私有模块、示例配置、数据、AGENTS、截图和依赖；所有运行文件有SHA-256清单。发布时先停服备份H2和媒体，再解压到新的releases版本目录，核验摘要，链接私有模块、切换current和service、daemon-reload并启动。保留shared/runtime.env的端口和访问源，勿覆盖auth.env或database.env。

公网绑定要求XINLIU_PUBLIC_ORIGIN明确指定访问源，自动强制服务器管理员登录；不允许演示登录获取公网会话。仅本机且未配置公网访问源时保留原开发演示模式。公开模式已验证错误会话/免密码bootstrap拒绝、CSRF、退出撤销、私有文件不可直接读取；新UI保留，不代表生产多租户鉴权。

当前SilvaMux业务估价仍空，未知估价会拦截收费提交。pricing.text/vision是每次业务估价；视频各模式按输出秒配置，修改私有模块后重启。真实供应商费用人工核对，不把tokens直接当金额。此次部署没有新增付费调用。

备份shared/backups/release-20261125T102107Z包含停服后H2、媒体和旧service；旧代码版本45fed77fcb8d保留。部署后2条任务、22媒体文件及workspace-import.json与基线一致，原成片Range读取206，原管理员登录成功，未登录API401。故障回退时切换旧current与service并daemon-reload；shared/data和凭据应保留，不能直接删除。

本轮验证：10项后端测试、video-learning/generation-ui/team-features三组浏览器模拟回归，以及公开模式真实浏览器登录/刷新会话测试通过。发布首轮因遗留LOCAL_ONLY检查失败已回退，修复后新增真实0.0.0.0绑定测试并部署成功。
