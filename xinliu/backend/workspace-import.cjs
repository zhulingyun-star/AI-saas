'use strict';
const fs = require('node:fs');
const path = require('node:path');

function readWorkspaceImport(dataRoot) {
  const file = path.join(dataRoot, 'workspace-import.json');
  if (!fs.existsSync(file)) return null;
  const packet = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (packet.version !== 1 || !/^[a-zA-Z0-9_-]{1,100}$/.test(packet.id) || !packet.workspace?.clients || !Array.isArray(packet.files)) throw new Error('Invalid workspace migration');
  for (const media of packet.files) {
    if (typeof media.id !== 'string' || !/^migrate-[a-f0-9]{64}$/.test(media.filename) || !/^(image|video|audio)\/[a-zA-Z0-9.+-]+$/.test(media.type)) throw new Error('Invalid workspace media');
  }
  return packet;
}
module.exports = { readWorkspaceImport };
