shader_type canvas_item;

// 测试着色器 — 用于 MCP 着色器工具测试

uniform float wave_strength : hint_range(0.0, 1.0) = 0.1;
uniform vec4 tint_color : source_color = vec4(1.0, 0.5, 0.2, 1.0);

void fragment()
{
	// 波浪扭曲效果
    vec2 uv = UV;
    uv.y += sin(uv.x * 10.0 + TIME * 2.0) * wave_strength * 0.05;

    vec4 tex_color = texture(TEXTURE, uv);
    COLOR = tex_color * tint_color;
}