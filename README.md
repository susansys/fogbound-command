# 玄枢行动 · Fogbound Command

一款正在开发的中文单人指挥参谋游戏。玩家坐在总部，通过收到的报告、任务回报和角色回复判断局势、安排工作，并在行动结束后回看自己的决定。

游戏想呈现的难点是：信息有来源、有时点，也可能过期或互相矛盾；命令发出后需要等待送达、接受、执行和回报；角色、装备与工作容量有限。玩家需要在继续核实、及时行动和保留资源之间作选择。这里的地图、角色、行动规则与数值均为虚构娱乐设计，不代表现实军事训练或行动效力。

## 现在能玩到什么

目前仓库提供三个可运行的工程演练，用来验证游戏的基础流程：

| 演练 | 可体验的内容 | 开发状态 |
| --- | --- | --- |
| 走廊通行 | 向联络组下达一次移动任务，依据延迟收到的位置及抵达回报更新总部视图 | 已交付；[范围与记录](https://github.com/susansys/fogbound-command/issues/1) |
| 固定工位记录 | 向记录组安排一次档案记录任务，经历准备、作业和成果回报，查看预约及实际资源消耗 | 已交付；[范围](https://github.com/susansys/fogbound-command/issues/10)、[验收修正](https://github.com/susansys/fogbound-command/pull/18) |
| 准备期替代与可读记录 | 先向 R 签发前往 N 的任务，可登记一次改到 T 的请求；依据收到的回报确认结果，回查原始理由及关键或完整历史记录 | 本批工程验证通过；[范围与记录](https://github.com/susansys/fogbound-command/issues/19)、[交付 PR](https://github.com/susansys/fogbound-command/pull/28) |

现有演练支持指挥时间与手动推进、管理暂停、同浏览器保存恢复、只读回看和同场景重开。地图中的编组位置以总部最后收到的报告为准，地图不会直接显示远端实时状态。

这些工程演练只覆盖固定任务链，尚不足以体验完整游戏的多角色协作、矛盾情报和多任务决策压力。完整第一可玩版本仍在规划；已有工程测试通过也不表示完整产品的 244 项验收或正式玩家体验已经通过。

## 本地运行

需要 Git、Docker，以及支持 Web Workers、IndexedDB 和 Web Locks 的现代桌面浏览器。下面的命令使用仓库现有 Dockerfile：构建 React 前端，由 nginx 在本地提供页面。

```sh
git clone https://github.com/susansys/fogbound-command.git
cd fogbound-command
docker build -t fogbound-command ./app
docker run --rm --name fogbound-command-demo -p 127.0.0.1:4175:80 fogbound-command
```

打开 [本地演练入口](http://127.0.0.1:4175)。首次构建需要网络以取得锁定的构建依赖。若 4175 已被占用，可改用其他本地端口；后续恢复存档请始终使用相同浏览器、地址和端口。

开始页可选择“走廊移动”“工位记录”或“准备期替代”。准备期演练还可选择固定消息条件，观察请求拒绝、未发送过期和结果未确认等情况。默认的指挥模式会随时间推进，阅读与编辑不会自动暂停；切到其他窗口会触发管理暂停，返回后需要明确继续。首次了解流程也可以选择手动推进的演练模式。

存档保存在本浏览器的 IndexedDB 中，当前没有服务器账号或云存档。清理网站数据会删除本地记录。演练页面通过浏览器的单写者锁管理接手，不适合同时打开多个指挥窗口。

地图在现有 Pixi 相机中显示程序原创的 10 × 10 图上公里虚构区域。“图层”可切换地表与模拟阴影；“区域资料与来源”说明资源身份，“区域全景（仅背景阅读）”查看完整背景。指针高程、图例色带和阴影来自同一模拟格网，图上米和人为零基准不代表现实地理测量。背景范围不扩大已登记的任务活动范围；合法编组仍按总部最后确认的位置显示。区域资源或图形故障时可从文字列表选择对象并明确修复地图。

地图相机及图层偏好采用独立记录，保存后核对实际写入；恢复行动仍依据当前 Game 存档及其真实确认回执。新地图入口使用独立的当前存档命名空间，旧入口存档保留，未自动迁移或删除。切换图面不改变命令、资源、时钟或随机流。MAP-B 的具体工程结果与测试限制见[验证记录](app/VERIFICATION.md)及[范围与变更](https://github.com/susansys/fogbound-command/issues/34)。

## 开发与验证

前端采用 React、TypeScript 和 Vite；态势地图使用 PixiJS、milsymbol；Game 在 Web Worker 中执行，Dexie/IndexedDB 保存本地事务记录。自动验证使用 Vitest 与 Playwright。[工作流](.github/workflows/fb01.yml)保留最初批次的名称，包含核心质量检查和真实浏览器合同检查；[工程验证记录](app/VERIFICATION.md)区分各次检查点和最终验收。

在 Node.js 22 环境中，可从仓库根目录执行：

```sh
cd app
npm ci --ignore-scripts --no-audit --no-fund
npm run typecheck
npm run lint
npm test
npm run build
```

`npm run browser` 还需要可访问的演练页面及浏览器运行环境；具体的锁定浏览器、页面地址和启动方式见[现有 CI 配置](.github/workflows/fb01.yml)。该命令不会自行启动演练服务器。

## 设计方向与后续范围

后续路线包括：让情报影响行动选择的第一可玩版本、来源与时点的不确定性、多角色协作、受约束的随机场景与重玩，以及完整游戏的扩展。区域遥感地图、可配置的角色模型 API 都属于后续设计方向，当前代码没有接入这些服务；DeepSeek 只是模型方案的初始例子，也不要求玩家现在提供密钥。

- [完整产品规格](public-docs/docs/requirements/product-v0.5.1.md)
- [虚构参数](public-docs/docs/requirements/product-v0.5.1-parameters.md)及[场景](public-docs/docs/requirements/product-v0.5.1-scenarios.md)
- [244 项完整产品验收定义](public-docs/docs/requirements/product-v0.5.1-acceptance.md)
- [六阶段规划](public-docs/docs/plans/six-stage-plan-v0.5.1.md)

公开设计文档保留了写作当时的状态说明。理解当前交付内容时，请结合上方演练表、已合并代码和具体批次的 Issue；规划中的能力不会因文档存在而自动成为已实现功能。早期 0.2.1 界面演示是视觉参考，目前可运行工程演练以本仓库 main 的构建结果为准。

仓库当前尚未提供许可证文件，公开可读不等于已授予开源再使用许可。
