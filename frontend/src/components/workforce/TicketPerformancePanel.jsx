import React, { useState, useEffect } from 'react';
import Card from '../ui/Card';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import { operationsService } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { Clock, CheckCircle, AlertTriangle, Award, Sliders, TrendingUp } from 'lucide-react';

const DIMENSION_LABELS = [
  { key: 'attendance', label: 'Attendance & 09:00 WAT Punctuality' },
  { key: 'acknowledgment', label: 'Ticket Ack SLA Compliance' },
  { key: 'execution', label: 'Execution Timeliness & Completion' },
  { key: 'quality', label: 'Quality & Verification Accuracy' },
  { key: 'workload', label: 'Weighted Workload Throughput' },
];

export default function TicketPerformancePanel({
  data,
  canEditWeights = false,
  onWeightsSaved,
  isOwner = false,
}) {
  const { addToast } = useToast();
  const [editingWeights, setEditingWeights] = useState(false);
  const [weightsForm, setWeightsForm] = useState({
    attendance: 20,
    acknowledgment: 15,
    execution: 30,
    quality: 20,
    workload: 15,
    minTicketThreshold: 3,
  });
  const [savingWeights, setSavingWeights] = useState(false);

  useEffect(() => {
    if (data?.weights) {
      setWeightsForm({
        attendance: Number(data.weights.attendance ?? 20),
        acknowledgment: Number(data.weights.acknowledgment ?? data.weights.ackSla ?? 15),
        execution: Number(data.weights.execution ?? data.weights.executionTimeliness ?? 30),
        quality: Number(data.weights.quality ?? 20),
        workload: Number(data.weights.workload ?? 15),
        minTicketThreshold: Number(data.minTicketThreshold ?? 3),
      });
    }
  }, [data?.weights, data?.minTicketThreshold]);

  if (!data) {
    return null;
  }

  const att = data.attendanceMetrics || {};
  const tm = data.ticketMetrics || {};
  const breakdown = data.scoreBreakdown || {};
  const recommendations = Array.isArray(data.improvementRecommendations) ? data.improvementRecommendations : [];
  const reassignContext = Array.isArray(data.reassignmentContext) ? data.reassignmentContext : [];

  const weightSum =
    Number(weightsForm.attendance || 0) +
    Number(weightsForm.acknowledgment || 0) +
    Number(weightsForm.execution || 0) +
    Number(weightsForm.quality || 0) +
    Number(weightsForm.workload || 0);

  const handleSaveWeights = async (e) => {
    e.preventDefault();
    if (weightSum !== 100) {
      addToast(`Dimension weights must sum to exactly 100% (currently ${weightSum}%).`, 'warning');
      return;
    }
    setSavingWeights(true);
    try {
      await operationsService.updatePerformanceConfig({
        weights: {
          attendance: Number(weightsForm.attendance),
          acknowledgment: Number(weightsForm.acknowledgment),
          execution: Number(weightsForm.execution),
          quality: Number(weightsForm.quality),
          workload: Number(weightsForm.workload),
        },
        minTicketThreshold: Number(weightsForm.minTicketThreshold || 3),
      });
      addToast('Performance scoring weights updated across organization.', 'success');
      setEditingWeights(false);
      onWeightsSaved?.();
    } catch (err) {
      addToast(err.response?.data?.message || err.message || 'Failed to save weights.', 'error');
    } finally {
      setSavingWeights(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Header Banner & Composite Score */}
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <Award size={20} style={{ color: 'var(--brand-accent, #ca8a04)' }} />
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>
                Verified Ticket & Attendance Performance Engine
              </h3>
              <Badge status="available">{data.period?.timezone || 'Africa/Lagos'}</Badge>
              {data.insufficientData && <Badge status="warning">LOW SAMPLE ADVISORY</Badge>}
            </div>
            <p style={{ margin: '0.35rem 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Window: <strong>{data.period?.startDate}</strong> to <strong>{data.period?.endDate}</strong> · {data.evaluationMethod}
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700 }}>
                Composite Score
              </div>
              <div style={{ fontSize: '1.9rem', fontWeight: 800, color: (data.overallCompositeScore ?? 0) >= 80 ? '#10b981' : (data.overallCompositeScore ?? 0) >= 60 ? '#f59e0b' : '#ef4444', lineHeight: 1.1 }}>
                {data.overallCompositeScore ?? 0}%
              </div>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                Tier: {data.rating || 'N/A'}
              </div>
            </div>

            {canEditWeights && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditingWeights((v) => !v)}
                icon={<Sliders size={14} />}
              >
                {editingWeights ? 'Close Weight Config' : 'Configure Weights'}
              </Button>
            )}
          </div>
        </div>

        {/* Insufficient Ticket Threshold Notice */}
        {data.insufficientData && (
          <div
            style={{
              marginTop: '0.9rem',
              padding: '0.7rem 0.9rem',
              borderRadius: '8px',
              background: 'rgba(245, 158, 11, 0.1)',
              border: '1px solid rgba(245, 158, 11, 0.35)',
              color: '#f59e0b',
              fontSize: '0.8rem',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <AlertTriangle size={16} style={{ flexShrink: 0 }} />
            <span>
              <strong>Low Ticket Sample Notice:</strong> Only {data.assessedTicketCount ?? 0} assessed ticket(s) in this window (minimum statistical threshold: {data.minTicketThreshold ?? 3}). Percentage rates remain advisory.
            </span>
          </div>
        )}

        {/* Owner Privacy Notice */}
        {isOwner && data.disciplinary?.restrictedFromOwner && (
          <div style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Executive Privacy Governance: Disciplinary queries, show-cause records, and private PIP logs are redacted from Owner analytics.
          </div>
        )}
      </Card>

      {/* Configurable Weights Editor (Management) */}
      {canEditWeights && editingWeights && (
        <Card title="Management Performance Dimension Weights (Must Sum to 100%)">
          <form onSubmit={handleSaveWeights} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))', gap: '0.75rem' }}>
              {DIMENSION_LABELS.map((dim) => (
                <div key={dim.key}>
                  <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                    {dim.label} (%)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={weightsForm[dim.key]}
                    onChange={(e) => setWeightsForm((prev) => ({ ...prev, [dim.key]: Number(e.target.value) }))}
                    style={{
                      width: '100%',
                      padding: '0.4rem 0.6rem',
                      borderRadius: '6px',
                      border: '1px solid var(--border-default)',
                      background: 'var(--bg-surface)',
                      color: 'var(--text-primary)',
                    }}
                  />
                </div>
              ))}
              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                  Min Ticket Sample Guard
                </label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={weightsForm.minTicketThreshold}
                  onChange={(e) => setWeightsForm((prev) => ({ ...prev, minTicketThreshold: Number(e.target.value) }))}
                  style={{
                    width: '100%',
                    padding: '0.4rem 0.6rem',
                    borderRadius: '6px',
                    border: '1px solid var(--border-default)',
                    background: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: weightSum === 100 ? '#10b981' : '#ef4444' }}>
                Current Total Weight: {weightSum}% / 100%
              </span>
              <Button variant="primary" size="sm" type="submit" disabled={savingWeights || weightSum !== 100}>
                {savingWeights ? 'Saving...' : 'Save Scoring Weights'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Transparent Weighted Dimension Formula Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(195px, 1fr))', gap: '0.9rem' }}>
        {DIMENSION_LABELS.map((dim) => {
          const item = breakdown[dim.key] || {};
          const scoreVal = item.rawScore ?? item.score ?? 0;
          const weightVal = item.weightPct ?? item.weight ?? weightsForm[dim.key] ?? 0;
          const weightedPts = item.weightedPoints ?? item.weightedContribution ?? Math.round((scoreVal * weightVal) / 10) / 10;
          return (
            <Card key={dim.key}>
              <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 700 }}>
                {dim.label}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '0.35rem' }}>
                <span style={{ fontSize: '1.5rem', fontWeight: 800, color: scoreVal >= 80 ? '#10b981' : scoreVal >= 60 ? '#f59e0b' : '#ef4444' }}>
                  {scoreVal}%
                </span>
                <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                  Weight {weightVal}% → +{weightedPts} pts
                </span>
              </div>
              {item.formula && (
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                  {item.formula}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Attendance & 09:00 Africa/Lagos Punctuality + Fair Exclusions */}
      <Card title={`Attendance & Punctuality (${att.cutoffRule || '09:00 Africa/Lagos WAT'})`}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: '0.75rem', fontSize: '0.82rem' }}>
          <div><span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.7rem' }}>Scheduled Days</span><strong>{att.scheduledWorkDays ?? 0}</strong></div>
          <div><span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.7rem' }}>Days Worked</span><strong>{att.daysWorked ?? 0}</strong></div>
          <div><span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.7rem' }}>On-Time (&le;09:00 WAT)</span><strong style={{ color: '#10b981' }}>{att.onTimeDays ?? 0}</strong></div>
          <div><span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.7rem' }}>Late Arrivals</span><strong style={{ color: '#f59e0b' }}>{att.lateDays ?? 0} ({att.lateMinutesTotal ?? 0}m)</strong></div>
          <div><span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.7rem' }}>Unapproved Absences</span><strong style={{ color: '#ef4444' }}>{att.unapprovedAbsences ?? 0}</strong></div>
          <div><span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.7rem' }}>Approved Leave (Excluded)</span><strong style={{ color: '#60a5fa' }}>{att.approvedLeaveDays ?? 0}</strong></div>
          <div><span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.7rem' }}>Attendance Rate</span><strong>{att.attendanceRatePct ?? 100}%</strong></div>
          <div><span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.7rem' }}>Punctuality Rate</span><strong>{att.punctualityRatePct ?? 100}%</strong></div>
          <div><span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.7rem' }}>Hours Logged</span><strong>{att.totalHoursWorked ?? 0}h</strong></div>
        </div>
      </Card>

      {/* 19 Authoritative Ticket Indicators */}
      <Card title="Comprehensive Ticket Execution & SLA Scorecard (All 19 Indicators)">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', fontSize: '0.8rem' }}>
          <div style={{ padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
            <div style={{ fontWeight: 700, color: '#60a5fa', marginBottom: '0.45rem', textTransform: 'uppercase', fontSize: '0.72rem' }}>Acknowledgment & SLA</div>
            <div>Assigned / Accepted: <strong>{tm.ticketsAssigned ?? 0}</strong> / <strong>{tm.ticketsAccepted ?? 0}</strong></div>
            <div>Acked On-Time / Late: <strong style={{ color: '#10b981' }}>{tm.ticketsAcknowledgedOnTime ?? 0}</strong> / <strong style={{ color: '#f59e0b' }}>{tm.ticketsAcknowledgedLate ?? 0}</strong></div>
            <div>Unacked Past SLA: <strong style={{ color: '#ef4444' }}>{tm.ticketsUnacknowledgedPastSla ?? 0}</strong></div>
            <div>Avg Ack Time: <strong>{tm.averageAckTimeHours ?? 0}h</strong> (SLA Rate: <strong>{tm.slaAcknowledgmentRate ?? 100}%</strong>)</div>
          </div>

          <div style={{ padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
            <div style={{ fontWeight: 700, color: '#10b981', marginBottom: '0.45rem', textTransform: 'uppercase', fontSize: '0.72rem' }}>Execution & Timeliness</div>
            <div>Started Count / Avg Time to Start: <strong>{tm.ticketsStartedCount ?? 0}</strong> ({tm.averageTimeToStartHours ?? 0}h)</div>
            <div>Completed Total (On-Time / Late): <strong>{tm.ticketsCompleted ?? 0}</strong> (<span style={{ color: '#10b981' }}>{tm.ticketsCompletedOnTime ?? 0}</span> / <span style={{ color: '#f59e0b' }}>{tm.ticketsCompletedLate ?? 0}</span>)</div>
            <div>Avg Completion Duration: <strong>{tm.averageCompletionTimeHours ?? 0}h</strong></div>
            <div>On-Time % / Completion %: <strong>{tm.onTimeCompletionRate ?? 100}%</strong> / <strong>{tm.completionRate ?? 100}%</strong></div>
            <div>Active Overdue: <strong style={{ color: '#ef4444' }}>{tm.ticketsOverdueActive ?? 0}</strong> ({tm.overdueRate ?? 0}%)</div>
          </div>

          <div style={{ padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
            <div style={{ fontWeight: 700, color: '#fb923c', marginBottom: '0.45rem', textTransform: 'uppercase', fontSize: '0.72rem' }}>Reassignment & Fair Exclusions</div>
            <div>Reassigned Out / In: <strong>{tm.ticketsReassignedOut ?? 0}</strong> / <strong>{tm.ticketsReassignedIn ?? 0}</strong> ({tm.reassignmentRate ?? 0}%)</div>
            <div>External Blockers (Protected): <strong>{tm.ticketsBlockedExternal ?? 0}</strong></div>
            <div>Invalid Declined (Excluded): <strong>{tm.ticketsDeclinedInvalid ?? 0}</strong></div>
            <div>Mgmt Cancelled (Excluded): <strong>{tm.ticketsCancelledManagement ?? 0}</strong></div>
          </div>

          <div style={{ padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
            <div style={{ fontWeight: 700, color: '#c084fc', marginBottom: '0.45rem', textTransform: 'uppercase', fontSize: '0.72rem' }}>Quality & Weighted Workload</div>
            <div>Quality Rejections: <strong style={{ color: '#ef4444' }}>{tm.ticketsRejectedQuality ?? 0}</strong></div>
            <div>Revision Requests / Reopens: <strong>{tm.revisionRequestCount ?? 0}</strong> / <strong>{tm.reopenPenaltyCount ?? 0}</strong></div>
            <div>Quality Score: <strong>{tm.qualityScore ?? 100}%</strong></div>
            <div>Weighted Workload: <strong>{tm.weightedWorkloadPoints ?? 0} pts</strong> ({tm.workloadScore ?? 0}%)</div>
          </div>
        </div>
      </Card>

      {/* Recommendations & Reassignment Context */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: '1rem' }}>
        <Card title="Actionable Coaching & Feedback Recommendations">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {recommendations.map((rec, idx) => (
              <div
                key={idx}
                style={{
                  padding: '0.65rem 0.85rem',
                  borderRadius: '8px',
                  background: 'var(--bg-surface)',
                  borderLeft: `4px solid ${rec.severity === 'HIGH' ? '#ef4444' : rec.severity === 'MEDIUM' ? '#f59e0b' : '#10b981'}`,
                  fontSize: '0.78rem',
                }}
              >
                <div style={{ fontWeight: 700 }}>{rec.area}</div>
                <div style={{ color: 'var(--text-secondary)', marginTop: '2px' }}>{rec.finding}</div>
                <div style={{ color: 'var(--text-muted)', marginTop: '3px', fontStyle: 'italic' }}>{rec.recommendation}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card title={`Recent Ticket Reassignment Context (${reassignContext.length})`}>
          {reassignContext.length === 0 ? (
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No ticket reassignments recorded in this period.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {reassignContext.slice(0, 6).map((rc) => (
                <div key={rc.id} style={{ padding: '0.55rem 0.75rem', borderRadius: '6px', background: 'var(--bg-surface)', fontSize: '0.76rem' }}>
                  <div><strong>{rc.ticket_reference || rc.operation_code}</strong> · {rc.previous_user_name || 'Pool'} &rarr; {rc.new_user_name}</div>
                  <div style={{ color: 'var(--text-muted)' }}>By {rc.reassigned_by_name} · &quot;{rc.reason || 'Operational transfer'}&quot;</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
