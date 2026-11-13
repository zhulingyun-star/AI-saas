'use strict';

function videoSpec(config) {
  return { duration: config.duration ?? 4, resolution: config.outputSpec?.resolution || '480p',
    ratio: config.outputSpec?.aspect || '9:16', generate_audio: config.generateAudio === true };
}

function videoPayload(task, provider, assets) {
  const spec = videoSpec(task.input.config);
  const content = [{ type: 'text', text: task.prompt + '\n避免：' + task.strategy.negativePrompt +
    (spec.generate_audio ? '' : '\n仅生成无声画面，台词、配音和音乐留给后期制作。') }];
  for (const asset of assets) {
    const type = asset.role.endsWith('_image') ? 'image_url' : asset.role.endsWith('_video') ? 'video_url' : 'audio_url';
    const role = type === 'image_url' ? 'reference_image' : type === 'video_url' ? 'reference_video' : 'reference_audio';
    content.push({ type, role, [type]: { url: asset.url } });
  }
  return { model: provider.model, content, ...spec };
}

module.exports = { videoSpec, videoPayload };
