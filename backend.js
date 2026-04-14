import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { setupAuthEndpoints, verifyTokenMiddleware, requireRole } from './backend-auth-endpoints.js';
import { setupBillingEndpoints } from './backend-billing-endpoints.js';
import { syncMeteredUsageToStripe, evaluateBillingHealth } from './billing.js';
import { sendMeteredSyncFailureAlert, sendBillingHealthTransitionAlert } from './ops-alerts.js';
import { runDatabaseMigrations } from './db-migrations.js';
import { initDb, isDbEnabled, query } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

function getAllowedCorsOrigins() {
  const raw = String(process.env.CORS_ORIGIN || '').trim();
  if (!raw) {
    return true;
  }

  const allowedOrigins = raw.split(',').map((item) => item.trim()).filter(Boolean);
  return (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  };
}

app.use(cors({ origin: getAllowedCorsOrigins(), credentials: true }));
// Capture raw body for Stripe webhook signature verification
app.use('/v1/billing/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());

const distPath = path.join(__dirname, 'dist');
const distIndexPath = path.join(distPath, 'index.html');
const legacyIndexPath = path.join(__dirname, 'public', 'index.html');
const hasBuiltFrontend = fs.existsSync(distIndexPath);

// Serve static files from the React app build directory
app.use(express.static(distPath));

const API_KEY = 'test-key'; // Change this to your actual API key
const events = []; // In-memory storage for demo
const attackChains = []; // Track attack patterns
const incidentResponses = []; // Track manual containment actions
const conversionEvents = []; // Track funnel and trust interactions
const deviceLocations = new Map(); // Track device geolocation

// Attack pattern definitions
const ATTACK_PATTERNS = {
  'reconnaissance': ['port_scan_detected', 'unauthorized_access_attempt'],
  'brute_force': ['brute_force_attack', 'unauthorized_access_attempt'],
  'data_theft': ['data_exfiltration_attempt', 'suspicious_traffic_detected'],
  'malware_infection': ['malware_signature_found', 'firmware_tampering_attempt'],
  'persistence': ['rogue_device_connected', 'weak_encryption_detected']
};

// Known threat intelligence
const THREAT_INTELLIGENCE = {
  'malware_signatures': ['trojan', 'ransomware', 'spyware', 'worm'],
  'suspicious_ips': ['192.168.1.100', '10.0.0.50', '172.16.0.25'],
  'compromised_devices': new Set()
};

const devices = [
  { id: 'Gateway-01', type: 'Gateway', status: 'Online', location: 'North Hub', lastSeen: '1 min ago' },
  { id: 'Sensor-14', type: 'Temperature', status: 'Online', location: 'West Wing', lastSeen: '20 sec ago' },
  { id: 'Cam-07', type: 'Camera', status: 'Offline', location: 'Loading Dock', lastSeen: '12 mins ago' },
  { id: 'Beacon-03', type: 'BLE Beacon', status: 'Online', location: 'Server Room', lastSeen: '30 sec ago' }
];

async function getEventsData() {
  if (isDbEnabled()) {
    const result = await query(
      `SELECT e.id, d.device_id, e.event_type, e.severity, e.title, e.description, e.created_at
       FROM events e
       LEFT JOIN devices d ON e.device_id = d.id
       ORDER BY e.created_at DESC
       LIMIT 200`
    );

    if (result.rows.length > 0 || events.length === 0) {
      return result.rows.map((row) => ({
        id: row.id,
        device_id: row.device_id || 'unknown-device',
        event_type: row.event_type,
        type: row.event_type,
        severity: normalizeSeverityForUi(row.severity || 'info'),
        message: row.title || row.description || row.event_type,
        details: row.description || '',
        received_at: row.created_at
      }));
    }
  }

  return events;
}

async function getDevicesData() {
  if (isDbEnabled()) {
    const result = await query(
      `SELECT device_id, device_type, status, location, last_seen
       FROM devices
       ORDER BY created_at DESC`
    );

    if (result.rows.length > 0 || devices.length === 0) {
      return result.rows.map((row) => ({
        id: row.device_id,
        type: row.device_type || 'Unknown',
        status: row.status ? row.status.charAt(0).toUpperCase() + row.status.slice(1) : 'Unknown',
        location: row.location || 'Unknown',
        lastSeen: row.last_seen ? new Date(row.last_seen).toLocaleString() : 'Unknown'
      }));
    }
  }

  return devices;
}

// =========================
// ATTACK TRACING FUNCTIONS
// =========================

// Geolocation simulation for devices
function getDeviceLocation(mac) {
  const safeMac = typeof mac === 'string' && mac.trim() ? mac : '00:00:00:00:00:00';

  if (!deviceLocations.has(safeMac)) {
    const hash = safeMac.split(':').reduce((acc, val) => acc + (Number.parseInt(val, 16) || 0), 0);
    const locations = [
      { city: 'New York', country: 'USA', lat: 40.7128, lon: -74.0060 },
      { city: 'London', country: 'UK', lat: 51.5074, lon: -0.1278 },
      { city: 'Tokyo', country: 'Japan', lat: 35.6762, lon: 139.6503 },
      { city: 'Berlin', country: 'Germany', lat: 52.5200, lon: 13.4050 },
      { city: 'Sydney', country: 'Australia', lat: -33.8688, lon: 151.2093 },
      { city: 'Moscow', country: 'Russia', lat: 55.7558, lon: 37.6173 }
    ];
    deviceLocations.set(safeMac, locations[hash % locations.length]);
  }
  return deviceLocations.get(safeMac);
}

function analyzeAttackPattern(eventHistory) {
  const recentEvents = eventHistory.slice(-10);
  const eventTypes = recentEvents.map((entry) => entry.event_type);

  for (const [patternName, patternEvents] of Object.entries(ATTACK_PATTERNS)) {
    const matches = patternEvents.filter((type) => eventTypes.includes(type));
    if (matches.length >= 2) {
      return {
        pattern: patternName,
        confidence: (matches.length / patternEvents.length) * 100,
        events: matches
      };
    }
  }
  return null;
}

function correlateEvents(event, eventHistory = events) {
  const relatedEvents = eventHistory.filter((entry) =>
    entry.mac === event.mac ||
    (entry.device_id === event.device_id && Math.abs(new Date(entry.received_at) - new Date(event.received_at)) < 300000)
  );

  return relatedEvents.length > 1 ? relatedEvents : null;
}

// Check threat intelligence
function checkThreatIntelligence(event) {
  const threats = [];

  if (THREAT_INTELLIGENCE.malware_signatures.some(sig => event.details?.toLowerCase().includes(sig))) {
    threats.push('Known malware signature detected');
  }

  if (THREAT_INTELLIGENCE.suspicious_ips.includes(event.mac)) {
    threats.push('Device associated with suspicious activity');
  }

  if (THREAT_INTELLIGENCE.compromised_devices.has(event.mac)) {
    threats.push('Previously compromised device');
  }

  return threats;
}

// Generate attack trace
function generateAttackTrace(event, eventHistory = events) {
  const location = getDeviceLocation(event.mac);
  const correlation = correlateEvents(event, eventHistory);
  const pattern = analyzeAttackPattern(eventHistory);
  const intelligence = checkThreatIntelligence(event);

  return {
    trace_id: `trace_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
    mac: event.mac,
    attacker_location: location,
    attack_vector: event.event_type,
    severity: normalizeSeverityForUi(event.severity),
    correlation_count: correlation ? correlation.length : 0,
    attack_pattern: pattern,
    threat_intelligence: intelligence,
    timestamp: event.received_at,
    risk_score: calculateRiskScore(event, pattern, intelligence)
  };
}

function calculateRiskScore(event, pattern, intelligence) {
  let score = 0;

  const severityScores = { info: 1, low: 2, medium: 3, warning: 3, high: 5, alert: 5, critical: 10 };
  score += severityScores[String(event.severity || 'info').toLowerCase()] || 1;

  if (pattern) score += pattern.confidence * 0.1;
  score += intelligence.length * 2;

  return Math.min(10, Number(score.toFixed(1)));
}

function normalizeSeverityForDb(severity) {
  const value = String(severity || 'info').toLowerCase();
  const severityMap = {
    critical: 'critical',
    high: 'high',
    alert: 'high',
    medium: 'medium',
    warning: 'medium',
    low: 'low',
    info: 'info'
  };

  return severityMap[value] || 'info';
}

function normalizeSeverityForUi(severity) {
  const value = String(severity || 'info').toLowerCase();
  const severityMap = {
    critical: 'critical',
    high: 'alert',
    alert: 'alert',
    medium: 'warning',
    warning: 'warning',
    low: 'info',
    info: 'info'
  };

  return severityMap[value] || 'info';
}

function formatEventTitle(eventType) {
  return String(eventType || 'unknown_event')
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function mapThreatLevelFromScore(riskScore, severity = 'info') {
  if (riskScore >= 8 || String(severity).toLowerCase() === 'critical') return 'critical';
  if (riskScore >= 5 || ['high', 'alert'].includes(String(severity).toLowerCase())) return 'high';
  if (riskScore >= 3 || ['medium', 'warning'].includes(String(severity).toLowerCase())) return 'medium';
  return 'low';
}

function toCountMap(rows = []) {
  return rows.reduce((acc, row) => {
    acc[row.action] = Number(row.total || 0);
    return acc;
  }, {});
}

function calculatePercent(numerator, denominator) {
  if (!denominator) {
    return 0;
  }
  return Number(((numerator / denominator) * 100).toFixed(1));
}

async function trackConversionEvent({ eventName, path = '/', source = 'web_app', details = {}, userId = null, ipAddress = null }) {
  const safeEventName = String(eventName || '').trim();
  if (!safeEventName) {
    return;
  }

  const entry = {
    action: safeEventName,
    resource_type: 'conversion',
    resource_id: path || safeEventName,
    changes: { source, path, ...details },
    ip_address: ipAddress || null,
    created_at: new Date().toISOString(),
    user_id: userId || null
  };

  conversionEvents.push(entry);
  if (conversionEvents.length > 500) {
    conversionEvents.shift();
  }

  if (isDbEnabled()) {
    await query(
      `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, changes, ip_address, created_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, NOW())`,
      [
        userId || null,
        safeEventName,
        'conversion',
        path || safeEventName,
        JSON.stringify({ source, path, ...details }),
        ipAddress || null
      ]
    );
  }
}

async function getConversionSummaryData() {
  const actionsToTrack = [
    'landing_view',
    'plans_view',
    'signup_view',
    'signup_completed',
    'start_free_clicked',
    'choose_plan_clicked',
    'demo_request_view',
    'billing_view',
    'checkout_started',
    'trial_started',
    'demo_request_submitted'
  ];

  if (isDbEnabled()) {
    const [countsResult, recentResult] = await Promise.all([
      query(
        `SELECT action, COUNT(*)::int AS total
         FROM audit_logs
         WHERE created_at >= NOW() - INTERVAL '30 days'
           AND action = ANY($1)
         GROUP BY action`,
        [actionsToTrack]
      ),
      query(
        `SELECT action, resource_id, changes, created_at
         FROM audit_logs
         WHERE created_at >= NOW() - INTERVAL '30 days'
           AND action = ANY($1)
         ORDER BY created_at DESC
         LIMIT 12`,
        [actionsToTrack]
      )
    ]);

    const counts = toCountMap(countsResult.rows);
    return {
      windowDays: 30,
      counts,
      rates: {
        signupFromLanding: calculatePercent(counts.signup_completed || 0, counts.landing_view || 0),
        checkoutFromPlans: calculatePercent((counts.checkout_started || 0) + (counts.trial_started || 0), counts.plans_view || 0),
        demoFromLanding: calculatePercent(counts.demo_request_submitted || 0, counts.landing_view || 0)
      },
      recent: recentResult.rows || []
    };
  }

  const recentEventsWindow = conversionEvents.slice(-100);
  const counts = recentEventsWindow.reduce((acc, item) => {
    acc[item.action] = (acc[item.action] || 0) + 1;
    return acc;
  }, {});

  return {
    windowDays: 30,
    counts,
    rates: {
      signupFromLanding: calculatePercent(counts.signup_completed || 0, counts.landing_view || 0),
      checkoutFromPlans: calculatePercent((counts.checkout_started || 0) + (counts.trial_started || 0), counts.plans_view || 0),
      demoFromLanding: calculatePercent(counts.demo_request_submitted || 0, counts.landing_view || 0)
    },
    recent: recentEventsWindow.slice(-12).reverse()
  };
}

function isNonProductionSecret(value = '') {
  const safeValue = String(value || '').trim();
  if (!safeValue) {
    return true;
  }

  return [
    'your-super-secret-key-change-this-in-production',
    'your-secret-key-change-in-production',
    'change-this'
  ].some((token) => safeValue.includes(token));
}

function usesLocalhost(value = '') {
  const safeValue = String(value || '').toLowerCase();
  return safeValue.includes('localhost') || safeValue.includes('127.0.0.1') || safeValue.includes('.local');
}

async function getLaunchReadinessData() {
  const checks = [
    {
      key: 'node_env',
      label: 'Production mode',
      ok: String(process.env.NODE_ENV || '').toLowerCase() === 'production',
      detail: `NODE_ENV=${process.env.NODE_ENV || 'unset'}`
    },
    {
      key: 'stripe_live_keys',
      label: 'Live Stripe keys',
      ok: /^sk_live_/.test(String(process.env.STRIPE_SECRET_KEY || '')) && /^pk_live_/.test(String(process.env.STRIPE_PUBLIC_KEY || '')),
      detail: 'Requires sk_live and pk_live credentials'
    },
    {
      key: 'webhook_secret',
      label: 'Stripe webhook secret',
      ok: /^whsec_/.test(String(process.env.STRIPE_WEBHOOK_SECRET || '')),
      detail: 'Webhook signing secret is required for live billing sync'
    },
    {
      key: 'email_delivery',
      label: 'Customer contact inboxes',
      ok: Boolean(process.env.FROM_EMAIL && process.env.SUPPORT_EMAIL && process.env.SALES_EMAIL),
      detail: 'From, support, and sales/demo inboxes are set'
    },
    {
      key: 'jwt_secret',
      label: 'Secure JWT secret',
      ok: !isNonProductionSecret(process.env.JWT_SECRET),
      detail: 'Replace the development placeholder secret'
    },
    {
      key: 'public_domain',
      label: 'Public frontend domain',
      ok: Boolean(process.env.FRONTEND_URL) && !usesLocalhost(process.env.FRONTEND_URL),
      detail: `FRONTEND_URL=${process.env.FRONTEND_URL || 'unset'}`
    },
    {
      key: 'cors_origin',
      label: 'Production CORS origin',
      ok: Boolean(process.env.CORS_ORIGIN) && !usesLocalhost(process.env.CORS_ORIGIN),
      detail: `CORS_ORIGIN=${process.env.CORS_ORIGIN || 'unset'}`
    }
  ];

  const blockers = checks.filter((check) => !check.ok).map((check) => `${check.label}: ${check.detail}`);
  return {
    ready: blockers.length === 0,
    blockerCount: blockers.length,
    checks,
    blockers
  };
}

async function loadRecentEventsForDevice(event) {
  if (isDbEnabled()) {
    try {
      const result = await query(
        `SELECT d.device_id, d.mac_address, e.event_type, e.severity, e.description, e.created_at
         FROM events e
         LEFT JOIN devices d ON e.device_id = d.id
         WHERE d.device_id = $1 OR ($2 <> '' AND d.mac_address = $2)
         ORDER BY e.created_at DESC
         LIMIT 10`,
        [event.device_id, event.mac || '']
      );

      return result.rows.map((row) => ({
        device_id: row.device_id,
        mac: row.mac_address,
        event_type: row.event_type,
        severity: normalizeSeverityForUi(row.severity),
        details: row.description || '',
        received_at: row.created_at
      }));
    } catch (error) {
      console.warn('Failed to load recent event context from DB:', error.message);
    }
  }

  return events.filter((entry) => entry.mac === event.mac || entry.device_id === event.device_id).slice(-10);
}

async function persistProcessedEvent(processedEvent) {
  if (!isDbEnabled()) {
    return;
  }

  const safeMac = processedEvent.mac || processedEvent.device_id || 'unknown-device';
  const location = processedEvent.attack_trace?.attacker_location || getDeviceLocation(safeMac);
  const deviceResult = await query(
    `INSERT INTO devices (device_id, mac_address, device_type, location, status, last_seen, updated_at)
     VALUES ($1, $2, $3, $4, 'online', $5, NOW())
     ON CONFLICT (device_id) DO UPDATE SET
       mac_address = COALESCE(EXCLUDED.mac_address, devices.mac_address),
       device_type = COALESCE(EXCLUDED.device_type, devices.device_type),
       location = COALESCE(EXCLUDED.location, devices.location),
       status = 'online',
       last_seen = EXCLUDED.last_seen,
       updated_at = NOW()
     RETURNING id`,
    [
      processedEvent.device_id,
      processedEvent.mac || null,
      processedEvent.device_type || 'Sentinel device',
      location?.city ? `${location.city}, ${location.country}` : 'Unknown',
      processedEvent.received_at
    ]
  );

  const dbDeviceId = deviceResult.rows[0]?.id;

  await query(
    `INSERT INTO events (device_id, event_type, severity, title, description, raw_data, created_at)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
    [
      dbDeviceId,
      processedEvent.event_type || 'unknown_event',
      normalizeSeverityForDb(processedEvent.severity),
      formatEventTitle(processedEvent.event_type),
      processedEvent.details || processedEvent.message || '',
      JSON.stringify(processedEvent),
      processedEvent.received_at
    ]
  );

  if (!processedEvent.attack_trace) {
    return;
  }

  const trace = processedEvent.attack_trace;
  const threatLevel = mapThreatLevelFromScore(trace.risk_score, processedEvent.severity);
  const traceResult = await query(
    `INSERT INTO attack_traces (
      mac_address,
      attack_vector,
      confidence_score,
      events_count,
      related_devices,
      threat_level,
      attacker_city,
      attacker_country,
      risk_score,
      threat_context,
      attack_pattern_name,
      attack_pattern_confidence,
      occurred_at,
      updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13, NOW())
    RETURNING id`,
    [
      safeMac,
      trace.attack_vector,
      Number(((trace.attack_pattern?.confidence || trace.risk_score * 10) / 100).toFixed(2)),
      Math.max(1, trace.correlation_count || 1),
      Math.max(1, trace.correlation_count || 1),
      threatLevel,
      location.city,
      location.country,
      Number(trace.risk_score || 0),
      JSON.stringify({ threat_intelligence: trace.threat_intelligence || [] }),
      trace.attack_pattern?.pattern || null,
      trace.attack_pattern?.confidence || null,
      trace.timestamp || processedEvent.received_at
    ]
  );

  if (trace.attack_pattern) {
    await query(
      `INSERT INTO attack_chains (
        trace_id,
        chain_pattern,
        sequence,
        detected_at,
        risk_level,
        event_count,
        start_time,
        updated_at
      )
      VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, NOW())`,
      [
        traceResult.rows[0]?.id,
        trace.attack_pattern.pattern,
        JSON.stringify(trace.attack_pattern.events || [processedEvent.event_type]),
        processedEvent.received_at,
        threatLevel.toUpperCase(),
        Math.max(1, trace.correlation_count || 1),
        processedEvent.received_at
      ]
    );
  }
}

async function getAttackTracesData() {
  if (isDbEnabled()) {
    try {
      const result = await query(
        `SELECT mac_address, attack_vector, threat_level, attacker_city, attacker_country,
                risk_score, threat_context, attack_pattern_name, attack_pattern_confidence,
                occurred_at, created_at, events_count, containment_status, response_notes, last_action_at
         FROM attack_traces
         ORDER BY COALESCE(occurred_at, created_at) DESC
         LIMIT 20`
      );

      return result.rows.map((row) => {
        const fallbackLocation = getDeviceLocation(row.mac_address);
        const threatContext = row.threat_context || {};
        const threatIntel = Array.isArray(threatContext.threat_intelligence)
          ? threatContext.threat_intelligence
          : [];

        return {
          mac: row.mac_address,
          attack_vector: row.attack_vector,
          severity: normalizeSeverityForUi(row.threat_level),
          attacker_location: {
            city: row.attacker_city || fallbackLocation.city,
            country: row.attacker_country || fallbackLocation.country
          },
          risk_score: Number(row.risk_score || 0),
          correlation_count: row.events_count || 0,
          attack_pattern: row.attack_pattern_name
            ? {
                pattern: row.attack_pattern_name,
                confidence: Number(row.attack_pattern_confidence || 0)
              }
            : null,
          threat_intelligence: threatIntel,
          containment_status: row.containment_status || 'active',
          response_notes: row.response_notes || '',
          last_action_at: row.last_action_at,
          timestamp: row.occurred_at || row.created_at
        };
      });
    } catch (error) {
      console.warn('Failed to load attack traces from DB:', error.message);
    }
  }

  return events.filter((entry) => entry.attack_trace).map((entry) => entry.attack_trace).slice(-20);
}

async function getAttackChainsData() {
  if (isDbEnabled()) {
    try {
      const result = await query(
        `SELECT chain_pattern, sequence, detected_at, risk_level, event_count, start_time
         FROM attack_chains
         ORDER BY COALESCE(start_time, detected_at) DESC
         LIMIT 10`
      );

      return result.rows.map((row) => ({
        pattern: row.chain_pattern,
        events: Array.isArray(row.sequence) ? row.sequence : [],
        start_time: row.start_time || row.detected_at,
        risk_level: row.risk_level || 'LOW'
      }));
    } catch (error) {
      console.warn('Failed to load attack chains from DB:', error.message);
    }
  }

  return attackChains.slice(-10);
}

async function getThreatIntelligenceData() {
  if (isDbEnabled()) {
    try {
      const result = await query(
        `SELECT mac_address, attacker_city, attacker_country, threat_context, occurred_at, created_at
         FROM attack_traces
         ORDER BY COALESCE(occurred_at, created_at) DESC
         LIMIT 20`
      );

      const activeThreats = result.rows
        .map((row) => {
          const threatContext = row.threat_context || {};
          const threats = Array.isArray(threatContext.threat_intelligence)
            ? threatContext.threat_intelligence
            : [];

          if (!threats.length) {
            return null;
          }

          return {
            device: row.mac_address,
            threats,
            location: {
              city: row.attacker_city || getDeviceLocation(row.mac_address).city,
              country: row.attacker_country || getDeviceLocation(row.mac_address).country
            },
            timestamp: row.occurred_at || row.created_at
          };
        })
        .filter(Boolean)
        .slice(0, 5);

      return {
        active_threats: activeThreats,
        known_signatures: THREAT_INTELLIGENCE.malware_signatures,
        suspicious_devices: Array.from(THREAT_INTELLIGENCE.compromised_devices)
      };
    } catch (error) {
      console.warn('Failed to load threat intelligence from DB:', error.message);
    }
  }

  const activeThreats = events
    .filter((entry) => entry.attack_trace?.threat_intelligence?.length > 0)
    .slice(-5)
    .map((entry) => ({
      device: entry.mac,
      threats: entry.attack_trace.threat_intelligence,
      location: entry.attack_trace.attacker_location,
      timestamp: entry.received_at
    }));

  return {
    active_threats: activeThreats,
    known_signatures: THREAT_INTELLIGENCE.malware_signatures,
    suspicious_devices: Array.from(THREAT_INTELLIGENCE.compromised_devices)
  };
}

async function getAttackTimelineData(mac) {
  if (isDbEnabled()) {
    try {
      const result = await query(
        `SELECT e.created_at, e.event_type, e.severity,
                at.attacker_city, at.attacker_country, at.risk_score
         FROM events e
         INNER JOIN devices d ON e.device_id = d.id
         LEFT JOIN LATERAL (
           SELECT attacker_city, attacker_country, risk_score
           FROM attack_traces at
           WHERE at.mac_address = d.mac_address
           ORDER BY COALESCE(at.occurred_at, at.created_at) DESC
           LIMIT 1
         ) at ON TRUE
         WHERE d.mac_address = $1 OR d.device_id = $1
         ORDER BY e.created_at ASC`,
        [mac]
      );

      if (result.rows.length > 0) {
        return result.rows.map((row) => ({
          timestamp: row.created_at,
          event_type: row.event_type,
          severity: normalizeSeverityForUi(row.severity),
          location: {
            city: row.attacker_city || getDeviceLocation(mac).city,
            country: row.attacker_country || getDeviceLocation(mac).country
          },
          risk_score: Number(row.risk_score || 0)
        }));
      }
    } catch (error) {
      console.warn('Failed to load attack timeline from DB:', error.message);
    }
  }

  return events
    .filter((entry) => entry.mac === mac)
    .sort((a, b) => new Date(a.received_at) - new Date(b.received_at))
    .map((entry) => ({
      timestamp: entry.received_at,
      event_type: entry.event_type,
      severity: entry.severity,
      location: entry.attack_trace?.attacker_location || getDeviceLocation(mac),
      risk_score: entry.attack_trace?.risk_score || 0
    }));
}

async function getIncidentResponseData(mac) {
  if (isDbEnabled()) {
    try {
      const [statusResult, historyResult] = await Promise.all([
        query(
          `SELECT containment_status, response_notes, last_action_at
           FROM attack_traces
           WHERE mac_address = $1
           ORDER BY COALESCE(last_action_at, occurred_at, created_at) DESC
           LIMIT 1`,
          [mac]
        ),
        query(
          `SELECT al.action, al.changes, al.created_at,
                  COALESCE(u.full_name, u.email, 'System operator') AS actor
           FROM audit_logs al
           LEFT JOIN users u ON al.user_id = u.id
           WHERE al.resource_type = 'attack_trace' AND al.resource_id = $1
           ORDER BY al.created_at DESC
           LIMIT 10`,
          [mac]
        )
      ]);

      return {
        containment_status: statusResult.rows[0]?.containment_status || 'active',
        response_notes: statusResult.rows[0]?.response_notes || '',
        last_action_at: statusResult.rows[0]?.last_action_at || null,
        history: historyResult.rows.map((row) => ({
          action: row.action,
          actor: row.actor,
          note: row.changes?.note || row.changes?.summary || '',
          created_at: row.created_at
        }))
      };
    } catch (error) {
      console.warn('Failed to load incident response data from DB:', error.message);
    }
  }

  const matchingTrace = [...events].reverse().find((entry) => entry.mac === mac && entry.attack_trace);
  const history = incidentResponses
    .filter((entry) => entry.resource_id === mac)
    .slice(-10)
    .reverse()
    .map((entry) => ({
      action: entry.action,
      actor: entry.actor,
      note: entry.note,
      created_at: entry.created_at
    }));

  return {
    containment_status: matchingTrace?.attack_trace?.containment_status || 'active',
    response_notes: matchingTrace?.attack_trace?.response_notes || '',
    last_action_at: matchingTrace?.attack_trace?.last_action_at || null,
    history
  };
}

const sentinels = [
  { id: 'sentinel-001', status: 'Online', events: 245, lastSeen: '2 min ago', uptime: '99.8%', avgRssi: '-65', lastCheckIn: new Date(Date.now() - 2000).toISOString() },
  { id: 'sentinel-002', status: 'Online', events: 189, lastSeen: '1 min ago', uptime: '99.9%', avgRssi: '-58', lastCheckIn: new Date(Date.now() - 1000).toISOString() },
  { id: 'sentinel-003', status: 'Online', events: 312, lastSeen: '3 min ago', uptime: '99.7%', avgRssi: '-72', lastCheckIn: new Date(Date.now() - 3000).toISOString() }
];

// Middleware to check API key
function checkApiKey(req, res, next) {
  const key = req.headers['x-api-key'];
  if (key !== API_KEY) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  next();
}

// Ingest events
app.post('/v1/events/ingest', checkApiKey, async (req, res) => {
  const { device_id, events: eventList } = req.body;
  if (!device_id || !eventList || !Array.isArray(eventList)) {
    return res.status(400).json({ error: 'Invalid event format' });
  }

  const processedEvents = [];

  for (const event of eventList) {
    const processedEvent = {
      device_id,
      ...event,
      severity: normalizeSeverityForUi(event.severity),
      received_at: new Date().toISOString()
    };

    if (processedEvent.severity && ['warning', 'alert', 'critical'].includes(processedEvent.severity)) {
      const history = await loadRecentEventsForDevice(processedEvent);
      const attackTrace = generateAttackTrace(processedEvent, [...history, ...events, processedEvent]);
      processedEvent.attack_trace = attackTrace;

      if (attackTrace.attack_pattern) {
        attackChains.push({
          chain_id: `chain_${Date.now()}`,
          pattern: attackTrace.attack_pattern.pattern,
          events: [processedEvent],
          start_time: processedEvent.received_at,
          risk_level: attackTrace.risk_score > 7 ? 'HIGH' : attackTrace.risk_score > 4 ? 'MEDIUM' : 'LOW'
        });
      }

      console.log(`🔍 ATTACK TRACE: ${attackTrace.attack_vector} from ${attackTrace.attacker_location.city}, Risk: ${attackTrace.risk_score}/10`);
    }

    events.push(processedEvent);
    processedEvents.push(processedEvent);

    try {
      await persistProcessedEvent(processedEvent);
    } catch (error) {
      console.error(`Failed to persist event for ${device_id}:`, error.message);
    }
  }

  console.log(`Ingested ${eventList.length} events from ${device_id}`);
  res.json({ status: 'ok', ingested: eventList.length, traces: processedEvents.filter((entry) => entry.attack_trace).length });
});

app.post('/v1/public/track', async (req, res) => {
  try {
    const { eventName, path, source, details } = req.body || {};
    if (!eventName) {
      return res.status(400).json({ error: 'eventName is required' });
    }

    await trackConversionEvent({
      eventName,
      path,
      source,
      details: details || {},
      ipAddress: req.ip
    });

    res.status(201).json({ success: true });
  } catch (error) {
    console.error('Conversion tracking error:', error);
    res.status(500).json({ error: 'Unable to record event' });
  }
});

app.get('/v1/admin/conversion-summary', verifyTokenMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const summary = await getConversionSummaryData();
    res.json({ summary });
  } catch (error) {
    console.error('Conversion summary error:', error);
    res.status(500).json({ error: 'Unable to load conversion summary' });
  }
});

app.get('/v1/admin/launch-readiness', verifyTokenMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const readiness = await getLaunchReadinessData();
    res.json({ readiness });
  } catch (error) {
    console.error('Launch readiness error:', error);
    res.status(500).json({ error: 'Unable to load launch readiness' });
  }
});

// Get all events (no API key required for dashboard reading)
app.get('/v1/events', async (req, res) => {
  try {
    const eventsData = await getEventsData();
    res.json({ events: eventsData });
  } catch (error) {
    console.error('Failed to load events from DB, falling back to memory:', error.message);
    res.json({ events });
  }
});

app.get('/v1/dashboard', async (req, res) => {
  const eventsData = await getEventsData();

  const activity = eventsData.slice(-5).reverse().map(event => ({
    time: new Date(event.received_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
    event: event.message || event.type || `${event.device_id} sent data`,
    status: event.severity === 'alert' ? 'Alert' : 'Info'
  }));

  const onlineSentinels = sentinels.filter(s => {
    const lastCheckIn = new Date(s.lastCheckIn);
    const now = new Date();
    return (now - lastCheckIn) / 1000 <= 30;
  }).length;

  res.json({
    stats: [
      { label: 'Active Sentinels', value: onlineSentinels, change: '+5%' },
      { label: 'Threats Detected', value: eventsData.filter(e => e.severity === 'alert').length || Math.floor(Math.random() * 20), change: '-8%' },
      { label: 'Alerts Today', value: eventsData.filter(e => e.type === 'alert').length || Math.floor(Math.random() * 10), change: '+14%' },
      { label: 'System Health', value: '99.4%', change: 'Stable' }
    ],
    recentActivity: activity.length ? activity : [
      { time: new Date(Date.now() - Math.random() * 300000).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }), event: 'Sentinel reported motion', status: 'Info' },
      { time: new Date(Date.now() - Math.random() * 600000).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }), event: 'New device detected', status: 'Success' },
      { time: new Date(Date.now() - Math.random() * 900000).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }), event: 'Security scan completed', status: 'Info' },
      { time: new Date(Date.now() - Math.random() * 1200000).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }), event: 'System update applied', status: 'Info' }
    ]
  });
});

app.get('/v1/devices', async (req, res) => {
  try {
    const devicesData = await getDevicesData();
    res.json({ devices: devicesData });
  } catch (error) {
    console.error('Failed to load devices from DB, falling back to memory:', error.message);
    res.json({ devices });
  }
});

app.get('/v1/sentinels', (req, res) => {
  // Simulate dynamic sentinel data
  const now = Date.now();
  const sentinelsData = sentinels.map(sentinel => ({
    ...sentinel,
    events: sentinel.events + Math.floor(Math.random() * 3), // Add 0-2 events
    lastCheckIn: new Date(now - Math.random() * 60000).toISOString(), // Within last minute
    avgRssi: (-60 + Math.random() * 20).toFixed(0) // Vary RSSI
  }));

  res.json({ sentinels: sentinelsData });
});

app.get('/v1/health', (req, res) => {
  // Simulate varying system metrics
  const baseCpu = 46.1;
  const baseRam = 34.2;
  const variation = (Math.random() - 0.5) * 10; // ±5% variation

  res.json({
    cpu: Math.max(0, Math.min(100, baseCpu + variation)),
    ram: Math.max(0, Math.min(100, baseRam + variation)),
    uptime: 99.8,
    database: isDbEnabled() ? 'Connected' : 'Fallback mode',
    heartbeat: 'Online',
    apiResponseMs: Math.floor(20 + Math.random() * 10),
    eventsCount: events.length
  });
});

// =========================
// ATTACK TRACING ENDPOINTS
// =========================

app.get('/v1/attack-traces', async (req, res) => {
  const traces = await getAttackTracesData();
  res.json({ traces });
});

app.get('/v1/attack-chains', async (req, res) => {
  const chains = await getAttackChainsData();
  res.json({ chains });
});

app.get('/v1/threat-intelligence', async (req, res) => {
  const intelligence = await getThreatIntelligenceData();
  res.json(intelligence);
});

app.get('/v1/attack-timeline/:mac', async (req, res) => {
  const { mac } = req.params;
  const timeline = await getAttackTimelineData(mac);
  res.json({ timeline });
});

app.get('/v1/attack-response/:mac', async (req, res) => {
  const { mac } = req.params;
  const responseData = await getIncidentResponseData(mac);
  res.json(responseData);
});

app.post('/v1/attack-response', verifyTokenMiddleware, requireRole('admin', 'operator', 'analyst'), async (req, res) => {
  const { mac, action, note } = req.body || {};

  if (!mac || !action) {
    return res.status(400).json({ error: 'mac and action are required' });
  }

  const actionMap = {
    contain: {
      status: 'contained',
      deviceStatus: 'offline',
      auditAction: 'device_contained',
      summary: 'Containment initiated to reduce potential blast radius.'
    },
    monitor: {
      status: 'monitoring',
      deviceStatus: null,
      auditAction: 'heightened_monitoring_enabled',
      summary: 'Enhanced monitoring enabled while the threat is reviewed.'
    },
    resolve: {
      status: 'resolved',
      deviceStatus: 'online',
      auditAction: 'incident_resolved',
      summary: 'Incident reviewed and marked resolved.'
    }
  };

  const selectedAction = actionMap[action];
  if (!selectedAction) {
    return res.status(400).json({ error: 'Unsupported action' });
  }

  const safeNote = String(note || '').trim() || selectedAction.summary;
  const actor = req.user?.email || 'operator';
  const createdAt = new Date().toISOString();

  try {
    if (isDbEnabled()) {
      const updateResult = await query(
        `UPDATE attack_traces
         SET containment_status = $2,
             response_notes = $3,
             last_action_at = NOW(),
             updated_at = NOW()
         WHERE mac_address = $1`,
        [mac, selectedAction.status, safeNote]
      );

      if (updateResult.rowCount === 0) {
        return res.status(404).json({ error: 'No incident found for that device' });
      }

      if (selectedAction.deviceStatus) {
        await query(
          `UPDATE devices
           SET status = $2,
               updated_at = NOW(),
               last_seen = NOW()
           WHERE mac_address = $1 OR device_id = $1`,
          [mac, selectedAction.deviceStatus]
        );
      }

      await query(
        `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, changes, ip_address, created_at)
         VALUES ($1, $2, 'attack_trace', $3, $4::jsonb, $5, NOW())`,
        [
          req.user?.userId || null,
          selectedAction.auditAction,
          mac,
          JSON.stringify({ action, note: safeNote, status: selectedAction.status, actor }),
          req.ip || null
        ]
      );
    }

    for (const entry of events.filter((item) => item.mac === mac && item.attack_trace)) {
      entry.attack_trace.containment_status = selectedAction.status;
      entry.attack_trace.response_notes = safeNote;
      entry.attack_trace.last_action_at = createdAt;
    }

    incidentResponses.push({
      resource_id: mac,
      action: selectedAction.auditAction,
      actor,
      note: safeNote,
      created_at: createdAt
    });

    if (selectedAction.status === 'contained') {
      THREAT_INTELLIGENCE.compromised_devices.add(mac);
    }

    res.json({
      success: true,
      containment_status: selectedAction.status,
      response_notes: safeNote,
      actor,
      created_at: createdAt
    });
  } catch (error) {
    console.error('Incident response action failed:', error);
    res.status(500).json({ error: 'Unable to apply incident response action' });
  }
});

// Serve HTML pages without .html extension
app.get('/devices', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'devices.html'));
});

app.get('/sentinels', (req, res) => {

  res.sendFile(path.join(__dirname, 'public', 'sentinels.html'));
});

app.get('/events', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'events.html'));
});

app.get('/map', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'map.html'));
});

app.get('/api-keys', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'api-keys.html'));
});

app.get('/account', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'account.html'));
});

app.get('/settings', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'settings.html'));
});

app.get('/', (req, res) => {
  res.sendFile(hasBuiltFrontend ? distIndexPath : legacyIndexPath);
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', events_count: events.length });
});

// Set up authentication endpoints
setupAuthEndpoints(app, { isDbEnabled, query });

// Set up billing endpoints
setupBillingEndpoints(app);

// Catch all handler: send back React's index.html file for client-side routing
app.get('*', (req, res) => {
  res.sendFile(hasBuiltFrontend ? distIndexPath : legacyIndexPath);
});

const PORT = Number.parseInt(process.env.PORT || process.env.API_PORT || '4000', 10);

function shouldEnableMeteredSyncScheduler() {
  const raw = (process.env.METERED_SYNC_SCHEDULER_ENABLED || 'false').toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes';
}

function getMeteredSyncIntervalMs() {
  const rawMinutes = Number.parseInt(process.env.METERED_SYNC_INTERVAL_MINUTES || '1440', 10);
  const minutes = Number.isFinite(rawMinutes) && rawMinutes > 0 ? rawMinutes : 1440;
  return minutes * 60 * 1000;
}

function shouldRunMeteredSyncOnStartup() {
  const raw = (process.env.METERED_SYNC_RUN_ON_START || 'false').toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes';
}

function isMeteredSyncDryRun() {
  const raw = (process.env.METERED_SYNC_DRY_RUN || 'true').toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes';
}

function shouldAutoMigrateDb() {
  const raw = (process.env.DB_AUTO_MIGRATE || 'true').toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes';
}

function shouldEnableBillingHealthScheduler() {
  const raw = (process.env.BILLING_HEALTH_CHECKS_ENABLED || 'true').toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes';
}

function getBillingHealthIntervalMs() {
  const rawMinutes = Number.parseInt(process.env.BILLING_HEALTH_CHECK_INTERVAL_MINUTES || '15', 10);
  const minutes = Number.isFinite(rawMinutes) && rawMinutes > 0 ? rawMinutes : 15;
  return minutes * 60 * 1000;
}

function startMeteredSyncScheduler() {
  if (!shouldEnableMeteredSyncScheduler()) {
    console.log('ℹ Metered sync scheduler disabled (set METERED_SYNC_SCHEDULER_ENABLED=true to enable)');
    return null;
  }

  const intervalMs = getMeteredSyncIntervalMs();

  const runSync = async (reason) => {
    try {
      const dryRun = isMeteredSyncDryRun();
      const summary = await syncMeteredUsageToStripe({ dryRun, limit: 500, triggeredBy: `scheduler_${reason}` });

      if ((summary.errors || []).length > 0) {
        const alertResult = await sendMeteredSyncFailureAlert({
          source: `scheduler_${reason}`,
          summary,
          reason: 'sync_errors_detected'
        });
        if (!alertResult.sent) {
          console.warn(`Metered sync alert was not sent (${alertResult.reason})`);
        }
      }

      console.log(
        `✓ Metered sync (${reason}) complete: scanned=${summary.scanned}, synced=${summary.synced}, skipped=${summary.skipped}, errors=${summary.errors.length}, dryRun=${summary.dryRun}`
      );
    } catch (error) {
      await sendMeteredSyncFailureAlert({
        source: `scheduler_${reason}`,
        summary: {
          dryRun: isMeteredSyncDryRun(),
          scanned: 0,
          synced: 0,
          skipped: 0,
          errors: [{ error: error.message || 'scheduler_sync_failure' }]
        },
        reason: 'sync_execution_failed'
      });
      console.error(`✗ Metered sync (${reason}) failed:`, error.message);
    }
  };

  if (shouldRunMeteredSyncOnStartup()) {
    runSync('startup');
  }

  const timer = setInterval(() => {
    runSync('scheduled');
  }, intervalMs);

  const intervalMinutes = Math.round(intervalMs / (60 * 1000));
  console.log(
    `✓ Metered sync scheduler enabled: every ${intervalMinutes} minute(s), dryRun=${isMeteredSyncDryRun()}`
  );

  return timer;
}

function startBillingHealthScheduler() {
  if (!shouldEnableBillingHealthScheduler()) {
    console.log('Billing health scheduler disabled (set BILLING_HEALTH_CHECKS_ENABLED=true to enable)');
    return null;
  }

  const intervalMs = getBillingHealthIntervalMs();
  let lastStatus = null;

  const runHealthCheck = async (reason) => {
    try {
      const health = await evaluateBillingHealth();
      const changed = lastStatus !== null && health.status !== lastStatus;

      if (changed && (health.status === 'degraded' || health.status === 'critical')) {
        const alertResult = await sendBillingHealthTransitionAlert({
          fromStatus: lastStatus,
          toStatus: health.status,
          health
        });

        if (!alertResult.sent) {
          console.warn(`Billing health transition alert was not sent (${alertResult.reason})`);
        }
      }

      lastStatus = health.status;
      console.log(
        `Billing health (${reason}): status=${health.status}, signals=${health.signals.length}, checkedAt=${health.checkedAt}`
      );
    } catch (error) {
      console.error(`Billing health check (${reason}) failed:`, error.message);
    }
  };

  runHealthCheck('startup');
  const timer = setInterval(() => {
    runHealthCheck('scheduled');
  }, intervalMs);

  const intervalMinutes = Math.round(intervalMs / (60 * 1000));
  console.log(`Billing health scheduler enabled: every ${intervalMinutes} minute(s)`);

  return timer;
}

async function startServer() {
  await initDb();

  if (shouldAutoMigrateDb()) {
    try {
      await runDatabaseMigrations();
    } catch (error) {
      console.error('DB migrations failed:', error.message);
      process.exit(1);
    }
  } else {
    console.log('DB auto-migrate disabled (set DB_AUTO_MIGRATE=true to enable)');
  }

  startMeteredSyncScheduler();
  startBillingHealthScheduler();

  app.listen(PORT, () => {
    console.log(`IronGate Dashboard server running on port ${PORT}`);
    console.log(`API Key: ${API_KEY}`);
    console.log('✓ Authentication endpoints loaded');
    console.log('✓ Billing endpoints loaded (Stripe integration active)');
  });
}

startServer();