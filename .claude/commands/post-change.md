# /post-change - 变更后处理（后台执行）

## 命令说明
在代码审查通过后，**后台**启动子 Agent 完成 Git 提交。主会话可以立即继续下一个任务。

## 架构

```
主 Agent（收集变更上下文）
  ↓ run_in_background: true
子 Agent：Git 提交到 dev 分支
  ↓
自动通知主 Agent 完成结果
```

## 前置条件
- 必须先通过 `/code-review` 代码审查
- 确认当前在 `dev` 分支

## 执行方式

### 1. 主 Agent 收集变更信息
- 运行 `git diff` 和 `git diff --cached` 收集变更
- 确认当前分支是 `dev`
- 记录变更涉及的文件和内容摘要

### 2. 主 Agent 启动子 Agent（后台运行）

使用 Agent 工具启动子 agent，**必须设置 `run_in_background: true`**，传递以下 prompt 和变更上下文。
启动后立即告诉用户"后台处理已启动，完成后会通知你"，然后可以继续其他工作。

```
你是 FastNoteSyncTeam 项目的变更后处理 Agent。你需要将变更提交到 Git dev 分支。

## 变更上下文
{主 Agent 在此插入 git diff 内容和变更摘要}

## Git 提交

执行以下步骤：
1. git branch 确认在 dev 分支（如果不在，先 git stash && git checkout dev && git stash pop）
2. git add 添加变更文件
3. git commit，消息格式：feat/fix/docs: 简明中文描述
4. 不要自动 push

完成后输出提交 hash 和消息。

## 汇总

提交完成后，输出摘要：

✅ 变更后处理完成
📦 Git 提交：[提交 hash 和消息]

然后使用 AskUserQuestion 询问用户：
"是否将 dev 分支 push 到远程？"

- 用户确认 → 执行 `git push origin dev`，输出 push 结果
- 用户拒绝 → 提示用户可稍后手动 `git push origin dev`
```

## 注意事项
- **必须使用 `run_in_background: true`** 启动子 Agent，不阻塞主会话
- 主 Agent 传递 prompt 时，必须把完整的 git diff 内容附在"变更上下文"中
- 子 Agent 完成后，系统会自动通知主 Agent，主 Agent 再将摘要展示给用户
- 主 Agent 启动后台任务后，应立即回复用户可以继续下一个工作
- commit 消息使用中文
