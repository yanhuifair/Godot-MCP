extends Node

# Godot MCP 测试项目主脚本
# 用于验证 MCP 工具的读写功能

@export var player_speed: float = 200.0
@export var player_color: Color = Color.WHITE

signal game_started
signal score_updated(new_score: int)

var score: int = 0


func _ready() -> void:
	"""节点准备就绪时调用"""
	print("Godot MCP Test Project 已启动！")
	game_started.emit()
	
	# 连接 Timer 信号
	var timer = $Timer
	if timer:
		timer.timeout.connect(_on_timer_timeout)


func _process(delta: float) -> void:
	"""每帧调用"""
	pass


func _on_timer_timeout() -> void:
	"""定时器超时时调用"""
	score += 1
	score_updated.emit(score)
	print("得分：", score)


func reset_score() -> void:
	"""重置分数"""
	score = 0
	score_updated.emit(score)
	print("分数已重置")
