extends Control

# UI 演示脚本 — 用于测试 MCP 的 UI 节点工具

@export var title_text: String = "UI 测试面板"

signal button_pressed(button_name: String)


func _ready() -> void:
	"""连接按钮信号"""
	var start_btn = %StartButton
	var settings_btn = %SettingsButton
	
	if start_btn:
		start_btn.pressed.connect(_on_start_pressed)
	if settings_btn:
		settings_btn.pressed.connect(_on_settings_pressed)


func _on_start_pressed() -> void:
	"""开始按钮点击处理"""
	print("开始游戏！")
	button_pressed.emit("start")


func _on_settings_pressed() -> void:
	"""设置按钮点击处理"""
	print("打开设置...")
	button_pressed.emit("settings")


func update_score(new_score: int) -> void:
	"""更新分数显示"""
	var score_label = %ScoreLabel
	if score_label:
		score_label.text = "分数: " + str(new_score)
