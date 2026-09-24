import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Table from '../components/ui/Table';
import Modal from '../components/ui/Modal';
import { employeeService } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export default function EmployeeProfilePage({ isSelf = false }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { addToast } = useToast();

  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'personal' | 'employment' | 'performance' | 'activities' | 'id_card'
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Data
  const [employee, setEmployee] = useState(null);
  const [performance, setPerformance] = useState(null);
  const [activities, setActivities] = useState([]);
  const [activeCard, setActiveCard] = useState(null);

  // Photo Upload Modal
  const [isPhotoModalOpen, setIsPhotoModalOpen] = useState(false);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [photoBase64, setPhotoBase64] = useState('');
  const [photoMime, setPhotoMime] = useState('image/jpeg');

  // Personal Info Edit Modal (Self or Manager)
  const [isEditPersonalOpen, setIsEditPersonalOpen] = useState(false);
  const [personalForm, setPersonalForm] = useState({
    phone: '',
    address: '',
    city: '',
    state: '',
    postal_code: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    emergency_contact_relation: '',
    qualifications: '',
    skills: '',
    bio_notes: '',
  });

  // Load employee profile
  const fetchProfile = async () => {
    setLoading(true);
    try {
      let emp;
      if (isSelf) {
        const res = await employeeService.getMyProfile();
        emp = res.data?.data || res.data;
      } else {
        const res = await employeeService.getById(id);
        emp = res.data?.data || res.data;
      }
      setEmployee(emp);

      // Populate personal form
      setPersonalForm({
        phone: emp.phone || '',
        address: emp.address || '',
        city: emp.city || '',
        state: emp.state || '',
        postal_code: emp.postal_code || '',
        emergency_contact_name: emp.emergency_contact_name || '',
        emergency_contact_phone: emp.emergency_contact_phone || '',
        emergency_contact_relation: emp.emergency_contact_relation || '',
        qualifications: emp.qualifications || '',
        skills: emp.skills || '',
        bio_notes: emp.bio_notes || '',
      });

      // Load sub-resources concurrently
      const empId = emp.id;
      const [perfRes, actRes, cardRes] = await Promise.all([
        employeeService.getPerformance(empId).catch(() => null),
        employeeService.getActivities(empId, { limit: 50 }).catch(() => null),
        employeeService.getIdCards({ employeeId: empId, status: 'ACTIVE' }).catch(() => null),
      ]);

      if (perfRes?.data?.data || perfRes?.data) {
        setPerformance(perfRes.data?.data || perfRes.data);
      }
      if (actRes?.data?.data || actRes?.data) {
        setActivities(actRes.data?.data || actRes.data || []);
      }
      const cardsList = cardRes?.data?.data || cardRes?.data || [];
      if (cardsList.length > 0) {
        setActiveCard(cardsList[0]);
      } else {
        setActiveCard(null);
      }
    } catch (err) {
      addToast(`Failed to load profile: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, [id, isSelf]);

  // Handle Photo Selection
  const handlePhotoFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      addToast('Please select a JPEG, PNG, or WebP image.', 'error');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      addToast('Photo file size cannot exceed 5 MB.', 'error');
      return;
    }

    setPhotoMime(file.type);
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result;
      setPhotoPreview(result);
      setPhotoBase64(result);
    };
    reader.readAsDataURL(file);
  };

  // Submit Photo Upload
  const handleUploadPhotoSubmit = async (e) => {
    e.preventDefault();
    if (!photoBase64 || !employee) return;
    setActionLoading(true);
    try {
      await employeeService.uploadPhoto(employee.id, {
        photoBase64,
        mimeType: photoMime,
      });
      addToast('Profile photograph updated successfully.', 'success');
      setIsPhotoModalOpen(false);
      setPhotoPreview(null);
      fetchProfile();
    } catch (err) {
      addToast(`Photo upload failed: ${err.message}`, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Submit Personal Details Update (Self or Manager)
  const handleSavePersonalSubmit = async (e) => {
    e.preventDefault();
    if (!employee) return;
    setActionLoading(true);
    try {
      if (isSelf) {
        await employeeService.updateMyProfile(personalForm);
      } else {
        await employeeService.update(employee.id, personalForm);
      }
      addToast('Personal information updated successfully.', 'success');
      setIsEditPersonalOpen(false);
      fetchProfile();
    } catch (err) {
      addToast(`Update failed: ${err.message}`, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Download ID Card PDF
  const handleDownloadPDF = () => {
    if (!activeCard) return;
    employeeService.downloadIdCardPDF(activeCard.id);
    addToast('Official ID card PDF opened in viewer.', 'success');
  };

  if (loading && !employee) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
        Loading personnel record...
      </div>
    );
  }

  if (!employee) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center' }}>
        <h3 style={{ color: 'var(--text-primary)' }}>Personnel Record Not Found</h3>
        <p style={{ color: 'var(--text-secondary)' }}>The requested employee could not be located.</p>
        <Button variant="primary" onClick={() => navigate('/app/employees')} style={{ marginTop: '1rem' }}>
          Back to Directory
        </Button>
      </div>
    );
  }

  return (
    <div>
      {/* Top Banner / Hero Card */}
      <Card style={{ marginBottom: '1.5rem', padding: '1.5rem' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1.5rem',
          }}
        >
          {/* Avatar & Key Details */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative' }}>
              <div
                style={{
                  width: '90px',
                  height: '90px',
                  borderRadius: '50%',
                  background: 'var(--bg-surface)',
                  border: '3px solid var(--brand-accent, #ca8a04)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: '2rem',
                  color: 'var(--brand-accent)',
                  overflow: 'hidden',
                  boxShadow: 'var(--shadow-md)',
                }}
              >
                {employee.photo_url ? (
                  <img
                    src={`/api/v1/employees/${employee.id}/photo?t=${Date.now()}`}
                    alt={employee.full_name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={(e) => {
                      e.target.style.display = 'none';
                    }}
                  />
                ) : (
                  `${employee.first_name?.[0] || ''}${employee.last_name?.[0] || ''}`
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setPhotoPreview(null);
                  setIsPhotoModalOpen(true);
                }}
                style={{
                  position: 'absolute',
                  bottom: '0',
                  right: '0',
                  background: 'var(--brand-accent, #ca8a04)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '50%',
                  width: '28px',
                  height: '28px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.85rem',
                }}
                title="Change Photo"
              >
                📷
              </button>
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                <h2 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                  {employee.full_name}
                </h2>
                <Badge status={employee.employment_status}>{employee.employment_status}</Badge>
                {isSelf && <Badge status="info">SELF-SERVICE PORTAL</Badge>}
              </div>
              <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--brand-accent)', marginTop: '0.2rem' }}>
                {employee.job_title} • {employee.department?.replace('_', ' ')}
              </div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                Staff ID: <strong style={{ color: 'var(--text-primary)' }}>{employee.employee_code}</strong> | Property:{' '}
                {employee.property_name || 'All Properties (Global)'}
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <Button variant="secondary" onClick={() => setIsEditPersonalOpen(true)}>
              ✏️ Edit Info
            </Button>
            {activeCard && (
              <Button variant="outline" onClick={handleDownloadPDF}>
                📄 Download ID Card
              </Button>
            )}
            {!isSelf && (
              <Button variant="primary" onClick={() => navigate('/app/evaluations')}>
                📋 Start Evaluation
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Tabs Navigation */}
      <Card style={{ marginBottom: '1.5rem', padding: '0.5rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {[
            { id: 'overview', label: '👤 Profile Overview' },
            { id: 'employment', label: '🏢 Employment & Org' },
            { id: 'performance', label: '📊 Performance & Metrics' },
            { id: 'activities', label: `🛠️ Activity Log (${activities.length})` },
            { id: 'id_card', label: '🪪 Staff ID Card' },
          ].map((tab) => (
            <Button
              key={tab.id}
              variant={activeTab === tab.id ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </Button>
          ))}
        </div>
      </Card>

      {/* TAB 1: PROFILE OVERVIEW & PERSONAL */}
      {activeTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
            {/* Contact & Personal Card */}
            <Card title="Personal & Contact Information">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.88rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-default)', paddingBottom: '0.4rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Work Email:</span>
                  <strong>{employee.email}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-default)', paddingBottom: '0.4rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Phone Number:</span>
                  <strong>{employee.phone}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-default)', paddingBottom: '0.4rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Date of Birth:</span>
                  <strong>{employee.date_of_birth ? new Date(employee.date_of_birth).toLocaleDateString() : 'Not provided'}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-default)', paddingBottom: '0.4rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Gender:</span>
                  <strong>{employee.gender || 'Not specified'}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-default)', paddingBottom: '0.4rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Residential Address:</span>
                  <strong style={{ maxWidth: '200px', textAlign: 'right' }}>{employee.address || 'Not specified'}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>City & State:</span>
                  <strong>{employee.city || 'Lagos'}, {employee.state || 'Lagos State'}</strong>
                </div>
              </div>
            </Card>

            {/* Emergency Contact Card */}
            <Card title="Emergency Contact & Next of Kin">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.88rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-default)', paddingBottom: '0.4rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Contact Name:</span>
                  <strong>{employee.emergency_contact_name || 'Not provided'}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-default)', paddingBottom: '0.4rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Emergency Phone:</span>
                  <strong>{employee.emergency_contact_phone || 'Not provided'}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Relationship:</span>
                  <strong>{employee.emergency_contact_relation || 'Not specified'}</strong>
                </div>
              </div>

              <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--border-default)' }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
                  QUALIFICATIONS & CREDENTIALS
                </div>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-primary)', margin: 0 }}>
                  {employee.qualifications || 'No qualifications recorded.'}
                </p>
              </div>

              <div style={{ marginTop: '1rem' }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
                  CORE SKILLS & SPECIALTIES
                </div>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-primary)', margin: 0 }}>
                  {employee.skills || 'No skills listed.'}
                </p>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* TAB 2: EMPLOYMENT & ORG */}
      {activeTab === 'employment' && (
        <Card title="Employment Details & Reporting Hierarchy">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.88rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-default)', paddingBottom: '0.4rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Official Staff Code:</span>
                <strong style={{ fontFamily: 'monospace' }}>{employee.employee_code}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-default)', paddingBottom: '0.4rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Department:</span>
                <strong>{employee.department?.replace('_', ' ')}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-default)', paddingBottom: '0.4rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Job Title:</span>
                <strong>{employee.job_title}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-default)', paddingBottom: '0.4rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Employment Type:</span>
                <strong>{employee.employment_type?.replace('_', ' ')}</strong>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.88rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-default)', paddingBottom: '0.4rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Assigned Property:</span>
                <strong>{employee.property_name || 'All Properties (Global)'}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-default)', paddingBottom: '0.4rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Direct Supervisor:</span>
                <strong>{employee.manager_name || 'Executive Management'}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-default)', paddingBottom: '0.4rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Hire Date:</span>
                <strong>{employee.hire_date ? new Date(employee.hire_date).toLocaleDateString() : 'N/A'}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-default)', paddingBottom: '0.4rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>User Portal Link:</span>
                <strong>{employee.user_id ? `User #${employee.user_id} (${employee.user_role})` : 'Unlinked'}</strong>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* TAB 3: PERFORMANCE & METRICS */}
      {activeTab === 'performance' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Performance Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            <Card>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
                Observed Actions
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.25rem' }}>
                {performance?.systemMetrics?.totalActivities ?? 0}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                Logged operational actions
              </div>
            </Card>

            <Card>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
                Attendance Rate
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#10b981', marginTop: '0.25rem' }}>
                {performance?.systemMetrics?.estimatedAttendanceRate ?? 100}%
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                {performance?.systemMetrics?.observedActiveDays ?? 0} active days observed
              </div>
            </Card>

            <Card>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
                Latest Evaluation
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--brand-accent, #ca8a04)', marginTop: '0.25rem' }}>
                {performance?.evaluationSummary?.latestScore !== null ? `${performance?.evaluationSummary?.latestScore}%` : 'N/A'}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                Manager assessment score
              </div>
            </Card>

            <Card>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
                Historical Average
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.25rem' }}>
                {performance?.evaluationSummary?.averageScore !== null ? `${performance?.evaluationSummary?.averageScore}%` : 'N/A'}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                Across {performance?.evaluationSummary?.finalizedEvaluationsCount ?? 0} finalized reviews
              </div>
            </Card>
          </div>

          {/* Dimension Breakdown if available */}
          {performance?.evaluationSummary?.dimensionBreakdown && Object.keys(performance.evaluationSummary.dimensionBreakdown).length > 0 && (
            <Card title="Evaluation Dimension Breakdown (Latest Finalized Review)">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
                {Object.entries(performance.evaluationSummary.dimensionBreakdown).map(([dim, score]) => (
                  <div key={dim} style={{ padding: '0.75rem', background: 'var(--bg-card)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem', fontSize: '0.85rem' }}>
                      <strong style={{ color: 'var(--text-primary)' }}>{dim}</strong>
                      <span style={{ fontWeight: 700, color: score >= 80 ? '#10b981' : '#f59e0b' }}>{score}%</span>
                    </div>
                    <div style={{ width: '100%', height: '6px', background: 'var(--border-default)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${Math.min(100, score)}%`,
                          height: '100%',
                          background: score >= 80 ? '#10b981' : '#f59e0b',
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* TAB 4: ACTIVITY LOG */}
      {activeTab === 'activities' && (
        <Card title={`Operational Activity Log (${activities.length})`}>
          {activities.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              No operational activities logged for this employee yet.
            </div>
          ) : (
            <Table>
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Activity Type</th>
                  <th>Category</th>
                  <th>Description</th>
                  <th>Entity</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {activities.map((act) => (
                  <tr key={act.id}>
                    <td style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                      {new Date(act.created_at).toLocaleString()}
                    </td>
                    <td>
                      <span
                        style={{
                          fontFamily: 'monospace',
                          fontSize: '0.75rem',
                          padding: '0.15rem 0.4rem',
                          background: 'var(--bg-surface)',
                          borderRadius: '4px',
                          border: '1px solid var(--border-default)',
                        }}
                      >
                        {act.activity_type}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        {act.activity_category}
                      </span>
                    </td>
                    <td style={{ fontWeight: 500 }}>{act.description}</td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {act.related_entity_type ? `${act.related_entity_type} #${act.related_entity_id}` : '—'}
                    </td>
                    <td>
                      <Badge status={act.status === 'SUCCESS' ? 'success' : 'danger'}>{act.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      )}

      {/* TAB 5: STAFF ID CARD */}
      {activeTab === 'id_card' && (
        <Card title="Official Staff Identification Badge">
          {activeCard ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem', padding: '1rem' }}>
              {/* Visual Card Badge */}
              <div
                style={{
                  width: '320px',
                  background: '#0f172a',
                  borderRadius: '12px',
                  border: '2px solid var(--brand-accent, #ca8a04)',
                  boxShadow: 'var(--shadow-lg)',
                  color: '#fff',
                  overflow: 'hidden',
                  textAlign: 'center',
                }}
              >
                {/* Header */}
                <div style={{ padding: '1rem 0.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--brand-accent, #ca8a04)', letterSpacing: '1px' }}>
                    BFA APARTMENTS
                  </div>
                  <div style={{ fontSize: '0.65rem', color: '#94a3b8', letterSpacing: '0.5px' }}>
                    OFFICIAL STAFF IDENTIFICATION BADGE
                  </div>
                </div>

                {/* Avatar */}
                <div style={{ padding: '1.25rem 0 0.5rem' }}>
                  <div
                    style={{
                      width: '90px',
                      height: '90px',
                      borderRadius: '50%',
                      margin: '0 auto',
                      border: '3px solid var(--brand-accent, #ca8a04)',
                      background: '#1e293b',
                      overflow: 'hidden',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {employee.photo_url ? (
                      <img
                        src={`/api/v1/employees/${employee.id}/photo`}
                        alt={employee.full_name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      <span style={{ fontSize: '2rem' }}>👤</span>
                    )}
                  </div>
                </div>

                {/* Name & Title */}
                <div style={{ padding: '0 1rem 1rem' }}>
                  <div style={{ fontSize: '1.15rem', fontWeight: 700, color: '#fff' }}>{employee.full_name}</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--brand-accent, #ca8a04)', fontWeight: 600 }}>
                    {employee.job_title}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.2rem' }}>
                    Dept: {employee.department?.replace('_', ' ')}
                  </div>
                </div>

                {/* Badge Details Grid */}
                <div
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    padding: '0.75rem',
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '0.5rem',
                    fontSize: '0.72rem',
                    textAlign: 'left',
                    borderTop: '1px solid rgba(255,255,255,0.1)',
                  }}
                >
                  <div>
                    <span style={{ color: '#94a3b8', display: 'block' }}>STAFF ID</span>
                    <strong style={{ color: '#fff' }}>{employee.employee_code}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#94a3b8', display: 'block' }}>CARD NUMBER</span>
                    <strong style={{ color: '#fff' }}>{activeCard.card_number}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#94a3b8', display: 'block' }}>ISSUED DATE</span>
                    <strong style={{ color: '#fff' }}>{activeCard.issued_at}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#94a3b8', display: 'block' }}>VALID THRU</span>
                    <strong style={{ color: '#10b981' }}>{activeCard.expires_at}</strong>
                  </div>
                </div>

                {/* Footer bar */}
                <div style={{ padding: '0.4rem', background: '#020617', fontSize: '0.65rem', color: '#64748b' }}>
                  PROPERTY OF BFA APARTMENTS • AUTHORIZED ACCESS ONLY
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <Button variant="primary" onClick={handleDownloadPDF}>
                  📄 Download Print-Ready PDF Badge
                </Button>
                <Button variant="secondary" onClick={() => navigate('/app/id-cards')}>
                  Manage All ID Cards
                </Button>
              </div>
            </div>
          ) : (
            <div style={{ padding: '2.5rem', textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🪪</div>
              <h4 style={{ color: 'var(--text-primary)', margin: '0 0 0.5rem' }}>No Active ID Card</h4>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', margin: '0 0 1rem' }}>
                An active identification card has not been issued for this employee.
              </p>
              {!isSelf && (
                <Button variant="primary" onClick={() => navigate('/app/id-cards')}>
                  Issue ID Card
                </Button>
              )}
            </div>
          )}
        </Card>
      )}

      {/* MODAL: UPLOAD PROFILE PHOTO */}
      <Modal
        isOpen={isPhotoModalOpen}
        onClose={() => setIsPhotoModalOpen(false)}
        title="Upload Staff Photograph"
        size="sm"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <Button variant="secondary" onClick={() => setIsPhotoModalOpen(false)} disabled={actionLoading}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleUploadPhotoSubmit} disabled={actionLoading || !photoBase64}>
              {actionLoading ? 'Uploading...' : 'Save Photograph'}
            </Button>
          </div>
        }
      >
        <form onSubmit={handleUploadPhotoSubmit} className="photo-upload-wrapper">
          <p className="photo-upload-meta" style={{ margin: 0 }}>
            Upload a high-resolution portrait photograph for official employee credentials, digital security badge, and audit logs.
          </p>

          {/* Preview Ring */}
          <div className="photo-preview-ring">
            {photoPreview ? (
              <img src={photoPreview} alt="Preview" className="photo-preview-img" />
            ) : (
              <span style={{ fontSize: '2.75rem', opacity: 0.6 }}>📷</span>
            )}
          </div>

          <div style={{ width: '100%' }}>
            <input
              type="file"
              id="employee-photo-file-input"
              accept="image/jpeg,image/png,image/webp"
              onChange={handlePhotoFileChange}
              className="form-control"
              style={{ fontSize: '0.82rem', padding: '0.45rem' }}
            />
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.4rem', textAlign: 'center' }}>
              JPG, PNG, or WebP • Max 5 MB • Square aspect ratio recommended
            </div>
          </div>
        </form>
      </Modal>

      {/* MODAL: EDIT PERSONAL DETAILS */}
      <Modal
        isOpen={isEditPersonalOpen}
        onClose={() => setIsEditPersonalOpen(false)}
        title="Edit Personal Information"
        size="md"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <Button variant="secondary" onClick={() => setIsEditPersonalOpen(false)} disabled={actionLoading}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSavePersonalSubmit} disabled={actionLoading}>
              {actionLoading ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        }
      >
        <form onSubmit={handleSavePersonalSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {/* Section: Contact & Residential */}
          <div className="form-section">
            <span className="form-section-title">
              <span>📞</span> Contact & Location
            </span>
          </div>

          <div className="form-group">
            <label className="form-label">Phone Number *</label>
            <input
              type="tel"
              required
              className="form-control"
              value={personalForm.phone}
              onChange={(e) => setPersonalForm({ ...personalForm, phone: e.target.value })}
              placeholder="+234 800..."
            />
          </div>

          <div className="form-group">
            <label className="form-label">Residential Address</label>
            <input
              type="text"
              className="form-control"
              value={personalForm.address}
              onChange={(e) => setPersonalForm({ ...personalForm, address: e.target.value })}
              placeholder="House/Apt number, Street name"
            />
          </div>

          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label">City</label>
              <input
                type="text"
                className="form-control"
                value={personalForm.city}
                onChange={(e) => setPersonalForm({ ...personalForm, city: e.target.value })}
                placeholder="e.g. Lagos"
              />
            </div>

            <div className="form-group">
              <label className="form-label">State / Region</label>
              <input
                type="text"
                className="form-control"
                value={personalForm.state}
                onChange={(e) => setPersonalForm({ ...personalForm, state: e.target.value })}
                placeholder="e.g. Lagos State"
              />
            </div>
          </div>

          {/* Section: Emergency Contact */}
          <div className="form-section">
            <span className="form-section-title">
              <span>🚨</span> Emergency Contact Details
            </span>
          </div>

          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label">Emergency Contact Name</label>
              <input
                type="text"
                className="form-control"
                value={personalForm.emergency_contact_name}
                onChange={(e) => setPersonalForm({ ...personalForm, emergency_contact_name: e.target.value })}
                placeholder="Full legal name"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Emergency Phone</label>
              <input
                type="tel"
                className="form-control"
                value={personalForm.emergency_contact_phone}
                onChange={(e) => setPersonalForm({ ...personalForm, emergency_contact_phone: e.target.value })}
                placeholder="+234 800..."
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Emergency Relationship</label>
            <input
              type="text"
              className="form-control"
              value={personalForm.emergency_contact_relation}
              onChange={(e) => setPersonalForm({ ...personalForm, emergency_contact_relation: e.target.value })}
              placeholder="Spouse / Parent / Next of Kin"
            />
          </div>

          {/* Section: Qualifications & Skills */}
          <div className="form-section">
            <span className="form-section-title">
              <span>🎓</span> Professional Information
            </span>
          </div>

          <div className="form-group">
            <label className="form-label">Qualifications & Certifications</label>
            <textarea
              rows="2"
              className="form-textarea"
              value={personalForm.qualifications}
              onChange={(e) => setPersonalForm({ ...personalForm, qualifications: e.target.value })}
              placeholder="Degrees, licenses, certifications..."
            />
          </div>

          <div className="form-group">
            <label className="form-label">Core Skills & Specializations</label>
            <textarea
              rows="2"
              className="form-textarea"
              value={personalForm.skills}
              onChange={(e) => setPersonalForm({ ...personalForm, skills: e.target.value })}
              placeholder="Technical competencies, languages, domain skills..."
            />
          </div>
        </form>
      </Modal>
    </div>
  );
}
