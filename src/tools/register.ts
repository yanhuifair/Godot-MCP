// ============================================================
// Godot MCP Server - Centralized Tool Registration
// ============================================================
// Every tool in one place. Add new tools here.
// Each category is a self-contained block.

import { z } from 'zod';
import { ToolRegistry } from '../utils/registry.js';

// Project tools
import {
  handleListProjectFiles, handleReadProjectConfig, handleSearchInProject,
  handleReadInputMap, handleDeleteFile, handleMoveFile, handleWriteProjectConfig,
  handleReadExportPresets, handleGenerateProjectReport, handleListAutoloads,
  handleAddAutoload, handleRemoveAutoload, handleFindUnusedAssets,
  handleValidateProject, handleListGroups, handleDuplicateScene,
  handleDuplicateResource, handleCreateDirectory,
  handleWriteInputAction, handleRemoveInputAction, handleAddInputBinding,
  listProjectFilesSchema, readProjectConfigSchema, searchInProjectSchema,
  readInputMapSchema, deleteFileSchema, moveFileSchema, writeProjectConfigSchema,
  readExportPresetsSchema, generateProjectReportSchema, listAutoloadsSchema,
  addAutoloadSchema, removeAutoloadSchema, findUnusedAssetsSchema,
  validateProjectSchema, listGroupsSchema, duplicateSceneSchema,
  duplicateResourceSchema, createDirectorySchema,
  writeInputActionSchema, removeInputActionSchema, addInputBindingSchema,
} from './project.js';

// Scene tools
import {
  handleReadScene, handleCreateScene, handleEditScene, handleListScenes,
  handleSceneDependencyGraph, handleFindNodesInScenes, handleSearchSceneContent,
  handleListUiNodes, handleRenameNode, handleAttachScript, handleSetCollisionShape,
  handleLoadSprite, handleAddNode, handleRemoveNode, handleModifyNode,
  handleCloneNode, handleConnectSignal, handleDisconnectSignal,
  handleSetNodePosition, handleSetNodeRotation, handleSetNodeScale,
  handleTransformNode,
  readSceneSchema, createSceneSchema, editSceneSchema, listScenesSchema,
  sceneDependencyGraphSchema, findNodesInScenesSchema, searchSceneContentSchema,
  listUiNodesSchema, renameNodeSchema, attachScriptSchema, setCollisionShapeSchema,
  loadSpriteSchema, addNodeSchema, removeNodeSchema, modifyNodeSchema,
  cloneNodeSchema, connectSignalSchema, disconnectSignalSchema,
  setNodePositionSchema, setNodeRotationSchema, setNodeScaleSchema,
  transformNodeSchema,
} from './scene.js';

// Script + Shader tools
import {
  handleReadScript, handleWriteScript, handleCreateScript, handleListScripts,
  handleReadShader, handleCreateShader, handleListShaders, handleWriteShader,
  handleValidateScript, handleReadScriptStructure, handleSearchInScripts,
  handleListVisualShaders, handleReadVisualShader, handleReadShaderInclude,
  handleCreateShaderInclude, handleListShaderIncludes,
  handleAddScriptFunction, handleAddScriptSignal, handleAddScriptExport,
  handleValidateShader, handleCompileShader,
  readScriptSchema, writeScriptSchema, createScriptSchema, listScriptsSchema,
  readShaderSchema, createShaderSchema, listShadersSchema, writeShaderSchema,
  validateScriptSchema, readScriptStructureSchema, searchInScriptsSchema,
  listVisualShadersSchema, readVisualShaderSchema, readShaderIncludeSchema,
  createShaderIncludeSchema, listShaderIncludesSchema,
  addScriptFunctionSchema, addScriptSignalSchema, addScriptExportSchema,
  validateShaderSchema, compileShaderSchema,
} from './script.js';

// Resource tools
import {
  handleReadResource, handleListResources, handleCreateResource,
  handleWriteResource, handleListMaterials, handleReadMaterial,
  handleSetMaterialParam, handleReadTheme,
  readResourceSchema, listResourcesSchema, createResourceSchema,
  writeResourceSchema, listMaterialsSchema, readMaterialSchema,
  setMaterialParamSchema, readThemeSchema,
} from './resource.js';

// Godot Engine tools
import {
  handleGetGodotVersion, handleLaunchEditor, handleRunProject,
  handleMonitorOutput, handleExportProject, handleCaptureScreenshot,
  handleStopProject, handleIsEditorRunning, handleListProjects,
  getGodotVersionSchema, launchEditorSchema, runProjectSchema,
  monitorOutputSchema, exportProjectSchema, captureScreenshotSchema,
  stopProjectSchema, isEditorRunningSchema, listProjectsSchema,
} from './godot.js';

// Editor plugin tools
import {
  handleEditorGetSelection, handleEditorSetSelection, handleEditorPlay,
  handleEditorStop, handleEditorUndo, handleEditorRedo, handleEditorSave,
  handleEditorGetOpenScene, handleEditorOpenAsset, handleEditorGetInfo,
  handleEditorReadCurrentScene, handleEditorReloadScene,
  handleEditorAddNode, handleEditorRemoveNode, handleEditorGetNodeProperties,
  handleEditorSetNodeProperties, handleEditorRenameNode, handleEditorDuplicateNode,
  handleEditorReparentNode, handleEditorMoveNode, handleEditorRunSpecificScene,
  handleEditorRunGdscript, handleEditorCreateScript, handleEditorAttachScript,
  handleEditorSetBreakpoint, handleEditorRemoveBreakpoint, handleEditorGetBreakpoints,
  handleEditorSaveAll, handleEditorFocus, handleEditorOpenDock,
  handleEditorListFilesystem, handleEditorHealthCheck, handleEditorDeleteSelected,
  handleEditorGetRect, handleEditorShowInFilesystem,
  handleEditorCreateScene, handleEditorInstantiateScene, handleEditorSetMainScene,
  handleEditorDebugContinue, handleEditorDebugStep, handleEditorDebugStepOver,
  handleEditorDebugBreak, handleEditorGetStackTrace, handleEditorGetDebugVariables,
  handleEditorEvaluateExpression, handleEditorGetEditorSetting, handleEditorSetEditorSetting,
  handleEditorGetProjectSetting, handleEditorSetProjectSetting, handleEditorConnectSignal,
  handleEditorDisconnectSignal, handleEditorListNodeSignals,
  handleEditorGetSceneChanges, handleEditorGetRecentScenes, handleEditorGetProjectDirectory,
  handleEditorSimulateKey, handleEditorGetPluginList, handleEditorEnablePlugin,
  handleEditorDisablePlugin, handleEditorTakeScreenshot,
  handleEditorGetClassList, handleEditorGetMethodList, handleEditorGetClassPropertyList,
  handleEditorGetClassSignalList, handleEditorGetClassDoc, handleEditorSearchHelp,
  handleEditorCreateFolder, handleEditorDeleteAsset, handleEditorRenameAsset,
  handleEditorMoveAsset, handleEditorDuplicateAsset,
  handleEditorGetEditorCamera, handleEditorSetEditorCamera, handleEditorToggleGrid,
  handleEditorToggleSnap, handleEditorGetAutoloadList, handleEditorAddAutoload,
  handleEditorRemoveAutoload, handleEditorGetInputMap, handleEditorAddInputAction,
  handleEditorRemoveInputAction, handleEditorGetErrorList, handleEditorClearErrors,
  handleEditorReimportAsset, handleEditorBakeLightmaps, handleEditorBakeNavigation,
  handleEditorGetRunningSceneTree, handleEditorGetPerformanceMonitors,
  handleEditorGetDependencyList,
  editorGetSelectionSchema, editorSetSelectionSchema, editorPlaySchema,
  editorStopSchema, editorUndoSchema, editorRedoSchema, editorSaveSchema,
  editorGetOpenSceneSchema, editorOpenAssetSchema, editorGetInfoSchema,
  editorReadCurrentSceneSchema, editorReloadSceneSchema,
  editorAddNodeSchema, editorRemoveNodeSchema, editorGetNodePropertiesSchema,
  editorSetNodePropertiesSchema, editorRenameNodeSchema, editorDuplicateNodeSchema,
  editorReparentNodeSchema, editorMoveNodeSchema, editorRunSpecificSceneSchema,
  editorRunGdscriptSchema, editorCreateScriptSchema, editorAttachScriptSchema,
  editorSetBreakpointSchema, editorRemoveBreakpointSchema, editorGetBreakpointsSchema,
  editorSaveAllSchema, editorFocusSchema, editorOpenDockSchema,
  editorListFilesystemSchema, editorHealthCheckSchema, editorDeleteSelectedSchema,
  editorGetRectSchema, editorShowInFilesystemSchema,
  editorCreateSceneSchema, editorInstantiateSceneSchema, editorSetMainSceneSchema,
  editorDebugContinueSchema, editorDebugStepSchema, editorDebugStepOverSchema,
  editorDebugBreakSchema, editorGetStackTraceSchema, editorGetDebugVariablesSchema,
  editorEvaluateExpressionSchema, editorGetEditorSettingSchema, editorSetEditorSettingSchema,
  editorGetProjectSettingSchema, editorSetProjectSettingSchema, editorConnectSignalSchema,
  editorDisconnectSignalSchema, editorListNodeSignalsSchema,
  editorGetSceneChangesSchema, editorGetRecentScenesSchema, editorGetProjectDirectorySchema,
  editorSimulateKeySchema, editorGetPluginListSchema, editorEnablePluginSchema,
  editorDisablePluginSchema, editorTakeScreenshotSchema,
  editorGetClassListSchema, editorGetMethodListSchema, editorGetClassPropertyListSchema,
  editorGetClassSignalListSchema, editorGetClassDocSchema, editorSearchHelpSchema,
  editorCreateFolderSchema, editorDeleteAssetSchema, editorRenameAssetSchema,
  editorMoveAssetSchema, editorDuplicateAssetSchema,
  editorGetEditorCameraSchema, editorSetEditorCameraSchema, editorToggleGridSchema,
  editorToggleSnapSchema, editorGetAutoloadListSchema, editorAddAutoloadSchema,
  editorRemoveAutoloadSchema, editorGetInputMapSchema, editorAddInputActionSchema,
  editorRemoveInputActionSchema, editorGetErrorListSchema, editorClearErrorsSchema,
  editorReimportAssetSchema, editorBakeLightmapsSchema, editorBakeNavigationSchema,
  editorGetRunningSceneTreeSchema, editorGetPerformanceMonitorsSchema,
  editorGetDependencyListSchema,
} from './editor.js';

// Animation tools
import {
  handleListAnimations, handleReadAnimation, handleCreateAnimation,
  handleSetAnimationParam, handleAddAnimationLibrary,
  handleAddAnimationTrack, handleSetKeyframe, handleRemoveAnimationTrack,
  handleReadAnimationTree, handleSetAnimationTreeParam,
  listAnimationsSchema, readAnimationSchema, createAnimationSchema,
  setAnimationParamSchema, addAnimationLibrarySchema,
  addAnimationTrackSchema, setKeyframeSchema, removeAnimationTrackSchema,
  readAnimationTreeSchema, setAnimationTreeParamSchema,
} from './animation.js';

// Import, Environment, Audio, Physics
import {
  handleReadImportConfig, handleListImportFiles, handleWriteImportConfig,
  readImportConfigSchema, listImportFilesSchema, writeImportConfigSchema,
} from './import.js';
import {
  handleReadEnvironment, handleListEnvironments, handleCreateEnvironment,
  handleSetEnvironmentParam,
  readEnvironmentSchema, listEnvironmentsSchema, createEnvironmentSchema,
  setEnvironmentParamSchema,
} from './environment.js';
import {
  handleReadAudioBusLayout, handleListAudioFiles, handleCreateAudioBusLayout,
  handleAddAudioBus, handleRemoveAudioBus, handleAddBusEffect, handleSetBusVolume,
  readAudioBusLayoutSchema, listAudioFilesSchema, createAudioBusLayoutSchema,
  addAudioBusSchema, removeAudioBusSchema, addBusEffectSchema, setBusVolumeSchema,
} from './audio.js';
import {
  handleListPhysicsMaterials, handleReadPhysicsMaterial,
  handleCreatePhysicsMaterial, handleReadCollisionLayers,
  listPhysicsMaterialsSchema, readPhysicsMaterialSchema,
  createPhysicsMaterialSchema, readCollisionLayersSchema,
} from './physics.js';

// Inspector, Diff, Texture, Navigation, Extension
import {
  handleListCameras, handleReadCamera, handleListLights,
  handleSetLightParam, handleReadParticles,
  listCamerasSchema, readCameraSchema, listLightsSchema,
  setLightParamSchema, readParticlesSchema,
} from './inspector.js';
import {
  handleDiffScene, handleDiffResource,
  diffSceneSchema, diffResourceSchema,
} from './diff.js';
import {
  handleReadTextureInfo,
  readTextureInfoSchema,
} from './texture.js';
import {
  handleListNavRegions, handleReadNavRegion, handleCreateNavMesh,
  listNavRegionsSchema, readNavRegionSchema, createNavMeshSchema,
} from './navigation.js';
import {
  handleReadGdextension, handleListCsproj, handleCreateWorld,
  readGdextensionSchema, listCsprojSchema, createWorldSchema,
} from './extension.js';

// TileSet, Translation
import {
  handleListTilesets, handleReadTileset, handleReadTilemap,
  listTilesetsSchema, readTilesetSchema, readTilemapSchema,
} from './tileset.js';
import {
  handleListTranslations, handleReadTranslation, handleCreateTranslation,
  listTranslationsSchema, readTranslationSchema, createTranslationSchema,
} from './translation.js';

// UID, Joint, Geometry
import {
  handleGetUid, handleUpdateProjectUids, handleListMissingUids,
  getUidSchema, updateProjectUidsSchema, listMissingUidsSchema,
} from './uid.js';
import {
  handleCreateJoint, handleSetJointParam, handleListJoints,
  createJointSchema, setJointParamSchema, listJointsSchema,
} from './joint.js';
import {
  handleCreateCollisionPolygon, handleSetShapePoints,
  createCollisionPolygonSchema, setShapePointsSchema,
} from './geometry.js';

// Rendering, Domain
import {
  handleReadMeshInstance, handleSetMeshSurfaceMaterial,
  handleReadViewport, handleReadArea, handleReadRaycast,
  readMeshInstanceSchema, setMeshSurfaceMaterialSchema,
  readViewportSchema, readAreaSchema, readRaycastSchema,
} from './rendering.js';
import {
  handleReadCurve, handleCreateCurve, handleReadGradient,
  handleCreateGradient, handleListPaths, handleReadPath,
  handleListSkeletons, handleReadSkeleton,
  handleReadReflectionProbe, handleReadMultiMesh, handleCreateNoiseTexture,
  readCurveSchema, createCurveSchema, readGradientSchema,
  createGradientSchema, listPathsSchema, readPathSchema,
  listSkeletonsSchema, readSkeletonSchema,
  readReflectionProbeSchema, createNoiseTextureSchema,
} from './domain.js';

// Nodes, Utility
import {
  handleReadCharacterBody, handleReadAnimatedSprite,
  handleReadAudioPlayer, handleReadVideoPlayer,
  handleReadParallax, handleReadRichText,
  handleReadContainer, handleReadTabContainer,
  readCharacterBodySchema, readAnimatedSpriteSchema,
  readAudioPlayerSchema, readVideoPlayerSchema,
  readParallaxSchema, readRichTextSchema,
  readContainerSchema, readTabContainerSchema,
} from './nodes.js';
import {
  handleListAllSignals, handleReadProjectIcon,
  handleReadStylebox, handleCreateAtlasTexture,
  handleListPopups, handleGenerateCohesionReport,
  listAllSignalsSchema, readProjectIconSchema,
  readStyleboxSchema, createAtlasTextureSchema,
  listPopupsSchema, generateCohesionReportSchema,
} from './utility.js';
import {
  handleCreateVisualShader, handleAddShaderGraphNode, handleRemoveShaderGraphNode,
  handleConnectShaderGraphNodes, handleDisconnectShaderGraphNodes,
  handleSetShaderNodeParam, handleListShaderNodeTypes, handleGetShaderNodeDefaults,
  createVisualShaderSchema, addShaderGraphNodeSchema, removeShaderGraphNodeSchema,
  connectShaderGraphNodesSchema, disconnectShaderGraphNodesSchema,
  setShaderNodeParamSchema, listShaderNodeTypesSchema, getShaderNodeDefaultsSchema,
} from './shader_graph.js';
// Mesh Primitives & Scene Inspectors (was coverage.ts)
import {
  handleCreateMeshPrimitive,
  createMeshPrimitiveSchema,
} from './mesh.js';
import {
  handleReadLight2d, handleSetLight2dParam,
  handleCreateVehicleBody, handleReadVehicleBody,
  handleCreateSpringArm, handleReadSpringArm,
  handleReadDecal, handleReadOccluder, handleReadMarker,
  handleReadAudioStream, handleCreateCameraAttributes,
  handleCreateSpriteFrames, handleReadSpriteFrames,
  handleReadSoftBody, handleReadGridMap, handleCreateGridMap,
  handleReadAudioListener,
  readLight2dSchema, setLight2dParamSchema,
  createVehicleBodySchema, readVehicleBodySchema,
  createSpringArmSchema, readSpringArmSchema,
  readDecalSchema, readOccluderSchema, readMarkerSchema,
  readAudioStreamSchema, createCameraAttributesSchema,
  createSpriteFramesSchema, readSpriteFramesSchema,
  readSoftBodySchema, readGridMapSchema, createGridMapSchema,
  readAudioListenerSchema,
} from './scene_inspectors.js';

// ---- Registration ----

export function registerAllTools(registry: ToolRegistry): void {
  // Project (21)
  registry.register({ name: 'list_project_files', description: 'List files and directories in the Godot project.', schema: listProjectFilesSchema, handler: handleListProjectFiles });
  registry.register({ name: 'read_project_config', description: 'Read and parse project.godot.', schema: readProjectConfigSchema, handler: handleReadProjectConfig });
  registry.register({ name: 'search_in_project', description: 'Search for text across project files.', schema: searchInProjectSchema, handler: handleSearchInProject });
  registry.register({ name: 'read_input_map', description: 'Read input map with key bindings.', schema: readInputMapSchema, handler: (root) => handleReadInputMap(root) });
  registry.register({ name: 'write_project_config', description: 'Write a config value to project.godot.', schema: writeProjectConfigSchema, handler: handleWriteProjectConfig });
  registry.register({ name: 'read_export_presets', description: 'Read export presets from export_presets.cfg.', schema: readExportPresetsSchema, handler: (root) => handleReadExportPresets(root) });
  registry.register({ name: 'delete_file', description: 'Delete a file with .bak backup.', schema: deleteFileSchema, handler: handleDeleteFile });
  registry.register({ name: 'move_file', description: 'Move/rename a file within project.', schema: moveFileSchema, handler: handleMoveFile });
  registry.register({ name: 'generate_project_report', description: 'Generate comprehensive project overview.', schema: generateProjectReportSchema, handler: (root) => handleGenerateProjectReport(root) });
  registry.register({ name: 'list_autoloads', description: 'List all autoload singletons.', schema: listAutoloadsSchema, handler: (root) => handleListAutoloads(root) });
  registry.register({ name: 'add_autoload', description: 'Add an autoload entry.', schema: addAutoloadSchema, handler: handleAddAutoload });
  registry.register({ name: 'remove_autoload', description: 'Remove an autoload entry.', schema: removeAutoloadSchema, handler: handleRemoveAutoload });
  registry.register({ name: 'find_unused_assets', description: 'Find orphaned project files.', schema: findUnusedAssetsSchema, handler: (root) => handleFindUnusedAssets(root) });
  registry.register({ name: 'validate_project', description: 'Validate project for broken refs, empty UIDs.', schema: validateProjectSchema, handler: (root) => handleValidateProject(root) });
  registry.register({ name: 'list_groups', description: 'List all node groups across scenes.', schema: listGroupsSchema, handler: (root) => handleListGroups(root) });
  registry.register({ name: 'duplicate_scene', description: 'Duplicate a scene file.', schema: duplicateSceneSchema, handler: handleDuplicateScene });
  registry.register({ name: 'duplicate_resource', description: 'Duplicate a .tres resource.', schema: duplicateResourceSchema, handler: handleDuplicateResource });
  registry.register({ name: 'create_directory', description: 'Create a directory in project.', schema: createDirectorySchema, handler: handleCreateDirectory });
  registry.register({ name: 'write_input_action', description: 'Create a new input action.', schema: writeInputActionSchema, handler: handleWriteInputAction });
  registry.register({ name: 'remove_input_action', description: 'Remove an input action.', schema: removeInputActionSchema, handler: handleRemoveInputAction });
  registry.register({ name: 'add_input_binding', description: 'Add key/mouse/joypad binding to action.', schema: addInputBindingSchema, handler: handleAddInputBinding });

  // Scene (21)
  registry.register({ name: 'read_scene', description: 'Read a .tscn scene file.', schema: readSceneSchema, handler: handleReadScene });
  registry.register({ name: 'create_scene', description: 'Create a new scene from template.', schema: createSceneSchema, handler: handleCreateScene });
  registry.register({ name: 'edit_scene', description: 'Apply batch operations to a scene.', schema: editSceneSchema, handler: handleEditScene });
  registry.register({ name: 'add_node', description: 'Add a node to a scene.', schema: addNodeSchema, handler: handleAddNode });
  registry.register({ name: 'remove_node', description: 'Remove a node from a scene.', schema: removeNodeSchema, handler: handleRemoveNode });
  registry.register({ name: 'modify_node', description: 'Modify node properties or rename.', schema: modifyNodeSchema, handler: handleModifyNode });
  registry.register({ name: 'clone_node', description: 'Deep-clone a node in a scene.', schema: cloneNodeSchema, handler: handleCloneNode });
  registry.register({ name: 'connect_signal', description: 'Connect a signal between nodes.', schema: connectSignalSchema, handler: handleConnectSignal });
  registry.register({ name: 'disconnect_signal', description: 'Disconnect a signal.', schema: disconnectSignalSchema, handler: handleDisconnectSignal });
  registry.register({ name: 'set_node_position', description: 'Set node position (2D/3D auto-detect).', schema: setNodePositionSchema, handler: handleSetNodePosition });
  registry.register({ name: 'set_node_rotation', description: 'Set node rotation (2D/3D).', schema: setNodeRotationSchema, handler: handleSetNodeRotation });
  registry.register({ name: 'set_node_scale', description: 'Set node scale (2D/3D).', schema: setNodeScaleSchema, handler: handleSetNodeScale });
  registry.register({ name: 'transform_node', description: 'Apply a combined transform (position, rotation, scale) to a node in a scene.', schema: transformNodeSchema, handler: handleTransformNode });
  registry.register({ name: 'list_scenes', description: 'List all .tscn scene files.', schema: listScenesSchema, handler: handleListScenes });
  registry.register({ name: 'scene_dependency_graph', description: 'Analyze inter-scene dependencies.', schema: sceneDependencyGraphSchema, handler: (root) => handleSceneDependencyGraph(root) });
  registry.register({ name: 'find_nodes_in_scenes', description: 'Search nodes across scenes by type/property.', schema: findNodesInScenesSchema, handler: handleFindNodesInScenes });
  registry.register({ name: 'search_scene_content', description: 'Full-text search in .tscn content.', schema: searchSceneContentSchema, handler: handleSearchSceneContent });
  registry.register({ name: 'list_ui_nodes', description: 'List Control-derived UI nodes.', schema: listUiNodesSchema, handler: handleListUiNodes });
  registry.register({ name: 'rename_node', description: 'Rename a node in a scene.', schema: renameNodeSchema, handler: handleRenameNode });
  registry.register({ name: 'attach_script', description: 'Attach a script to a node.', schema: attachScriptSchema, handler: handleAttachScript });
  registry.register({ name: 'set_collision_shape', description: 'Set collision shape for CollisionShape node.', schema: setCollisionShapeSchema, handler: handleSetCollisionShape });
  registry.register({ name: 'load_sprite', description: 'Load a texture onto a Sprite2D node.', schema: loadSpriteSchema, handler: handleLoadSprite });

  // Script + Shader (19)
  registry.register({ name: 'read_script', description: 'Read a script file with line numbers.', schema: readScriptSchema, handler: handleReadScript });
  registry.register({ name: 'write_script', description: 'Write content to a script file.', schema: writeScriptSchema, handler: handleWriteScript });
  registry.register({ name: 'create_script', description: 'Create a new script from template.', schema: createScriptSchema, handler: handleCreateScript });
  registry.register({ name: 'list_scripts', description: 'List all script files grouped by type.', schema: listScriptsSchema, handler: handleListScripts });
  registry.register({ name: 'read_shader', description: 'Read a .gdshader file.', schema: readShaderSchema, handler: handleReadShader });
  registry.register({ name: 'create_shader', description: 'Create a new .gdshader from template.', schema: createShaderSchema, handler: handleCreateShader });
  registry.register({ name: 'list_shaders', description: 'List all .gdshader files.', schema: listShadersSchema, handler: handleListShaders });
  registry.register({ name: 'write_shader', description: 'Write content to a .gdshader.', schema: writeShaderSchema, handler: handleWriteShader });
  registry.register({ name: 'validate_script', description: 'Validate GDScript for common issues.', schema: validateScriptSchema, handler: handleValidateScript });
  registry.register({ name: 'validate_shader', description: 'Validate .gdshader for syntax issues (shader_type, braces, declarations).', schema: validateShaderSchema, handler: handleValidateShader });
  registry.register({ name: 'compile_shader', description: 'Compile (reimport) a .gdshader via Godot editor or local validation.', schema: compileShaderSchema, handler: handleCompileShader });
  registry.register({ name: 'read_script_structure', description: 'Analyze GDScript structure.', schema: readScriptStructureSchema, handler: handleReadScriptStructure });
  registry.register({ name: 'search_in_scripts', description: 'Search in scripts with function context.', schema: searchInScriptsSchema, handler: handleSearchInScripts });
  registry.register({ name: 'list_visual_shaders', description: 'List VisualShader graph files.', schema: listVisualShadersSchema, handler: handleListVisualShaders });
  registry.register({ name: 'read_visual_shader', description: 'Read a VisualShader graph.', schema: readVisualShaderSchema, handler: handleReadVisualShader });
  registry.register({ name: 'read_shader_include', description: 'Read a .gdshaderinc file.', schema: readShaderIncludeSchema, handler: handleReadShaderInclude });
  registry.register({ name: 'create_shader_include', description: 'Create a .gdshaderinc file.', schema: createShaderIncludeSchema, handler: handleCreateShaderInclude });
  registry.register({ name: 'list_shader_includes', description: 'List all .gdshaderinc files.', schema: listShaderIncludesSchema, handler: handleListShaderIncludes });
  registry.register({ name: 'add_script_function', description: 'Append a function to GDScript.', schema: addScriptFunctionSchema, handler: handleAddScriptFunction });
  registry.register({ name: 'add_script_signal', description: 'Add a signal declaration to GDScript.', schema: addScriptSignalSchema, handler: handleAddScriptSignal });
  registry.register({ name: 'add_script_export', description: 'Add @export variable to GDScript.', schema: addScriptExportSchema, handler: handleAddScriptExport });

  // Resource (8)
  registry.register({ name: 'read_resource', description: 'Read a .tres resource file.', schema: readResourceSchema, handler: handleReadResource });
  registry.register({ name: 'list_resources', description: 'List all resource files.', schema: listResourcesSchema, handler: handleListResources });
  registry.register({ name: 'create_resource', description: 'Create a resource from template.', schema: createResourceSchema, handler: handleCreateResource });
  registry.register({ name: 'write_resource', description: 'Write properties to a resource.', schema: writeResourceSchema, handler: handleWriteResource });
  registry.register({ name: 'list_materials', description: 'List materials grouped by type.', schema: listMaterialsSchema, handler: handleListMaterials });
  registry.register({ name: 'read_material', description: 'Read material with PBR formatting.', schema: readMaterialSchema, handler: handleReadMaterial });
  registry.register({ name: 'set_material_param', description: 'Set a single material parameter.', schema: setMaterialParamSchema, handler: handleSetMaterialParam });
  registry.register({ name: 'read_theme', description: 'Read Theme resource with type-aware grouping.', schema: readThemeSchema, handler: handleReadTheme });

  // Godot Engine (9)
  registry.register({ name: 'get_godot_version', description: 'Detect installed Godot version.', schema: getGodotVersionSchema, handler: () => handleGetGodotVersion() });
  registry.register({ name: 'launch_editor', description: 'Launch Godot editor with project.', schema: launchEditorSchema, handler: handleLaunchEditor });
  registry.register({ name: 'run_project', description: 'Run the Godot project.', schema: runProjectSchema, handler: handleRunProject });
  registry.register({ name: 'monitor_output', description: 'Read Godot process output.', schema: monitorOutputSchema, handler: (_, args) => handleMonitorOutput(args) });
  registry.register({ name: 'export_project', description: 'Export project via Godot CLI preset.', schema: exportProjectSchema, handler: handleExportProject });
  registry.register({ name: 'capture_screenshot', description: 'Capture screenshot of running game.', schema: captureScreenshotSchema, handler: handleCaptureScreenshot });
  registry.register({ name: 'stop_project', description: 'Stop all running Godot processes.', schema: stopProjectSchema, handler: () => handleStopProject() });
  registry.register({ name: 'is_editor_running', description: 'Check if Godot editor is running.', schema: isEditorRunningSchema, handler: () => handleIsEditorRunning() });
  registry.register({ name: 'list_projects', description: 'Scan directory for Godot projects.', schema: listProjectsSchema, handler: handleListProjects });

  // Editor (12)
  registry.register({ name: 'editor_get_selection', description: 'Get selected nodes in editor.', schema: editorGetSelectionSchema, handler: () => handleEditorGetSelection() });
  registry.register({ name: 'editor_set_selection', description: 'Select node in editor.', schema: editorSetSelectionSchema, handler: (_, args) => handleEditorSetSelection(args) });
  registry.register({ name: 'editor_play', description: 'Play project from editor.', schema: editorPlaySchema, handler: () => handleEditorPlay() });
  registry.register({ name: 'editor_stop', description: 'Stop playing in editor.', schema: editorStopSchema, handler: () => handleEditorStop() });
  registry.register({ name: 'editor_undo', description: 'Undo last editor action.', schema: editorUndoSchema, handler: () => handleEditorUndo() });
  registry.register({ name: 'editor_redo', description: 'Redo last undone action.', schema: editorRedoSchema, handler: () => handleEditorRedo() });
  registry.register({ name: 'editor_save', description: 'Save current scene in editor.', schema: editorSaveSchema, handler: () => handleEditorSave() });
  registry.register({ name: 'editor_get_open_scene', description: 'Get currently open scene path.', schema: editorGetOpenSceneSchema, handler: () => handleEditorGetOpenScene() });
  registry.register({ name: 'editor_open_asset', description: 'Open an asset in editor.', schema: editorOpenAssetSchema, handler: (_, args) => handleEditorOpenAsset(args) });
  registry.register({ name: 'editor_get_info', description: 'Get editor status info.', schema: editorGetInfoSchema, handler: () => handleEditorGetInfo() });
  registry.register({ name: 'editor_read_current_scene', description: 'Read live editor scene tree.', schema: editorReadCurrentSceneSchema, handler: () => handleEditorReadCurrentScene() });
  registry.register({ name: 'editor_reload_scene', description: 'Save and reload current scene.', schema: editorReloadSceneSchema, handler: () => handleEditorReloadScene() });
  registry.register({ name: 'editor_add_node', description: 'Add a node to the currently open scene in editor.', schema: editorAddNodeSchema, handler: (_, args) => handleEditorAddNode(args) });
  registry.register({ name: 'editor_remove_node', description: 'Remove a node from the currently open scene.', schema: editorRemoveNodeSchema, handler: (_, args) => handleEditorRemoveNode(args) });
  registry.register({ name: 'editor_get_node_properties', description: 'Read all editor-visible properties of a node.', schema: editorGetNodePropertiesSchema, handler: (_, args) => handleEditorGetNodeProperties(args) });
  registry.register({ name: 'editor_set_node_properties', description: 'Set multiple properties on a node at once.', schema: editorSetNodePropertiesSchema, handler: (_, args) => handleEditorSetNodeProperties(args) });
  registry.register({ name: 'editor_rename_node', description: 'Rename a node in the editor.', schema: editorRenameNodeSchema, handler: (_, args) => handleEditorRenameNode(args) });
  registry.register({ name: 'editor_duplicate_node', description: 'Duplicate a node with children, scripts, and signals.', schema: editorDuplicateNodeSchema, handler: (_, args) => handleEditorDuplicateNode(args) });
  registry.register({ name: 'editor_reparent_node', description: 'Move a node to a new parent.', schema: editorReparentNodeSchema, handler: (_, args) => handleEditorReparentNode(args) });
  registry.register({ name: 'editor_move_node', description: 'Move a 2D/3D node to a new position.', schema: editorMoveNodeSchema, handler: (_, args) => handleEditorMoveNode(args) });
  registry.register({ name: 'editor_run_specific_scene', description: 'Run a specific scene (not just main).', schema: editorRunSpecificSceneSchema, handler: (_, args) => handleEditorRunSpecificScene(args) });
  registry.register({ name: 'editor_run_gdscript', description: 'Execute arbitrary GDScript code in editor context.', schema: editorRunGdscriptSchema, handler: (_, args) => handleEditorRunGdscript(args) });
  registry.register({ name: 'editor_create_script', description: 'Create and open a new GDScript in the editor.', schema: editorCreateScriptSchema, handler: (_, args) => handleEditorCreateScript(args) });
  registry.register({ name: 'editor_attach_script', description: 'Attach a script to a node in the editor.', schema: editorAttachScriptSchema, handler: (_, args) => handleEditorAttachScript(args) });
  registry.register({ name: 'editor_set_breakpoint', description: 'Set a breakpoint in a script.', schema: editorSetBreakpointSchema, handler: (_, args) => handleEditorSetBreakpoint(args) });
  registry.register({ name: 'editor_remove_breakpoint', description: 'Remove a breakpoint from a script.', schema: editorRemoveBreakpointSchema, handler: (_, args) => handleEditorRemoveBreakpoint(args) });
  registry.register({ name: 'editor_get_breakpoints', description: 'List all breakpoints.', schema: editorGetBreakpointsSchema, handler: () => handleEditorGetBreakpoints() });
  registry.register({ name: 'editor_save_all', description: 'Save all open scenes.', schema: editorSaveAllSchema, handler: () => handleEditorSaveAll() });
  registry.register({ name: 'editor_focus', description: 'Bring the Godot editor window to the foreground.', schema: editorFocusSchema, handler: () => handleEditorFocus() });
  registry.register({ name: 'editor_open_dock', description: 'Open a dock: filesystem, inspector, scene, output.', schema: editorOpenDockSchema, handler: (_, args) => handleEditorOpenDock(args) });
  registry.register({ name: 'editor_list_filesystem', description: 'List files and directories in the editor filesystem.', schema: editorListFilesystemSchema, handler: (_, args) => handleEditorListFilesystem(args) });
  registry.register({ name: 'editor_health_check', description: 'Check if the Godot editor plugin is reachable.', schema: editorHealthCheckSchema, handler: () => handleEditorHealthCheck() });
  registry.register({ name: 'editor_delete_selected', description: 'Delete currently selected nodes.', schema: editorDeleteSelectedSchema, handler: () => handleEditorDeleteSelected() });
  registry.register({ name: 'editor_get_rect', description: 'Get editor window dimensions.', schema: editorGetRectSchema, handler: () => handleEditorGetRect() });
  registry.register({ name: 'editor_show_in_filesystem', description: 'Reveal a file in the FileSystem dock.', schema: editorShowInFilesystemSchema, handler: (_, args) => handleEditorShowInFilesystem(args) });
  registry.register({ name: 'editor_create_scene', description: 'Create and open a new scene in the editor.', schema: editorCreateSceneSchema, handler: (_, args) => handleEditorCreateScene(args) });
  registry.register({ name: 'editor_instantiate_scene', description: 'Instantiate a PackedScene into the current scene.', schema: editorInstantiateSceneSchema, handler: (_, args) => handleEditorInstantiateScene(args) });
  registry.register({ name: 'editor_set_main_scene', description: 'Set the project main scene.', schema: editorSetMainSceneSchema, handler: (_, args) => handleEditorSetMainScene(args) });
  registry.register({ name: 'editor_debug_continue', description: 'Resume execution in debugger.', schema: editorDebugContinueSchema, handler: () => handleEditorDebugContinue() });
  registry.register({ name: 'editor_debug_step', description: 'Step into next line in debugger.', schema: editorDebugStepSchema, handler: () => handleEditorDebugStep() });
  registry.register({ name: 'editor_debug_step_over', description: 'Step over current line in debugger.', schema: editorDebugStepOverSchema, handler: () => handleEditorDebugStepOver() });
  registry.register({ name: 'editor_debug_break', description: 'Stop execution (break) in debugger.', schema: editorDebugBreakSchema, handler: () => handleEditorDebugBreak() });
  registry.register({ name: 'editor_get_stack_trace', description: 'Get current call stack from debugger.', schema: editorGetStackTraceSchema, handler: () => handleEditorGetStackTrace() });
  registry.register({ name: 'editor_get_debug_variables', description: 'Get local variables from debugger.', schema: editorGetDebugVariablesSchema, handler: () => handleEditorGetDebugVariables() });
  registry.register({ name: 'editor_evaluate_expression', description: 'Evaluate a GDScript expression in debugger/editor context.', schema: editorEvaluateExpressionSchema, handler: (_, args) => handleEditorEvaluateExpression(args) });
  registry.register({ name: 'editor_get_editor_setting', description: 'Read an editor preference value.', schema: editorGetEditorSettingSchema, handler: (_, args) => handleEditorGetEditorSetting(args) });
  registry.register({ name: 'editor_set_editor_setting', description: 'Set an editor preference.', schema: editorSetEditorSettingSchema, handler: (_, args) => handleEditorSetEditorSetting(args) });
  registry.register({ name: 'editor_get_project_setting', description: 'Read a project setting via editor API.', schema: editorGetProjectSettingSchema, handler: (_, args) => handleEditorGetProjectSetting(args) });
  registry.register({ name: 'editor_set_project_setting', description: 'Set a project setting via editor API (auto-saves).', schema: editorSetProjectSettingSchema, handler: (_, args) => handleEditorSetProjectSetting(args) });
  registry.register({ name: 'editor_connect_signal', description: 'Connect a signal between nodes in the editor.', schema: editorConnectSignalSchema, handler: (_, args) => handleEditorConnectSignal(args) });
  registry.register({ name: 'editor_disconnect_signal', description: 'Disconnect a signal between nodes.', schema: editorDisconnectSignalSchema, handler: (_, args) => handleEditorDisconnectSignal(args) });
  registry.register({ name: 'editor_list_node_signals', description: 'List signals and their connections on a node.', schema: editorListNodeSignalsSchema, handler: (_, args) => handleEditorListNodeSignals(args) });
  registry.register({ name: 'editor_get_scene_changes', description: 'Check if current scene has unsaved changes.', schema: editorGetSceneChangesSchema, handler: () => handleEditorGetSceneChanges() });
  registry.register({ name: 'editor_get_recent_scenes', description: 'List recently opened scene paths.', schema: editorGetRecentScenesSchema, handler: () => handleEditorGetRecentScenes() });
  registry.register({ name: 'editor_get_project_directory', description: 'Get project res:// and user:// paths.', schema: editorGetProjectDirectorySchema, handler: () => handleEditorGetProjectDirectory() });
  registry.register({ name: 'editor_simulate_key', description: 'Simulate a key press in the editor (e.g. "F5" to run, "Ctrl+S" to save).', schema: editorSimulateKeySchema, handler: (_, args) => handleEditorSimulateKey(args) });
  registry.register({ name: 'editor_get_plugin_list', description: 'List all installed editor plugins with enabled state.', schema: editorGetPluginListSchema, handler: () => handleEditorGetPluginList() });
  registry.register({ name: 'editor_enable_plugin', description: 'Enable a named editor plugin.', schema: editorEnablePluginSchema, handler: (_, args) => handleEditorEnablePlugin(args) });
  registry.register({ name: 'editor_disable_plugin', description: 'Disable a named editor plugin.', schema: editorDisablePluginSchema, handler: (_, args) => handleEditorDisablePlugin(args) });
  registry.register({ name: 'editor_take_screenshot', description: 'Capture the editor viewport as a PNG.', schema: editorTakeScreenshotSchema, handler: (_, args) => handleEditorTakeScreenshot(args) });
  registry.register({ name: 'editor_get_class_list', description: 'List all Godot classes, optionally filtered.', schema: editorGetClassListSchema, handler: (_, args) => handleEditorGetClassList(args) });
  registry.register({ name: 'editor_get_method_list', description: 'List all methods of a Godot class.', schema: editorGetMethodListSchema, handler: (_, args) => handleEditorGetMethodList(args) });
  registry.register({ name: 'editor_get_class_properties', description: 'List all editor-visible properties of a class.', schema: editorGetClassPropertyListSchema, handler: (_, args) => handleEditorGetClassPropertyList(args) });
  registry.register({ name: 'editor_get_class_signals', description: 'List all signals of a Godot class.', schema: editorGetClassSignalListSchema, handler: (_, args) => handleEditorGetClassSignalList(args) });
  registry.register({ name: 'editor_get_class_doc', description: 'Open Godot documentation for a class in browser.', schema: editorGetClassDocSchema, handler: (_, args) => handleEditorGetClassDoc(args) });
  registry.register({ name: 'editor_search_help', description: 'Search Godot documentation in browser.', schema: editorSearchHelpSchema, handler: (_, args) => handleEditorSearchHelp(args) });
  registry.register({ name: 'editor_create_folder', description: 'Create a directory in the project via editor filesystem.', schema: editorCreateFolderSchema, handler: (_, args) => handleEditorCreateFolder(args) });
  registry.register({ name: 'editor_delete_asset', description: 'Delete a file or folder via editor.', schema: editorDeleteAssetSchema, handler: (_, args) => handleEditorDeleteAsset(args) });
  registry.register({ name: 'editor_rename_asset', description: 'Rename a file via editor filesystem.', schema: editorRenameAssetSchema, handler: (_, args) => handleEditorRenameAsset(args) });
  registry.register({ name: 'editor_move_asset', description: 'Move a file to a new location via editor.', schema: editorMoveAssetSchema, handler: (_, args) => handleEditorMoveAsset(args) });
  registry.register({ name: 'editor_duplicate_asset', description: 'Duplicate a file via editor filesystem.', schema: editorDuplicateAssetSchema, handler: (_, args) => handleEditorDuplicateAsset(args) });
  registry.register({ name: 'editor_get_camera', description: 'Get the 3D editor viewport camera position.', schema: editorGetEditorCameraSchema, handler: () => handleEditorGetEditorCamera() });
  registry.register({ name: 'editor_set_camera', description: 'Set the 3D editor viewport camera position.', schema: editorSetEditorCameraSchema, handler: (_, args) => handleEditorSetEditorCamera(args) });
  registry.register({ name: 'editor_toggle_grid', description: 'Toggle 3D grid visibility.', schema: editorToggleGridSchema, handler: () => handleEditorToggleGrid() });
  registry.register({ name: 'editor_toggle_snap', description: 'Toggle 3D snap mode.', schema: editorToggleSnapSchema, handler: () => handleEditorToggleSnap() });
  registry.register({ name: 'editor_get_autoloads', description: 'List autoload singletons via editor API.', schema: editorGetAutoloadListSchema, handler: () => handleEditorGetAutoloadList() });
  registry.register({ name: 'editor_add_autoload', description: 'Add an autoload singleton via editor API.', schema: editorAddAutoloadSchema, handler: (_, args) => handleEditorAddAutoload(args) });
  registry.register({ name: 'editor_remove_autoload', description: 'Remove an autoload singleton via editor API.', schema: editorRemoveAutoloadSchema, handler: (_, args) => handleEditorRemoveAutoload(args) });
  registry.register({ name: 'editor_get_input_map', description: 'Read the Input Map via editor API.', schema: editorGetInputMapSchema, handler: () => handleEditorGetInputMap() });
  registry.register({ name: 'editor_add_input_action', description: 'Add an input action via editor API.', schema: editorAddInputActionSchema, handler: (_, args) => handleEditorAddInputAction(args) });
  registry.register({ name: 'editor_remove_input_action', description: 'Remove an input action via editor API.', schema: editorRemoveInputActionSchema, handler: (_, args) => handleEditorRemoveInputAction(args) });
  registry.register({ name: 'editor_get_errors', description: 'Get current editor error/log list.', schema: editorGetErrorListSchema, handler: () => handleEditorGetErrorList() });
  registry.register({ name: 'editor_clear_errors', description: 'Clear the editor error list.', schema: editorClearErrorsSchema, handler: () => handleEditorClearErrors() });
  registry.register({ name: 'editor_reimport_asset', description: 'Force reimport of an asset.', schema: editorReimportAssetSchema, handler: (_, args) => handleEditorReimportAsset(args) });
  registry.register({ name: 'editor_bake_lightmaps', description: 'Trigger lightmap baking.', schema: editorBakeLightmapsSchema, handler: () => handleEditorBakeLightmaps() });
  registry.register({ name: 'editor_bake_navigation', description: 'Bake navigation meshes for all NavigationRegion nodes in current scene.', schema: editorBakeNavigationSchema, handler: () => handleEditorBakeNavigation() });
  registry.register({ name: 'editor_get_running_scene_tree', description: 'Get the live scene tree while the game is running.', schema: editorGetRunningSceneTreeSchema, handler: () => handleEditorGetRunningSceneTree() });
  registry.register({ name: 'editor_get_performance', description: 'Get FPS, draw calls, memory usage while game is running.', schema: editorGetPerformanceMonitorsSchema, handler: () => handleEditorGetPerformanceMonitors() });
  registry.register({ name: 'editor_get_dependencies', description: 'Get all resource dependencies for a file.', schema: editorGetDependencyListSchema, handler: (_, args) => handleEditorGetDependencyList(args) });

  // Visual Shader Graph Tools
  registry.register({ name: 'create_visual_shader', description: 'Create a new VisualShader .tres graph file.', schema: createVisualShaderSchema, handler: handleCreateVisualShader });
  registry.register({ name: 'add_shader_graph_node', description: 'Add a node to a VisualShader graph. 40+ node types available (constants, math, textures, effects).', schema: addShaderGraphNodeSchema, handler: handleAddShaderGraphNode });
  registry.register({ name: 'remove_shader_graph_node', description: 'Remove a node from a VisualShader graph by index.', schema: removeShaderGraphNodeSchema, handler: handleRemoveShaderGraphNode });
  registry.register({ name: 'connect_shader_graph_nodes', description: 'Connect two node ports in a VisualShader graph.', schema: connectShaderGraphNodesSchema, handler: handleConnectShaderGraphNodes });
  registry.register({ name: 'disconnect_shader_graph_nodes', description: 'Disconnect two node ports in a VisualShader graph.', schema: disconnectShaderGraphNodesSchema, handler: handleDisconnectShaderGraphNodes });
  registry.register({ name: 'set_shader_node_param', description: 'Set a parameter on a VisualShader node (constant, expression, operator, etc.).', schema: setShaderNodeParamSchema, handler: handleSetShaderNodeParam });
  registry.register({ name: 'list_shader_node_types', description: 'List all VisualShader node types organized by category with input/output counts.', schema: listShaderNodeTypesSchema, handler: (_, args) => handleListShaderNodeTypes(args) });
  registry.register({ name: 'get_shader_node_defaults', description: 'Get default ports and parameters for a specific VisualShader node type.', schema: getShaderNodeDefaultsSchema, handler: (root, args) => handleGetShaderNodeDefaults(root, args) });

  // Mesh Primitives & Physics Types
  registry.register({ name: 'create_mesh_primitive', description: 'Create 3D mesh resource: Box, Capsule, Cylinder, Plane, Sphere, Torus, etc. (11 types).', schema: createMeshPrimitiveSchema, handler: handleCreateMeshPrimitive });
  registry.register({ name: 'create_vehicle_body', description: 'Create a VehicleBody3D with VehicleWheel nodes for car physics.', schema: createVehicleBodySchema, handler: handleCreateVehicleBody });
  registry.register({ name: 'read_vehicle_body', description: 'List VehicleBody3D nodes with wheel counts.', schema: readVehicleBodySchema, handler: handleReadVehicleBody });
  registry.register({ name: 'read_soft_body', description: 'List SoftBody3D nodes with mass and stiffness.', schema: readSoftBodySchema, handler: handleReadSoftBody });

  // 2D Lights
  registry.register({ name: 'read_light_2d', description: 'List PointLight2D/DirectionalLight2D nodes with energy and shadow settings.', schema: readLight2dSchema, handler: handleReadLight2d });
  registry.register({ name: 'set_light_2d_param', description: 'Set a parameter on a 2D light node.', schema: setLight2dParamSchema, handler: handleSetLight2dParam });

  // Camera & Scene Mechanics
  registry.register({ name: 'create_spring_arm', description: 'Create a SpringArm3D for smooth camera follow.', schema: createSpringArmSchema, handler: handleCreateSpringArm });
  registry.register({ name: 'read_spring_arm', description: 'List SpringArm3D nodes with spring length and collision settings.', schema: readSpringArmSchema, handler: handleReadSpringArm });
  registry.register({ name: 'create_camera_attributes', description: 'Create CameraAttributes (Practical or Physical) for 3D camera DOF and auto-exposure.', schema: createCameraAttributesSchema, handler: handleCreateCameraAttributes });

  // Decals & Occluders
  registry.register({ name: 'read_decal', description: 'List Decal nodes with size and texture info.', schema: readDecalSchema, handler: handleReadDecal });
  registry.register({ name: 'read_occluder', description: 'List OccluderInstance3D and OcclusionPolygon2D nodes.', schema: readOccluderSchema, handler: handleReadOccluder });
  registry.register({ name: 'read_marker', description: 'List Marker2D/Marker3D position markers across scenes.', schema: readMarkerSchema, handler: handleReadMarker });

  // Audio
  registry.register({ name: 'read_audio_stream', description: 'Read audio file info: format, size, loop, bitrate from .import config.', schema: readAudioStreamSchema, handler: handleReadAudioStream });
  registry.register({ name: 'read_audio_listener', description: 'List AudioListener2D/3D nodes for spatial audio positioning.', schema: readAudioListenerSchema, handler: handleReadAudioListener });

  // SpriteFrames
  registry.register({ name: 'create_sprite_frames', description: 'Create a SpriteFrames .tres resource with named animations.', schema: createSpriteFramesSchema, handler: handleCreateSpriteFrames });
  registry.register({ name: 'read_sprite_frames', description: 'List AnimatedSprite nodes and their SpriteFrames resources.', schema: readSpriteFramesSchema, handler: handleReadSpriteFrames });

  // GridMap
  registry.register({ name: 'read_grid_map', description: 'List GridMap nodes with cell size and mesh library references.', schema: readGridMapSchema, handler: handleReadGridMap });
  registry.register({ name: 'create_grid_map', description: 'Create a GridMap node for 3D tile-based level design.', schema: createGridMapSchema, handler: handleCreateGridMap });

  // Animation (10)
  registry.register({ name: 'list_animations', description: 'List AnimationPlayers and animations.', schema: listAnimationsSchema, handler: handleListAnimations });
  registry.register({ name: 'read_animation', description: 'Read animation tracks and keyframes.', schema: readAnimationSchema, handler: handleReadAnimation });
  registry.register({ name: 'create_animation', description: 'Create Animation .tres resource.', schema: createAnimationSchema, handler: handleCreateAnimation });
  registry.register({ name: 'set_animation_param', description: 'Set animation parameter.', schema: setAnimationParamSchema, handler: handleSetAnimationParam });
  registry.register({ name: 'add_animation_library', description: 'Add animation library to player.', schema: addAnimationLibrarySchema, handler: handleAddAnimationLibrary });
  registry.register({ name: 'add_animation_track', description: 'Add track to animation.', schema: addAnimationTrackSchema, handler: handleAddAnimationTrack });
  registry.register({ name: 'set_keyframe', description: 'Set keyframe on track.', schema: setKeyframeSchema, handler: handleSetKeyframe });
  registry.register({ name: 'remove_animation_track', description: 'Remove track from animation.', schema: removeAnimationTrackSchema, handler: handleRemoveAnimationTrack });
  registry.register({ name: 'read_animation_tree', description: 'Read AnimationTree with state machine.', schema: readAnimationTreeSchema, handler: handleReadAnimationTree });
  registry.register({ name: 'set_animation_tree_param', description: 'Set AnimationTree parameter.', schema: setAnimationTreeParamSchema, handler: handleSetAnimationTreeParam });

  // Import (3)
  registry.register({ name: 'read_import_config', description: 'Read .import file config.', schema: readImportConfigSchema, handler: handleReadImportConfig });
  registry.register({ name: 'list_import_files', description: 'List .import files grouped by type.', schema: listImportFilesSchema, handler: handleListImportFiles });
  registry.register({ name: 'write_import_config', description: 'Write import settings.', schema: writeImportConfigSchema, handler: handleWriteImportConfig });

  // Environment (4)
  registry.register({ name: 'read_environment', description: 'Read Environment resource.', schema: readEnvironmentSchema, handler: handleReadEnvironment });
  registry.register({ name: 'list_environments', description: 'List Environment resources.', schema: listEnvironmentsSchema, handler: handleListEnvironments });
  registry.register({ name: 'create_environment', description: 'Create Environment from preset.', schema: createEnvironmentSchema, handler: handleCreateEnvironment });
  registry.register({ name: 'set_environment_param', description: 'Set environment parameter.', schema: setEnvironmentParamSchema, handler: handleSetEnvironmentParam });

  // Audio (7)
  registry.register({ name: 'read_audio_bus_layout', description: 'Read AudioBusLayout.', schema: readAudioBusLayoutSchema, handler: handleReadAudioBusLayout });
  registry.register({ name: 'list_audio_files', description: 'List audio files by format.', schema: listAudioFilesSchema, handler: handleListAudioFiles });
  registry.register({ name: 'create_audio_bus_layout', description: 'Create AudioBusLayout.', schema: createAudioBusLayoutSchema, handler: handleCreateAudioBusLayout });
  registry.register({ name: 'add_audio_bus', description: 'Add audio bus to layout.', schema: addAudioBusSchema, handler: handleAddAudioBus });
  registry.register({ name: 'remove_audio_bus', description: 'Remove audio bus.', schema: removeAudioBusSchema, handler: handleRemoveAudioBus });
  registry.register({ name: 'add_bus_effect', description: 'Add effect to audio bus.', schema: addBusEffectSchema, handler: handleAddBusEffect });
  registry.register({ name: 'set_bus_volume', description: 'Set bus volume in dB.', schema: setBusVolumeSchema, handler: handleSetBusVolume });

  // Physics (4)
  registry.register({ name: 'list_physics_materials', description: 'List PhysicsMaterials.', schema: listPhysicsMaterialsSchema, handler: handleListPhysicsMaterials });
  registry.register({ name: 'read_physics_material', description: 'Read PhysicsMaterial.', schema: readPhysicsMaterialSchema, handler: handleReadPhysicsMaterial });
  registry.register({ name: 'create_physics_material', description: 'Create PhysicsMaterial.', schema: createPhysicsMaterialSchema, handler: handleCreatePhysicsMaterial });
  registry.register({ name: 'read_collision_layers', description: 'Read collision layer names.', schema: readCollisionLayersSchema, handler: (root) => handleReadCollisionLayers(root) });

  // Inspector (5)
  registry.register({ name: 'list_cameras', description: 'List Camera nodes.', schema: listCamerasSchema, handler: handleListCameras });
  registry.register({ name: 'read_camera', description: 'Read camera configuration.', schema: readCameraSchema, handler: handleReadCamera });
  registry.register({ name: 'list_lights', description: 'List light nodes.', schema: listLightsSchema, handler: handleListLights });
  registry.register({ name: 'set_light_param', description: 'Set light parameter.', schema: setLightParamSchema, handler: handleSetLightParam });
  registry.register({ name: 'read_particles', description: 'List particle systems.', schema: readParticlesSchema, handler: handleReadParticles });

  // TileMap (3)
  registry.register({ name: 'list_tilesets', description: 'List TileSet resources.', schema: listTilesetsSchema, handler: handleListTilesets });
  registry.register({ name: 'read_tileset', description: 'Read TileSet resource.', schema: readTilesetSchema, handler: handleReadTileset });
  registry.register({ name: 'read_tilemap', description: 'Read TileMapLayer in scene.', schema: readTilemapSchema, handler: handleReadTilemap });

  // Navigation (3)
  registry.register({ name: 'list_nav_regions', description: 'List NavigationRegion nodes.', schema: listNavRegionsSchema, handler: handleListNavRegions });
  registry.register({ name: 'read_nav_region', description: 'Read navigation region.', schema: readNavRegionSchema, handler: handleReadNavRegion });
  registry.register({ name: 'create_nav_mesh', description: 'Create NavigationMesh .tres.', schema: createNavMeshSchema, handler: handleCreateNavMesh });

  // Translation (3)
  registry.register({ name: 'list_translations', description: 'List translation files.', schema: listTranslationsSchema, handler: handleListTranslations });
  registry.register({ name: 'read_translation', description: 'Read translation file.', schema: readTranslationSchema, handler: handleReadTranslation });
  registry.register({ name: 'create_translation', description: 'Create translation CSV.', schema: createTranslationSchema, handler: handleCreateTranslation });

  // Diff (2)
  registry.register({ name: 'diff_scene', description: 'Compare two scene files.', schema: diffSceneSchema, handler: handleDiffScene });
  registry.register({ name: 'diff_resource', description: 'Compare two resource files.', schema: diffResourceSchema, handler: handleDiffResource });

  // Texture (1)
  registry.register({ name: 'read_texture_info', description: 'Read texture asset info.', schema: readTextureInfoSchema, handler: handleReadTextureInfo });

  // Extension/World/C# (3)
  registry.register({ name: 'read_gdextension', description: 'Read .gdextension config.', schema: readGdextensionSchema, handler: handleReadGdextension });
  registry.register({ name: 'list_csproj', description: 'List C# project files.', schema: listCsprojSchema, handler: (root) => handleListCsproj(root) });
  registry.register({ name: 'create_world', description: 'Create World3D .tres.', schema: createWorldSchema, handler: handleCreateWorld });

  // UID (3)
  registry.register({ name: 'get_uid', description: 'Get UID for a file.', schema: getUidSchema, handler: handleGetUid });
  registry.register({ name: 'update_project_uids', description: 'Scan for missing UIDs.', schema: updateProjectUidsSchema, handler: handleUpdateProjectUids });
  registry.register({ name: 'list_missing_uids', description: 'List files missing UIDs.', schema: listMissingUidsSchema, handler: (root) => handleListMissingUids(root) });

  // Joints (3)
  registry.register({ name: 'create_joint', description: 'Create a physics joint.', schema: createJointSchema, handler: handleCreateJoint });
  registry.register({ name: 'set_joint_param', description: 'Set joint parameter.', schema: setJointParamSchema, handler: handleSetJointParam });
  registry.register({ name: 'list_joints', description: 'List physics joints.', schema: listJointsSchema, handler: handleListJoints });

  // 2D Geometry (2)
  registry.register({ name: 'create_collision_polygon', description: 'Create CollisionPolygon2D.', schema: createCollisionPolygonSchema, handler: handleCreateCollisionPolygon });
  registry.register({ name: 'set_shape_points', description: 'Set shape on CollisionShape2D.', schema: setShapePointsSchema, handler: handleSetShapePoints });

  // Rendering (5)
  registry.register({ name: 'read_mesh_instance', description: 'Read MeshInstance properties.', schema: readMeshInstanceSchema, handler: handleReadMeshInstance });
  registry.register({ name: 'set_mesh_surface_material', description: 'Set surface material on MeshInstance.', schema: setMeshSurfaceMaterialSchema, handler: handleSetMeshSurfaceMaterial });
  registry.register({ name: 'read_viewport', description: 'Read Viewport settings.', schema: readViewportSchema, handler: handleReadViewport });
  registry.register({ name: 'read_area', description: 'Read Area2D/3D properties.', schema: readAreaSchema, handler: handleReadArea });
  registry.register({ name: 'read_raycast', description: 'List RayCast/ShapeCast nodes.', schema: readRaycastSchema, handler: handleReadRaycast });

  // Domain (11)
  registry.register({ name: 'read_curve', description: 'Read Curve resource.', schema: readCurveSchema, handler: handleReadCurve });
  registry.register({ name: 'create_curve', description: 'Create Curve .tres.', schema: createCurveSchema, handler: handleCreateCurve });
  registry.register({ name: 'read_gradient', description: 'Read Gradient resource.', schema: readGradientSchema, handler: handleReadGradient });
  registry.register({ name: 'create_gradient', description: 'Create Gradient .tres.', schema: createGradientSchema, handler: handleCreateGradient });
  registry.register({ name: 'list_paths', description: 'List Path2D/3D nodes.', schema: listPathsSchema, handler: handleListPaths });
  registry.register({ name: 'read_path', description: 'Read Path node with curve.', schema: readPathSchema, handler: handleReadPath });
  registry.register({ name: 'list_skeletons', description: 'List Skeleton nodes.', schema: listSkeletonsSchema, handler: handleListSkeletons });
  registry.register({ name: 'read_skeleton', description: 'Read Skeleton bone hierarchy.', schema: readSkeletonSchema, handler: handleReadSkeleton });
  registry.register({ name: 'read_reflection_probe', description: 'List GI probes.', schema: readReflectionProbeSchema, handler: handleReadReflectionProbe });
  registry.register({ name: 'read_multimesh', description: 'List MultiMeshInstance nodes.', schema: { scene_path: z.string().optional().describe('Filter to scene') }, handler: handleReadMultiMesh });
  registry.register({ name: 'create_noise_texture', description: 'Create NoiseTexture2D.', schema: createNoiseTextureSchema, handler: handleCreateNoiseTexture });

  // Node Inspectors (8)
  registry.register({ name: 'read_character_body', description: 'Read CharacterBody properties.', schema: readCharacterBodySchema, handler: handleReadCharacterBody });
  registry.register({ name: 'read_animated_sprite', description: 'Read AnimatedSprite settings.', schema: readAnimatedSpriteSchema, handler: handleReadAnimatedSprite });
  registry.register({ name: 'read_audio_player', description: 'List AudioStreamPlayer nodes.', schema: readAudioPlayerSchema, handler: handleReadAudioPlayer });
  registry.register({ name: 'read_video_player', description: 'List VideoStreamPlayer nodes.', schema: readVideoPlayerSchema, handler: handleReadVideoPlayer });
  registry.register({ name: 'read_parallax', description: 'Read ParallaxBackground layers.', schema: readParallaxSchema, handler: handleReadParallax });
  registry.register({ name: 'read_rich_text', description: 'List RichTextLabel nodes.', schema: readRichTextSchema, handler: handleReadRichText });
  registry.register({ name: 'read_container', description: 'Read Container layout.', schema: readContainerSchema, handler: handleReadContainer });
  registry.register({ name: 'read_tab_container', description: 'Read TabContainer/TabBar.', schema: readTabContainerSchema, handler: handleReadTabContainer });

  // Utility (6)
  registry.register({ name: 'list_all_signals', description: 'List all signal connections across scenes.', schema: listAllSignalsSchema, handler: handleListAllSignals });
  registry.register({ name: 'read_project_icon', description: 'Read project identity.', schema: readProjectIconSchema, handler: (root) => handleReadProjectIcon(root) });
  registry.register({ name: 'read_stylebox', description: 'Read StyleBox resource.', schema: readStyleboxSchema, handler: handleReadStylebox });
  registry.register({ name: 'create_atlas_texture', description: 'Create AtlasTexture .tres.', schema: createAtlasTextureSchema, handler: handleCreateAtlasTexture });
  registry.register({ name: 'list_popups', description: 'List Popup/Window/Dialog nodes.', schema: listPopupsSchema, handler: handleListPopups });
  registry.register({ name: 'generate_cohesion_report', description: 'Project cohesion report.', schema: generateCohesionReportSchema, handler: (root) => handleGenerateCohesionReport(root) });
}
