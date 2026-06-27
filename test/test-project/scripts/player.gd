extends CharacterBody2D

# 玩家脚本 — 用于测试 MCP 工具的基本角色控制器

@export var speed: float = 300.0
@export var jump_velocity: float = -400.0

var gravity: float = ProjectSettings.get_setting("physics/2d/default_gravity")


func _physics_process(delta: float) -> void:
	"""物理帧更新 — 处理移动和跳跃"""
	# 重力
	if not is_on_floor():
		velocity.y += gravity * delta

	# 水平移动
	var direction := Input.get_axis("move_left", "move_right")
	if direction != 0:
		velocity.x = direction * speed
	else:
		velocity.x = move_toward(velocity.x, 0, speed)

	# 跳跃
	if Input.is_action_just_pressed("ui_accept") and is_on_floor():
		velocity.y = jump_velocity

	move_and_slide()
