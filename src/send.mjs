#!/usr/bin/env node
// Send a message as the logged-in user.
//   node src/send.mjs "@username" hello there
//   node src/send.mjs "Mary" "good morning"
//   node src/send.mjs -1001234567890 "hi group"
import { withClient, resolveEntity } from './client.mjs';
import { entityName } from './format.mjs';

const [chat, ...rest] = process.argv.slice(2);
if (!chat || rest.length === 0) {
  console.error('usage: node src/send.mjs <chat|@username|id> <message...>');
  process.exit(1);
}
const text = rest.join(' ');

await withClient(async (client) => {
  const entity = await resolveEntity(client, chat);
  await client.sendMessage(entity, { message: text });
  console.log(`sent to "${entityName(entity)}": ${text}`);
});
