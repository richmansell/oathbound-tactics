/** Procedural overworld: public entry points. */
export * from './coords';
export { WorldGen, type WorldTile, type RegionInfo, type Chunk, TERRAINS, PROPS, BIOMES } from './gen';
export { MAIN_GEOGRAPHY, type Geography, type GeoRegion, type GeoRiver, type GeoLake, type GeoSea, type GeoRoad, type SetPieceDef, type GateDef } from './geography';
export { type SetPieceInfo, BUILDERS } from './setpieces';
export { carveBattlefield, type CarveOptions, type CarveResult } from './carve';
export { sampleOverview, shadeSample, TERRAIN_RGB } from './minimap';
export { F_ROAD, F_WATER, F_BLOCKED, F_BRIDGE, F_STAMP } from './tables';
