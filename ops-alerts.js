const OPS_ALERT_WEBHOOK_URL = process.env.OPS_ALERT_WEBHOOK_URL || '';
const OPS_ALERT_ENABLED = ['true', '1', 'yes'].includes((process.env.OPS_ALERTS_ENABLED || 'false').toLowerCase());

function isAlertingConfigured() {
  return OPS_ALERT_ENABLED && typeof OPS_ALERT_WEBHOOK_URL === 'string' && OPS_ALERT_WEBHOOK_URL.startsWith('http');
}

export async function sendOperationalAlert(payload) {
  if (!isAlertingConfigured()) {
    return { sent: false, reason: 'not_configured' };
  }

  try {
    const response = await fetch(OPS_ALERT_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      return {
        sent: false,
        reason: `webhook_failed_${response.status}`
      };
    }

    return { sent: true };
  } catch (error) {
    return {
      sent: false,
      reason: error.message || 'request_failed'
    };
  }
}

function buildMeteredSyncAlertPayload({ source, summary, reason }) {
  return {
    event: 'metered_sync_failure',
    source,
    reason: reason || 'sync_errors_detected',
    timestamp: new Date().toISOString(),
    counts: {
      scanned: Number(summary?.scanned || 0),
      synced: Number(summary?.synced || 0),
      skipped: Number(summary?.skipped || 0),
      errors: Number(summary?.errors?.length || 0)
    },
    dryRun: Boolean(summary?.dryRun),
    errors: (summary?.errors || []).slice(0, 10)
  };
}

export async function sendMeteredSyncFailureAlert({ source, summary, reason }) {
  const payload = buildMeteredSyncAlertPayload({ source, summary, reason });

  return sendOperationalAlert(payload);
}

export async function sendWebhookSignatureFailureAlert({ reason, details = {} }) {
  const payload = {
    event: 'stripe_webhook_signature_failure',
    reason,
    timestamp: new Date().toISOString(),
    details
  };

  return sendOperationalAlert(payload);
}

export async function sendWebhookDeadLetterAlert({ eventId, eventType, attemptCount, lastError }) {
  const payload = {
    event: 'stripe_webhook_dead_letter',
    timestamp: new Date().toISOString(),
    details: {
      eventId,
      eventType,
      attemptCount: Number(attemptCount || 0),
      lastError: lastError || null
    }
  };

  return sendOperationalAlert(payload);
}

export async function sendBillingHealthTransitionAlert({ fromStatus, toStatus, health }) {
  const payload = {
    event: 'billing_health_transition',
    timestamp: new Date().toISOString(),
    details: {
      fromStatus: fromStatus || 'unknown',
      toStatus,
      checkedAt: health?.checkedAt || null,
      metrics: health?.metrics || {},
      signals: (health?.signals || []).slice(0, 10)
    }
  };

  return sendOperationalAlert(payload);
}

export default {
  sendOperationalAlert,
  sendMeteredSyncFailureAlert,
  sendWebhookSignatureFailureAlert,
  sendWebhookDeadLetterAlert,
  sendBillingHealthTransitionAlert
};
