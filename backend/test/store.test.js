import test from 'node:test';
import assert from 'node:assert/strict';
import { resetState, createMessage, createServer, createChannel, loadState, seededWorkspace, registerMember, loginAccount, registerAccount } from '../src/store.js';

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

test('can login with a registered account', async () => {
  await resetState();
  const regResult = await registerAccount({
    name: 'Test Login User',
    username: 'testlogin',
    email: 'testlogin@example.com',
    password: 'password123',
    role: 'User',
  });
  assert.ok(regResult.token);

  const loginResult = await loginAccount({ identifier: 'testlogin', password: 'password123' });
  assert.ok(loginResult.token);
  assert.equal(loginResult.user.handle, '@testlogin');
});

test('can register a new authenticated account', async () => {
  await resetState();
  const result = await registerAccount({
    name: 'Casey',
    username: 'casey',
    email: 'casey@example.com',
    password: 'secret123',
    role: 'Guest',
  });

  assert.ok(result.token);
  assert.equal(result.user.handle, '@casey');

  const state = await loadState();
  assert.ok(state.members.find((member) => member.id === 'casey'));
  assert.ok(state.accounts.find((account) => account.username === 'casey'));
});

test('can create a message with attachment', async () => {
  await resetState();
  const server = await createServer({ name: 'Media Channel', icon: '📎', description: 'Upload space' });
  const channel = await createChannel({ serverId: server.id, name: 'files', type: 'text' });
  const attachment = {
    name: 'document.pdf',
    size: 20480,
    type: 'application/pdf',
    dataUrl: 'data:application/pdf;base64,JVBERi0xLjQKJ...'
  };
  const message = await createMessage({
    channelId: channel.id,
    content: '',
    attachment
  });
  
  assert.equal(message.content, '');
  assert.ok(message.attachment);
  assert.equal(message.attachment.name, 'document.pdf');
  assert.equal(message.attachment.size, 20480);
  
  const state = await loadState();
  const savedMsg = state.messages.find(m => m.id === message.id);
  assert.ok(savedMsg);
  assert.ok(savedMsg.attachment);
  assert.equal(savedMsg.attachment.type, 'application/pdf');
});

