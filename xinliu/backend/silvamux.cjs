'use strict';

// The pilot profile deliberately enables only the inexpensive output size.
function providersFromEnvironment() {
  const raw = process.env.XINLIU_VIDEO_CREDITS_PER_SECOND;
  const rate = raw?.trim() ? Number(raw) : null;
  return { video: {
    protocol: 'ark-video', baseUrl: 'https://www.silvamux.com',
    keyEnv: 'SILVAMUX_API_KEY', model: 'doubao-seedance-2-0-260128',
    createPath: '/api/v3/contents/generations/tasks',
    statusPath: '/api/v3/contents/generations/tasks/{id}',
    capabilities: ['commerce', 'reference', 'scene', 'dialogue', 'drama'],
    supportedAspects: ['9:16', '16:9', '1:1'], supportedResolutions: ['480p'],
    minDuration: 4, maxDuration: 15, supportsImageDataUri: true,
    supportsAudioReference: true, supportsGarmentReference: true,
    allowedResultOrigins: (process.env.XINLIU_VIDEO_RESULT_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean),
    price: { creditsPerSecond: Number.isFinite(rate) && rate > 0 ? rate : null },
    response: { resultPath: 'content.video_url', failed: ['failed', 'cancelled', 'expired'] }
  } };
}

const { videoSpec, videoPayload } = require('./ark-video.cjs');

module.exports = { providersFromEnvironment, videoSpec, videoPayload };
