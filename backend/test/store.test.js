import test from 'node:test';
import assert from 'node:assert/strict';
import { resetState, createMessage, createServer, createChannel, loadState, seededWorkspace, registerMember } from '../src/store.js';

test('seeded workspace includes text and voice channels', async () => {
  const state = await resetState();
  assert.ok(state.servers.length >= 3);
  assert.ok(state.channels.some((channel) => channel.type === 'text'));
  assert.ok(state.channels.some((channel) => channel.type === 'voice'));
  assert.equal(state.workspace.name, seededWorkspace.workspace.name);
});

test('can create a server, channel and message', async () => {
  await resetState();
  const server = await createServer({ name: 'Support Loop', icon: '◎', description: 'Support team space' });
  const channel = await createChannel({ serverId: server.id, name: 'support', type: 'text' });
  const message = await createMessage({ channelId: channel.id, content: 'Hello from the test harness' });
  const state = await loadState();
  assert.ok(state.servers.find((item) => item.id === server.id));
  assert.ok(state.channels.find((item) => item.id === channel.id));
  assert.equal(message.content, 'Hello from the test harness');
  assert.equal(state.messages.at(-1).id, message.id);
});

test('can register a custom member', async () => {
  await resetState();
  const input = {
    name: '  Alex Test  ',
    role: 'Developer',
    avatarFrom: '#ff0000',
    avatarTo: '#0000ff'
  };
  const member = await registerMember(input);
  assert.equal(member.name, 'Alex Test');
  assert.equal(member.role, 'Developer');
  assert.equal(member.handle, '@alex-test');
  assert.equal(member.avatar.from, '#ff0000');
  
  const state = await loadState();
  assert.ok(state.members.find((m) => m.id === member.id));
});

