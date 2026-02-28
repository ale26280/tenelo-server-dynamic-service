const client = require('prom-client');

// Collect default Node.js metrics with prefix
client.collectDefaultMetrics({ prefix: 'app_' });

const register = client.register;

// SSE metrics
const sseConnectionsGauge = new client.Gauge({ name: 'sse_connections', help: 'Current SSE connections', labelNames: ['canal'] });
const sseConnectionsTotal = new client.Counter({ name: 'sse_connections_total', help: 'Total SSE connections accepted', labelNames: ['canal'] });
const sseConnectionsClosedTotal = new client.Counter({ name: 'sse_connections_closed_total', help: 'Total SSE connections closed', labelNames: ['canal'] });
const sseWriteFailures = new client.Counter({ name: 'sse_write_failures_total', help: 'Total SSE write failures', labelNames: ['canal'] });
const sseKeepaliveSent = new client.Counter({ name: 'sse_keepalive_sent_total', help: 'Total SSE keepalive pings sent', labelNames: ['canal'] });

// Redis connectivity
const redisConnected = new client.Gauge({ name: 'redis_connected', help: 'Redis connection state (1=connected,0=disconnected)' });
const redisPublishFailures = new client.Counter({ name: 'redis_publish_failures_total', help: 'Redis publish failures' });

// Migration and presence events
const migrateSuccess = new client.Counter({ name: 'visualizador_migrate_success_total', help: 'Total successful migrateConnection actions' });
const migrateFail = new client.Counter({ name: 'visualizador_migrate_fail_total', help: 'Total failed migrateConnection attempts' });
const restoredEvents = new client.Counter({ name: 'visualizador_restored_events_total', help: 'Total visualizador restored events published' });

// Pong DB writes
const pongDbWrites = new client.Counter({ name: 'visualizador_pong_db_writes_total', help: 'Total DB writes from visualizador pong (throttled)' });
const pongDbWriteFails = new client.Counter({ name: 'visualizador_pong_db_write_failures_total', help: 'Failed DB writes from visualizador pong' });

module.exports = {
  register,
  // handlers for server to expose metrics
  metricsEndpoint: async (req, res) => {
    try {
      res.setHeader('Content-Type', register.contentType);
      res.end(await register.metrics());
    } catch (e) {
      res.status(500).end(e.message);
    }
  },
  // SSE helpers
  incConnect: (canal) => { try { sseConnectionsTotal.labels(canal || 'unknown').inc(); sseConnectionsGauge.labels(canal || 'unknown').inc(); } catch (e) {} },
  decConnect: (canal) => { try { sseConnectionsClosedTotal.labels(canal || 'unknown').inc(); const g = sseConnectionsGauge.labels(canal || 'unknown'); try { g.dec(); } catch (e) { /* ignore negative */ } } catch (e) {} },
  setConnectionsGauge: (canal, value) => { try { sseConnectionsGauge.labels(canal || 'unknown').set(Number(value)); } catch (e) {} },
  incWriteFail: (canal) => { try { sseWriteFailures.labels(canal || 'unknown').inc(); } catch (e) {} },
  incKeepalive: (canal) => { try { sseKeepaliveSent.labels(canal || 'unknown').inc(); } catch (e) {} },
  // Redis
  setRedisConnected: (val) => { try { redisConnected.set(val ? 1 : 0); } catch (e) {} },
  incRedisPublishFail: () => { try { redisPublishFailures.inc(); } catch (e) {} }
  ,
  // migration helpers
  incMigrateSuccess: () => { try { migrateSuccess.inc(); } catch (e) {} },
  incMigrateFail: () => { try { migrateFail.inc(); } catch (e) {} },
  incRestoredEvent: () => { try { restoredEvents.inc(); } catch (e) {} },
  // pong db writes
  incPongDbWrite: () => { try { pongDbWrites.inc(); } catch (e) {} },
  incPongDbWriteFail: () => { try { pongDbWriteFails.inc(); } catch (e) {} }
};
