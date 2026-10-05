// Local-only signaling. Production uses api/stream-signal.js + shared Redis.
// No audio is accepted here: only small JSON presence/SDP/ICE messages.
const express = require('express');
const { createHandler } = require('../server/signaling.cjs');
module.exports = app => {
  app.post('/api/stream-signal', express.json({ limit: '60kb' }), createHandler({ local: true }));
};
