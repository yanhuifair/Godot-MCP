extends CharacterBody2D

@export var speed: float = 300.0

var health: int = 100

func _ready():
	print("Player ready!")
	position = Vector2(100, 100)

func _process(delta):
	var direction = Vector2(
		Input.get_axis("move_left", "move_right"),
		Input.get_axis("move_up", "move_down")
	)
	velocity = direction * speed
	move_and_slide()
