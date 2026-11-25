'use strict';
const fs = require('node:fs');
const path = require('node:path');
const privateFile = path.join(__dirname, 'silvamux.private.cjs');
const settings = fs.existsSync(privateFile) ? require(privateFile) : {};
function apiKey() { return settings.apiKey || ''; }
function providersFromConfiguration() {
  const text = { id: 'silvamux', credentialSource: 'silvamux-config', protocol: 'openai-chat', baseUrl: 'https://www.silvamux.com', createPath: '/api/v1/chat/completions', model: 'doubao-seed-2-1-pro-260628', supportsImageDataUri: true, maxOutputTokens: 4096 };
  return {
    text: { ...text, price: { fixedCredits: settings.pricing?.text ?? null } },
    vision: { ...text, supportsVideoDataUri: true, maxInlineVideoBytes: 16 * 1024 * 1024, price: { fixedCredits: settings.pricing?.vision ?? null } },
    video: {
      id: 'silvamux', credentialSource: 'silvamux-config', protocol: 'ark-video', baseUrl: 'https://www.silvamux.com',
      model: 'doubao-seedance-2-0-260128', createPath: '/api/v3/contents/generations/tasks', statusPath: '/api/v3/contents/generations/tasks/{id}',
      capabilities: ['commerce', 'reference', 'scene', 'dialogue', 'drama'], supportedAspects: ['9:16', '16:9', '1:1'], supportedResolutions: ['480p'], minDuration: 4, maxDuration: 15,
      supportsImageDataUri: true, supportsAudioReference: true, supportsGarmentReference: true,
      allowedResultOrigins: ['https://ark-acg-cn-beijing.tos-cn-beijing.volces.com'],
      price: { creditsPerSecond: settings.pricing?.videoPerSecond ?? null, referenceVideoCreditsPerSecond: settings.pricing?.referenceVideoPerSecond ?? null, audioCreditsPerSecond: settings.pricing?.audioPerSecond ?? null, source: 'SilvaMux本地业务估价，非实际结算' },
      response: { resultPath: 'content.video_url', failed: ['failed', 'cancelled', 'expired'] }
    }
  };
}
module.exports = { apiKey, providersFromConfiguration, providersFromEnvironment: providersFromConfiguration, ...require('./ark-video.cjs') };
