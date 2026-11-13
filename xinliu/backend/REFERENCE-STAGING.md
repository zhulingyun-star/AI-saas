# 参考视频临时暂存

当前 Ark 参考视频需要供应商可访问的 HTTPS URL；工作台不自动开放本地文件，也不自动上传到云存储。`work/stage-reference.cjs` 是操作者显式执行的临时 OSS 工具，不由 Web 服务加载。

将 `storage.env.example` 复制为本地 `storage.env`，填写已授权桶的凭据并设置文件权限0600。该文件及 `data/` 已被 Git/Docker 忽略；不要复制或提交其他项目的完整配置。工具仅显式加载这个凭据文件。

在用户授权素材发送、云暂存及单次模型生成后，从 `xinliu/` 运行：

```sh
node work/stage-reference.cjs upload backend/data/reference.mp4 backend/data/staged-reference.json
```

输入必须为16MB以内的MP4。每次上传使用独立随机路径 `xinliu-reference-tests/<uuid>/reference.mp4`，设置私有ACL和禁止覆盖，生成30分钟GET签名链接。元数据文件0600，记录摘要、过期时间及临时链接；标准输出不包含签名链接或凭据。

在工作台确认方案后的“准备出片素材与报价”中，仅在参考视频对应的HTTPS输入框使用元数据里的链接，商品图仍选本地授权素材。核对所有素材职责、时长、分辨率、声音与报价，再按用户授权提交一次。暂存成功不代表模型支持或生成成功；超时未知时只查原任务，不自动补发。签名链接需在提交前仍有效。

生成终止且不再需要输入后，清理本次暂存对象：

```sh
node work/stage-reference.cjs remove backend/data/staged-reference.json
```

清理只允许当前桶中上述临时路径，拒绝删除其他客户素材；删除后从本地元数据中移除签名链接。上传失败不自动重试，未知上传结果需人工核对，避免重复暂存。签名和HTTP请求不写入业务日志。

本次人工参考测试先在本地裁去人脸、字幕并去掉音轨，只向供应商发送处理片；原片在本地保留用于来源追溯。当前尚无工作台内自动裁切或云暂存界面。模型和存储实际费用需单独对账。
