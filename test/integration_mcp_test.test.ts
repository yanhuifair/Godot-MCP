// ============================================================
// Comprehensive Integration Test against /Users/Fair/MCP_test
// ============================================================

import { describe, it, expect } from 'vitest';

const PROJECT = '/Users/Fair/MCP_test';

// ---- Project Tools ----
describe('Project Tools', () => {
  it('list_project_files', async () => {
    const { listFiles } = await import('../src/utils/file_utils.js');
    const files = listFiles(PROJECT);
    expect(files.some((f: any) => f.name === 'project.godot')).toBe(true);
  });

  it('read_project_config', async () => {
    const { handleReadProjectConfig } = await import('../src/tools/project.js');
    const r = handleReadProjectConfig(PROJECT);
    expect(r.content[0].text).toContain('MCP_Test');
  });

  it('search_in_project finds CharacterBody', async () => {
    const { handleSearchInProject } = await import('../src/tools/project.js');
    const r = handleSearchInProject(PROJECT, { query: 'CharacterBody' });
    expect(r.content[0].text).toContain('player');
  });

  it('read_input_map', async () => {
    const { handleReadInputMap } = await import('../src/tools/project.js');
    const r = handleReadInputMap(PROJECT);
    expect(r.isError).toBeFalsy();
  });

  it('generate_project_report', async () => {
    const { handleGenerateProjectReport } = await import('../src/tools/project.js');
    const r = handleGenerateProjectReport(PROJECT);
    expect(r.content[0].text).toContain('Project Report');
  });

  it('list_autoloads', async () => {
    const { handleListAutoloads } = await import('../src/tools/project.js');
    const r = handleListAutoloads(PROJECT);
    expect(r.content[0].text).toContain('autoload');
  });

  it('validate_project', async () => {
    const { handleValidateProject } = await import('../src/tools/project.js');
    const r = handleValidateProject(PROJECT);
    expect(r.content[0].text).toContain('passed');
  });

  it('find_unused_assets', async () => {
    const { handleFindUnusedAssets } = await import('../src/tools/project.js');
    const r = handleFindUnusedAssets(PROJECT);
    expect(r.content[0].text).toContain('Unused');
  });

  it('list_groups', async () => {
    const { handleListGroups } = await import('../src/tools/project.js');
    const r = handleListGroups(PROJECT);
    expect(r.isError).toBeFalsy();
  });
});

// ---- Scene Tools ----
describe('Scene Tools', () => {
  it('list_scenes finds scenes', async () => {
    const { handleListScenes } = await import('../src/tools/scene.js');
    const r = handleListScenes(PROJECT, {});
    expect(r.content[0].text).toContain('player.tscn');
    expect(r.content[0].text).toContain('main.tscn');
  });

  it('read_scene (player) shows CharacterBody3D', async () => {
    const { handleReadScene } = await import('../src/tools/scene.js');
    const r = handleReadScene(PROJECT, { path: 'player.tscn' });
    expect(r.content[0].text).toContain('CharacterBody3D');
  });

  it('read_scene (main) shows Node3D', async () => {
    const { handleReadScene } = await import('../src/tools/scene.js');
    const r = handleReadScene(PROJECT, { path: 'main.tscn' });
    expect(r.content[0].text).toContain('Node3D');
  });

  it('read_scene (hurricane) shows CSGBox3D', async () => {
    const { handleReadScene } = await import('../src/tools/scene.js');
    const r = handleReadScene(PROJECT, { path: 'scenes/hurricane.tscn' });
    expect(r.content[0].text).toContain('CSGBox3D');
  });

  it('scene_dependency_graph', async () => {
    const { handleSceneDependencyGraph } = await import('../src/tools/scene.js');
    const r = handleSceneDependencyGraph(PROJECT);
    expect(r.content[0].text).toContain('Dependency');
  });

  it('find_nodes_in_scenes by type', async () => {
    const { handleFindNodesInScenes } = await import('../src/tools/scene.js');
    const r = handleFindNodesInScenes(PROJECT, { node_type: 'CharacterBody3D' });
    expect(r.content[0].text).toContain('player');
  });

  it('search_scene_content', async () => {
    const { handleSearchSceneContent } = await import('../src/tools/scene.js');
    const r = handleSearchSceneContent(PROJECT, { query: 'CharacterBody' });
    expect(r.content[0].text).toContain('player');
  });

  it('list_ui_nodes', async () => {
    const { handleListUiNodes } = await import('../src/tools/scene.js');
    const r = handleListUiNodes(PROJECT, {});
    expect(r.isError).toBeFalsy();
  });
});

// ---- Script Tools ----
describe('Script Tools', () => {
  it('list_scripts finds .gd files', async () => {
    const { handleListScripts } = await import('../src/tools/script.js');
    const r = handleListScripts(PROJECT, { type: 'gdscript' });
    expect(r.content[0].text).toContain('player.gd');
  });

  it('read_script shows extends', async () => {
    const { handleReadScript } = await import('../src/tools/script.js');
    const r = handleReadScript(PROJECT, { path: 'player.gd' });
    expect(r.content[0].text).toContain('extends');
  });

  it('validate_script passes', async () => {
    const { handleValidateScript } = await import('../src/tools/script.js');
    const r = handleValidateScript(PROJECT, { path: 'player.gd' });
    expect(r.content[0].text).toContain('Validation');
  });

  it('read_script_structure', async () => {
    const { handleReadScriptStructure } = await import('../src/tools/script.js');
    const r = handleReadScriptStructure(PROJECT, { path: 'player.gd' });
    expect(r.content[0].text).toContain('extends');
  });

  it('search_in_scripts', async () => {
    const { handleSearchInScripts } = await import('../src/tools/script.js');
    const r = handleSearchInScripts(PROJECT, { query: 'extends CharacterBody' });
    expect(r.content[0].text).toContain('player.gd');
  });
});

// ---- Shader Tools ----
describe('Shader Tools', () => {
  it('list_shaders finds .gdshader', async () => {
    const { handleListShaders } = await import('../src/tools/script.js');
    const r = handleListShaders(PROJECT, {});
    expect(r.content[0].text).toContain('.gdshader');
  });

  it('read_shader (hurricane)', async () => {
    const { handleReadShader } = await import('../src/tools/script.js');
    const r = handleReadShader(PROJECT, { path: 'scenes/hurricane.gdshader' });
    expect(r.content[0].text).toContain('shader_type');
  });

  it('list_visual_shaders', async () => {
    const { handleListVisualShaders } = await import('../src/tools/script.js');
    const r = handleListVisualShaders(PROJECT, {});
    expect(r.isError).toBeFalsy();
  });
});

// ---- Resource Tools ----
describe('Resource Tools', () => {
  it('list_resources', async () => {
    const { handleListResources } = await import('../src/tools/resource.js');
    const r = handleListResources(PROJECT, {});
    expect(r.content[0].text).toContain('.tres');
  });

  it('read_resource (hurricane material)', async () => {
    const { handleReadResource } = await import('../src/tools/resource.js');
    const r = handleReadResource(PROJECT, { path: 'scenes/hurricane.tres' });
    expect(r.content[0].text).toContain('ShaderMaterial');
  });

  it('list_materials', async () => {
    const { handleListMaterials } = await import('../src/tools/resource.js');
    const r = handleListMaterials(PROJECT, {});
    expect(r.isError).toBeFalsy();
  });
});

// ---- Animation Tools ----
describe('Animation Tools', () => {
  it('list_animations', async () => {
    const { handleListAnimations } = await import('../src/tools/animation.js');
    const r = handleListAnimations(PROJECT, {});
    expect(r.isError).toBeFalsy();
  });
});

// ---- Import Tools ----
describe('Import Tools', () => {
  it('list_import_files finds icon.svg', async () => {
    const { handleListImportFiles } = await import('../src/tools/import.js');
    const r = handleListImportFiles(PROJECT, {});
    expect(r.content[0].text).toContain('icon.svg');
  });

  it('read_import_config for icon.svg', async () => {
    const { handleReadImportConfig } = await import('../src/tools/import.js');
    const r = handleReadImportConfig(PROJECT, { asset_path: 'icon.svg' });
    expect(r.content[0].text).toContain('Import');
  });
});

// ---- Environment Tools ----
describe('Environment Tools', () => {
  it('list_environments', async () => {
    const { handleListEnvironments } = await import('../src/tools/environment.js');
    const r = handleListEnvironments(PROJECT, {});
    expect(r.isError).toBeFalsy();
  });
});

// ---- Audio Tools ----
describe('Audio Tools', () => {
  it('list_audio_files', async () => {
    const { handleListAudioFiles } = await import('../src/tools/audio.js');
    const r = handleListAudioFiles(PROJECT, {});
    expect(r.isError).toBeFalsy();
  });
});

// ---- Physics Tools ----
describe('Physics Tools', () => {
  it('list_physics_materials', async () => {
    const { handleListPhysicsMaterials } = await import('../src/tools/physics.js');
    const r = handleListPhysicsMaterials(PROJECT, {});
    expect(r.isError).toBeFalsy();
  });

  it('read_collision_layers', async () => {
    const { handleReadCollisionLayers } = await import('../src/tools/physics.js');
    const r = handleReadCollisionLayers(PROJECT);
    expect(r.isError).toBeFalsy();
  });
});

// ---- Inspector Tools ----
describe('Inspector Tools', () => {
  it('list_cameras', async () => {
    const { handleListCameras } = await import('../src/tools/inspector.js');
    const r = handleListCameras(PROJECT, {});
    expect(r.isError).toBeFalsy();
  });

  it('list_lights', async () => {
    const { handleListLights } = await import('../src/tools/inspector.js');
    const r = handleListLights(PROJECT, {});
    expect(r.isError).toBeFalsy();
  });

  it('read_particles', async () => {
    const { handleReadParticles } = await import('../src/tools/inspector.js');
    const r = handleReadParticles(PROJECT, {});
    expect(r.isError).toBeFalsy();
  });
});

// ---- Texture Tools ----
describe('Texture Tools', () => {
  it('read_texture_info for icon.svg', async () => {
    const { handleReadTextureInfo } = await import('../src/tools/texture.js');
    const r = handleReadTextureInfo(PROJECT, { path: 'icon.svg' });
    expect(r.content[0].text).toContain('icon.svg');
  });
});

// ---- Navigation Tools ----
describe('Navigation Tools', () => {
  it('list_nav_regions', async () => {
    const { handleListNavRegions } = await import('../src/tools/navigation.js');
    const r = handleListNavRegions(PROJECT, {});
    expect(r.isError).toBeFalsy();
  });
});

// ---- Translation Tools ----
describe('Translation Tools', () => {
  it('list_translations', async () => {
    const { handleListTranslations } = await import('../src/tools/translation.js');
    const r = handleListTranslations(PROJECT, {});
    expect(r.isError).toBeFalsy();
  });
});

// ---- UID Tools ----
describe('UID Tools', () => {
  it('get_uid for player.tscn', async () => {
    const { handleGetUid } = await import('../src/tools/uid.js');
    const r = handleGetUid(PROJECT, { path: 'player.tscn' });
    expect(r.isError).toBeFalsy();
  });

  it('update_project_uids', async () => {
    const { handleUpdateProjectUids } = await import('../src/tools/uid.js');
    const r = handleUpdateProjectUids(PROJECT, { check_only: true });
    expect(r.content[0].text).toContain('files');
  });
});

// ---- Rendering Tools ----
describe('Rendering Tools', () => {
  it('read_raycast', async () => {
    const { handleReadRaycast } = await import('../src/tools/rendering.js');
    const r = handleReadRaycast(PROJECT, {});
    expect(r.isError).toBeFalsy();
  });
});

// ---- Domain Tools ----
describe('Domain Tools', () => {
  it('list_paths', async () => {
    const { handleListPaths } = await import('../src/tools/domain.js');
    const r = handleListPaths(PROJECT, {});
    expect(r.isError).toBeFalsy();
  });

  it('list_skeletons', async () => {
    const { handleListSkeletons } = await import('../src/tools/domain.js');
    const r = handleListSkeletons(PROJECT, {});
    expect(r.isError).toBeFalsy();
  });

  it('read_reflection_probe', async () => {
    const { handleReadReflectionProbe } = await import('../src/tools/domain.js');
    const r = handleReadReflectionProbe(PROJECT, {});
    expect(r.isError).toBeFalsy();
  });

  it('read_multimesh', async () => {
    const { handleReadMultiMesh } = await import('../src/tools/domain.js');
    const r = handleReadMultiMesh(PROJECT, {});
    expect(r.isError).toBeFalsy();
  });
});

// ---- Node Tools ----
describe('Node Tools', () => {
  it('read_character_body finds CharacterBody3D', async () => {
    const { handleReadCharacterBody } = await import('../src/tools/nodes.js');
    const r = handleReadCharacterBody(PROJECT, { scene_path: 'player.tscn' });
    expect(r.content[0].text).toContain('CharacterBody');
  });

  it('read_animated_sprite', async () => {
    const { handleReadAnimatedSprite } = await import('../src/tools/nodes.js');
    const r = handleReadAnimatedSprite(PROJECT, {});
    expect(r.isError).toBeFalsy();
  });

  it('read_audio_player', async () => {
    const { handleReadAudioPlayer } = await import('../src/tools/nodes.js');
    const r = handleReadAudioPlayer(PROJECT, {});
    expect(r.isError).toBeFalsy();
  });

  it('read_parallax', async () => {
    const { handleReadParallax } = await import('../src/tools/nodes.js');
    const r = handleReadParallax(PROJECT, {});
    expect(r.isError).toBeFalsy();
  });
});

// ---- Utility Tools ----
describe('Utility Tools', () => {
  it('list_all_signals', async () => {
    const { handleListAllSignals } = await import('../src/tools/utility.js');
    const r = handleListAllSignals(PROJECT, {});
    expect(r.isError).toBeFalsy();
  });

  it('read_project_icon shows MCP_Test', async () => {
    const { handleReadProjectIcon } = await import('../src/tools/utility.js');
    const r = handleReadProjectIcon(PROJECT);
    expect(r.content[0].text).toContain('MCP_Test');
  });

  it('list_popups', async () => {
    const { handleListPopups } = await import('../src/tools/utility.js');
    const r = handleListPopups(PROJECT, {});
    expect(r.isError).toBeFalsy();
  });

  it('generate_cohesion_report', async () => {
    const { handleGenerateCohesionReport } = await import('../src/tools/utility.js');
    const r = handleGenerateCohesionReport(PROJECT);
    expect(r.content[0].text).toContain('Cohesion');
  });
});

// ---- Coverage Tools ----
describe('Coverage Tools', () => {
  it('read_decal', async () => {
    const { handleReadDecal } = await import('../src/tools/coverage.js');
    const r = handleReadDecal(PROJECT, {});
    expect(r.isError).toBeFalsy();
  });

  it('read_occluder', async () => {
    const { handleReadOccluder } = await import('../src/tools/coverage.js');
    const r = handleReadOccluder(PROJECT, {});
    expect(r.isError).toBeFalsy();
  });

  it('read_marker', async () => {
    const { handleReadMarker } = await import('../src/tools/coverage.js');
    const r = handleReadMarker(PROJECT, {});
    expect(r.isError).toBeFalsy();
  });

  it('read_soft_body', async () => {
    const { handleReadSoftBody } = await import('../src/tools/coverage.js');
    const r = handleReadSoftBody(PROJECT, {});
    expect(r.isError).toBeFalsy();
  });

  it('read_grid_map', async () => {
    const { handleReadGridMap } = await import('../src/tools/coverage.js');
    const r = handleReadGridMap(PROJECT, {});
    expect(r.isError).toBeFalsy();
  });

  it('read_audio_listener', async () => {
    const { handleReadAudioListener } = await import('../src/tools/coverage.js');
    const r = handleReadAudioListener(PROJECT, {});
    expect(r.isError).toBeFalsy();
  });

  it('read_vehicle_body', async () => {
    const { handleReadVehicleBody } = await import('../src/tools/coverage.js');
    const r = handleReadVehicleBody(PROJECT, {});
    expect(r.isError).toBeFalsy();
  });

  it('read_spring_arm', async () => {
    const { handleReadSpringArm } = await import('../src/tools/coverage.js');
    const r = handleReadSpringArm(PROJECT, {});
    expect(r.isError).toBeFalsy();
  });

  it('read_light_2d', async () => {
    const { handleReadLight2d } = await import('../src/tools/coverage.js');
    const r = handleReadLight2d(PROJECT, {});
    expect(r.isError).toBeFalsy();
  });

  it('read_sprite_frames', async () => {
    const { handleReadSpriteFrames } = await import('../src/tools/coverage.js');
    const r = handleReadSpriteFrames(PROJECT, {});
    expect(r.isError).toBeFalsy();
  });
});

// ---- Joints Tools ----
describe('Joint Tools', () => {
  it('list_joints', async () => {
    const { handleListJoints } = await import('../src/tools/joint.js');
    const r = handleListJoints(PROJECT, {});
    expect(r.isError).toBeFalsy();
  });
});

// ---- Shader Graph Tools ----
describe('Shader Graph Tools', () => {
  it('list_shader_node_types', async () => {
    const { handleListShaderNodeTypes } = await import('../src/tools/shader_graph.js');
    const r = handleListShaderNodeTypes({});
    expect(r.content[0].text).toContain('Output');
  });
});

// ---- Godot CLI Tools ----
describe('Godot CLI Tools', () => {
  it('get_godot_version', async () => {
    const { handleGetGodotVersion } = await import('../src/tools/godot.js');
    const r = handleGetGodotVersion();
    expect(r.content[0].text).toContain('Godot');
  });

  it('is_editor_running', async () => {
    const { handleIsEditorRunning } = await import('../src/tools/godot.js');
    const r = handleIsEditorRunning();
    expect(r.isError).toBeFalsy();
  });
});
