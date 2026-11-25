'use strict';

// Merge a server migration once per browser without replacing newer local work.
function mergeWorkspaceImport(target, packet, makeClient) {
  if (!packet || packet.version !== 1 || typeof packet.id !== 'string' || !packet.workspace?.clients) throw new Error('迁移数据格式无效');
  if ((target.appliedMigrations || []).includes(packet.id)) return false;
  const incoming = packet.workspace;
  const hadWork = Object.values(target.clients || {}).some(c => c.projects?.length);
  const merge = (current, additions) => {
    const ids = new Set(current.map(item => item.id));
    for (const item of additions || []) if (item?.id && !ids.has(item.id)) { current.push(item); ids.add(item.id); }
  };
  for (const [clientId, data] of Object.entries(incoming.clients)) {
    if (!/^[a-zA-Z0-9_-]+$/.test(clientId) || ['__proto__', 'constructor', 'prototype'].includes(clientId)) throw new Error('迁移客户标识无效');
    const current = target.clients[clientId] ||= makeClient(data.name);
    for (const key of ['projects', 'assets', 'jobs', 'models', 'garments', 'looks', 'voices', 'knowledge', 'recipes', 'preferences', 'ledger']) {
      current[key] ||= [];
      merge(current[key], data[key]);
    }
    if (!current.reference && data.reference) current.reference = data.reference;
  }
  const source = incoming.collaboration;
  if (source) {
    target.collaboration ||= { actorId: 'member-lin', members: [], campaigns: [], activity: [], notifications: [], activeByClient: {}, demoLoaded: false, limits: { parallel: 4, projectParallel: 2 } };
    for (const key of ['members', 'campaigns', 'activity', 'notifications']) {
      target.collaboration[key] ||= [];
      merge(target.collaboration[key], source[key]);
    }
    target.collaboration.activeByClient ||= {};
    for (const [clientId, campaignId] of Object.entries(source.activeByClient || {})) {
      if (!Object.hasOwn(target.collaboration.activeByClient, clientId)) target.collaboration.activeByClient[clientId] = campaignId;
    }
  }
  if (!hadWork && incoming.activeClient && target.clients[incoming.activeClient]) {
    target.activeClient = incoming.activeClient;
    if (incoming.config) target.config = incoming.config;
  }
  target.appliedMigrations = [...(target.appliedMigrations || []), packet.id];
  return true;
}
if (typeof module !== 'undefined') module.exports = { mergeWorkspaceImport };
