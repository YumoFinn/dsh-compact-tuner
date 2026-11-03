# dsh-compact-tuner

在输入框上方调当前对话的上下文压缩参数：**触发比例**和**保留量**。

## 为什么需要它

DSH 的自动压缩由 `@deepseek-ai/dsh-compaction-basic` 驱动，两个参数只存在于 preset 配置里：

- `thresholdRatio`：`thresholdTokens = min(窗口 × 比例, 窗口 − 输出预留 − headroom)`，
  测得的 `totalTokens` 越过它就压缩；
- `retainTokens`：压缩时原样保留的尾部 token 预算。`resolveCompactSpec` 要求它严格小于阈值，
  否则直接抛错。

两者都是全局的：改一次要重启，且对所有对话一视同仁。但长任务和短问答需要的策略不同——
有的想晚点压、保住单轮完整性，有的想早点压、省窗口；压缩后保留多少尾部，决定接下来几步
还记不记得上下文。

现有插件里，`dsh-compaction-threshold` 和 `dsh-compact-control` 只调阈值；
`@tivility/dsh-compaction-window` 覆盖阈值和保留量，但它替换 `compaction` 后端、
要求改 preset 里的压缩行，也没有界面。这个插件补的是：两个参数都能调、在会话里直接调、
不换后端。

## 安装

```powershell
dsh plugin --profile desktop add dsh-compact-tuner
```

重启 DSH。也可以从侧栏「插件」页搜索安装。

不需要改 preset。preset 用 `isolate: { compaction: true }` 时每个 preset 有自己的压缩引擎，
插件会在每个 agent 的第一步把它取出来一并装饰，所以开箱即用。

## 用法

点输入框上方的「压缩 xx%」，面板两个页签：

| 页签 | 取值 | 对应配置 |
|---|---|---|
| 触发比例 | 20% / 25% / 35% / 自定义 5%–95% / 跟随默认 | `thresholdRatio` |
| 保留量 | 8k / 20k / 40k / 自定义 1k–200k token / 跟随默认 | `retainTokens` |

改动只影响当前对话，下一步生效；新对话回到默认值。

命令：

```
/compact-ratio            查看当前对话的比例
/compact-ratio 0.25       设为 25%
/compact-ratio default    清除覆盖
```

## 实现

装饰压缩引擎的 `compactIfNeeded`：调用前换入带覆盖的配置副本，在引擎的同步前缀结束后还原。
没有覆盖、不是压力触发、或引擎不可用时，直接调用原方法。

根层的 `ctx.compaction` 直接装饰；preset 隔离出来的引擎在 `agent/pre-step` 里通过
`agentPresets.serviceFor(agent, 'compaction')` 取得，按实例去重，切 preset 也不会重复包装。

## 已知行为

- 只作用于压力触发的压缩；上下文溢出后的恢复不保留尾部，这是后端行为。
- 保留量 ≥ 阈值时后端抛 `retainTokens must be less than threshold`；插件捕获后回退到
  按比例计算的默认尾部，并在 `compact-ratio.health.json` 记一条，日志里也有一条 warn。
- 模型级 `modelPolicies` 里显式写的保留策略优先于面板设置。

## 存储

`~/.dsh/storages/compact-ratio.json`，纯本地，不上传。

## 开发

`index.js` + `client.js` 两个文件，无构建、无运行时依赖。改完重启宿主，
浏览器半侧刷新页面即可。

## 许可

MIT。
