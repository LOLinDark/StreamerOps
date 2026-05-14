// Streamlabs to OBS Scene/Source Importer
// Usage: node scripts/import-streamlabs-to-obs.js <streamlabs_export.json> <output_obs_scene.json>
// This script reads a Streamlabs scene/source export (JSON), transforms it to OBS format, and writes an OBS scene collection JSON.

const fs = require('fs');
const path = require('path');

function readStreamlabsExport(filePath) {
  const data = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(data);
}

function transformToOBSFormat(streamlabsData) {
  // TODO: Map Streamlabs scenes/sources to OBS format
  // This is a stub. Actual mapping logic will depend on the Streamlabs export structure.
  // For now, just wrap in a basic OBS scene collection structure.
  return {
    "name": "Imported from Streamlabs",
    "sources": streamlabsData.sources || [],
    "scene_order": streamlabsData.scenes ? streamlabsData.scenes.map(s => s.name) : [],
    "scenes": streamlabsData.scenes || []
  };
}

function writeOBSSceneCollection(obsData, outputPath) {
  fs.writeFileSync(outputPath, JSON.stringify(obsData, null, 2), 'utf-8');
  console.log(`OBS scene collection written to ${outputPath}`);
}

function main() {
  const [,, inputPath, outputPath] = process.argv;
  if (!inputPath || !outputPath) {
    console.error('Usage: node scripts/import-streamlabs-to-obs.js <streamlabs_export.json> <output_obs_scene.json>');
    process.exit(1);
  }
  const streamlabsData = readStreamlabsExport(inputPath);
  const obsData = transformToOBSFormat(streamlabsData);
  writeOBSSceneCollection(obsData, outputPath);
}

if (require.main === module) {
  main();
}
