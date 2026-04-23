import React, { useState, useEffect } from 'react';
import axios from 'axios';

function formatAttackVector(value) {
  if (!value) return 'Unclassified incident';
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatPattern(value) {
  if (!value) return 'Linked activity';
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function buildResponseChecklist(trace) {
  if (!trace) {
    return [
      'Select an incident to load the detailed timeline and recommended response path.',
      'Validate the affected asset owner and current business impact.',
      'Escalate only after confirming the signal is real and actionable.'
    ];
  }

  const steps = [
    `Review asset ${trace.mac || 'unknown'} and confirm whether it should remain online.`,
    'Capture the incident timeline and notify the responsible operator or customer owner.',
    'Document what happened so the team can show response quality and platform value.'
  ];

  if (trace.risk_score >= 7) {
    steps.unshift('Treat this as urgent: isolate the affected device or tighten access immediately.');
  }

  if ((trace.threat_intelligence || []).length > 0) {
    steps.unshift('Escalate to high priority because the signal matched the watchlist.');
  }

  return steps;
}

function formatContainmentStatus(value) {
  if (!value) return 'Active';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default function AttackTracing() {
  const [traces, setTraces] = useState([]);
  const [chains, setChains] = useState([]);
  const [intelligence, setIntelligence] = useState(null);
  const [selectedTrace, setSelectedTrace] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [actionHistory, setActionHistory] = useState([]);
  const [actionNote, setActionNote] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = () => {
      Promise.all([
        axios.get('/v1/attack-traces'),
        axios.get('/v1/attack-chains'),
        axios.get('/v1/threat-intelligence')
      ])
        .then(([traceRes, chainRes, intelRes]) => {
          setTraces(traceRes.data.traces || []);
          setChains(chainRes.data.chains || []);
          setIntelligence(intelRes.data || { active_threats: [], known_signatures: [] });
          setError(null);
        })
        .catch(() => setError('Unable to load incident data right now.'))
        .finally(() => setLoading(false));
    };

    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadTimeline = (mac) => {
    return axios.get(`/v1/attack-timeline/${mac}`).then((res) => {
      setTimeline(res.data.timeline || []);
      setSelectedTrace(mac);
    });
  };

  const getAuthHeaders = () => {
    const token = localStorage.getItem('authToken');
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const getSeverityColor = (severity) => {
    const colors = { info: '#00ffff', warning: '#ffb100', alert: '#ff0055', critical: '#ff0080' };
    return colors[severity] || '#666';
  };

  const getRiskColor = (score) => {
    if (score >= 7) return '#ff0055';
    if (score >= 4) return '#ffb100';
    return '#00ffff';
  };

  const selectedIncident = traces.find((trace) => trace.mac === selectedTrace) || traces[0] || null;

  useEffect(() => {
    if (traces.length > 0 && !selectedTrace) {
      loadTimeline(traces[0].mac || 'unknown');
    }
  }, [traces, selectedTrace]);

  useEffect(() => {
    if (!selectedIncident?.mac) {
      setActionHistory([]);
      return;
    }

    axios.get(`/v1/attack-response/${selectedIncident.mac}`)
      .then((res) => {
        setActionHistory(res.data.history || []);
        if (!actionNote && res.data.response_notes) {
          setActionNote(res.data.response_notes);
        }
      })
      .catch(() => setActionHistory([]));
  }, [selectedIncident?.mac]);

  const handleDefenseAction = async (action) => {
    if (!selectedIncident?.mac) {
      return;
    }

    if (!localStorage.getItem('authToken')) {
      setActionMessage('Log in as an operator or admin to take response actions.');
      return;
    }

    setActionBusy(true);
    setActionMessage('');

    try {
      const response = await axios.post(
        '/v1/attack-response',
        { mac: selectedIncident.mac, action, note: actionNote },
        { headers: getAuthHeaders() }
      );

      setActionMessage(`Saved action: ${formatContainmentStatus(response.data.containment_status)}`);

      const [traceRes, historyRes] = await Promise.all([
        axios.get('/v1/attack-traces'),
        axios.get(`/v1/attack-response/${selectedIncident.mac}`)
      ]);

      setTraces(traceRes.data.traces || []);
      setActionHistory(historyRes.data.history || []);
      await loadTimeline(selectedIncident.mac);
    } catch (err) {
      setActionMessage(err?.response?.data?.error || 'Unable to apply the defense action right now.');
    } finally {
      setActionBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="page">
        <h1>Incident Review</h1>
        <p>Loading incident data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <h1>Incident Review</h1>
        <p className="error">{error}</p>
      </div>
    );
  }

  const highPriorityCount = traces.filter((trace) => Number(trace.risk_score) >= 7).length;
  const linkedPatternCount = chains.length;
  const watchlistCount = intelligence?.active_threats?.length || 0;
  const responseChecklist = buildResponseChecklist(selectedIncident);

  return (
    <div className="page">
      <h1>Incident Review</h1>
      <div className="banner-panel">
        <p>irongateguardguard can trace suspicious activity to an estimated city-level origin, link related events, and present a readable incident timeline.</p>
      </div>

      <div className="card-grid">
        <section className="card stat-card">
          <h2>{traces.length}</h2>
          <p>Open incidents</p>
        </section>
        <section className="card stat-card">
          <h2>{highPriorityCount}</h2>
          <p>High priority now</p>
        </section>
        <section className="card stat-card">
          <h2>{linkedPatternCount}</h2>
          <p>Linked attack patterns</p>
        </section>
        <section className="card stat-card">
          <h2>{watchlistCount}</h2>
          <p>Watchlist matches</p>
        </section>
      </div>

      <section className="card recommendation-card" style={{ marginBottom: '24px' }}>
        <h2>Recommended response path</h2>
        <p>
          {selectedIncident
            ? `Focus first on ${formatAttackVector(selectedIncident.attack_vector)} from ${selectedIncident.attacker_location?.city || 'the detected origin'} with priority ${selectedIncident.risk_score}/10.`
            : 'As incidents arrive, this panel will turn the signal into a simple response path for your team.'}
        </p>
        <ul className="response-list">
          {responseChecklist.map((step, index) => (
            <li key={index}>{step}</li>
          ))}
        </ul>
      </section>

      <section className="card tracing-card defense-card">
        <h2>Active defense controls</h2>
        {!selectedIncident && <p className="empty-state">Select an incident to activate response actions.</p>}
        {selectedIncident && (
          <>
            <div className="defense-status-row">
              <span className={`defense-pill status-${selectedIncident.containment_status || 'active'}`}>
                {formatContainmentStatus(selectedIncident.containment_status || 'active')}
              </span>
              {selectedIncident.last_action_at && (
                <span className="trace-time">Last action {new Date(selectedIncident.last_action_at).toLocaleString()}</span>
              )}
            </div>
            <p className="section-intro">Use these actions to contain the threat, switch to watch mode, or mark the incident resolved.</p>
            <textarea
              className="defense-note"
              rows="3"
              value={actionNote}
              onChange={(event) => setActionNote(event.target.value)}
              placeholder="Add operator notes or the reason for the action"
            />
            <div className="defense-actions">
              <button className="defense-button contain" disabled={actionBusy} onClick={() => handleDefenseAction('contain')}>Contain device</button>
              <button className="defense-button monitor" disabled={actionBusy} onClick={() => handleDefenseAction('monitor')}>Monitor only</button>
              <button className="defense-button resolve" disabled={actionBusy} onClick={() => handleDefenseAction('resolve')}>Mark resolved</button>
            </div>
            {actionMessage && <p className="card-support-text">{actionMessage}</p>}
            <div className="response-history">
              <h3>Recent response history</h3>
              {actionHistory.length === 0 && <p className="empty-state">No manual response actions logged yet.</p>}
              {actionHistory.map((entry, index) => (
                <div key={index} className="history-item">
                  <strong>{formatPattern(entry.action)}</strong>
                  <span>{entry.actor}</span>
                  <span>{entry.note}</span>
                  <span>{new Date(entry.created_at).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      <div className="tracing-grid">
        <section className="card tracing-card">
          <h2>Recent incidents</h2>
          <div className="trace-list">
            {traces.length === 0 && <p className="empty-state">No recent incidents found. This list will update automatically when new activity arrives.</p>}
            {traces.slice(0, 10).map((trace, i) => (
              <div key={i} className="trace-item" onClick={() => loadTimeline(trace.mac || 'unknown')}>
                <div className="trace-header">
                  <span className="trace-vector" style={{ color: getSeverityColor(trace.severity) }}>
                    {formatAttackVector(trace.attack_vector)}
                  </span>
                  <span className="trace-location">
                    Estimated origin: {trace.attacker_location?.city}, {trace.attacker_location?.country}
                  </span>
                  <span className="trace-risk" style={{ color: getRiskColor(trace.risk_score) }}>
                    Priority: {trace.risk_score}/10
                  </span>
                  <span className={`defense-pill compact status-${trace.containment_status || 'active'}`}>
                    {formatContainmentStatus(trace.containment_status || 'active')}
                  </span>
                </div>
                {trace.attack_pattern && (
                  <div className="trace-pattern">
                    Linked pattern: {formatPattern(trace.attack_pattern.pattern)} ({trace.attack_pattern.confidence.toFixed(1)}% confidence)
                  </div>
                )}
                {trace.threat_intelligence?.length > 0 && (
                  <div className="trace-intel">
                    Watchlist match: {trace.threat_intelligence.join(', ')}
                  </div>
                )}
                <div className="trace-time">
                  {new Date(trace.timestamp).toLocaleTimeString()}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="card tracing-card">
          <h2>Linked activity</h2>
          <div className="chain-list">
            {chains.length === 0 && <p className="empty-state">No linked activity patterns detected yet.</p>}
            {chains.map((chain, i) => (
              <div key={i} className="chain-item">
                <div className="chain-header">
                  <span className="chain-pattern">{formatPattern(chain.pattern)}</span>
                  <span className={`chain-risk risk-${chain.risk_level.toLowerCase()}`}>
                    {chain.risk_level}
                  </span>
                </div>
                <div className="chain-events">
                  {chain.events.length} connected event{chain.events.length === 1 ? '' : 's'} | Started {new Date(chain.start_time).toLocaleTimeString()}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="card tracing-card">
          <h2>Watchlist signals</h2>
          {intelligence && (
            <div className="intel-content">
              <div className="intel-section">
                <h3>Current watchlist matches</h3>
                {intelligence.active_threats.length === 0 && <p className="empty-state">No active watchlist matches right now.</p>}
                {intelligence.active_threats.map((threat, i) => (
                  <div key={i} className="intel-threat">
                    <span className="threat-device">{threat.device}</span>
                    <span className="threat-location">{threat.location.city}</span>
                    <div className="threat-details">
                      {threat.threats.map((t, j) => (
                        <span key={j} className="threat-tag">{t}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="intel-section">
                <h3>Known signatures</h3>
                <div className="signature-list">
                  {(intelligence.known_signatures || []).map((sig, i) => (
                    <span key={i} className="signature-tag">{sig}</span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>

        {selectedTrace && (
          <section className="card tracing-card timeline-card">
            <h2>Incident timeline: {selectedTrace}</h2>
            <div className="timeline">
              {timeline.length === 0 && <p className="empty-state">No timeline events are available for this device yet.</p>}
              {timeline.map((event, i) => (
                <div key={i} className="timeline-event">
                  <div className="timeline-dot" style={{ backgroundColor: getSeverityColor(event.severity) }}></div>
                  <div className="timeline-content">
                    <div className="timeline-header">
                      <span className="timeline-type">{formatAttackVector(event.event_type)}</span>
                      <span className="timeline-risk" style={{ color: getRiskColor(event.risk_score) }}>
                        Priority: {event.risk_score}/10
                      </span>
                    </div>
                    <div className="timeline-location">
                      Estimated origin: {event.location.city}, {event.location.country}
                    </div>
                    <div className="timeline-time">
                      {new Date(event.timestamp).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
