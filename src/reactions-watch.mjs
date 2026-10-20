#!/usr/bin/env node
// Standalone runner for the reaction-marker listener.
//   node src/reactions-watch.mjs
// (In the container the MCP process attaches the marker instead - see mcp.mjs.)
import { connectExisting } from './client.mjs';
import { attachMarker } from './reaction-marker.mjs';

const client = await connectExisting();
attachMarker(client);
const bye = async () => { try { await client.disconnect(); } catch {} process.exit(0); };
process.on('SIGINT', bye); process.on('SIGTERM', bye);
