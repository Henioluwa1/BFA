import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useProperty } from '../context/PropertyContext';
import { employeeService } from '../services/api';
import Modal, { ConfirmationModal } from '../components/ui/Modal';
import {
  CreditCard,
  QrCode,
  Download,
  RefreshCw,
  Slash,
  Search,
  CheckCircle,
  AlertTriangle,
  Clock,
  ShieldCheck,
  Building,
  UserCheck,
  Calendar,
  XCircle,
  ExternalLink
} from '../components/ui/Icons';

export default function EmployeeIdCardPage() {
  const { user } = useAuth();
  const { currentProperty } = useProperty();

  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Modal States
  const [generateModalOpen, setGenerateModalOpen] = useState(false);
  const [revokeModalOpen, setRevokeModalOpen] = useState(false);
  const [verifyModalOpen, setVerifyModalOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [selectedCard, setSelectedCard] = useState(null);

  // Form inputs
  const [expiryMonths, setExpiryMonths] = useState(12);
  const [revocationReason, setRevocationReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [verifyTokenInput, setVerifyTokenInput] = useState('');
  const [verifyResult, setVerifyResult] = useState(null);
  const [verifyError, setVerifyError] = useState(null);

  const canGenerate = user?.role === 'SUPER_ADMIN' || user?.role === 'PROPERTY_MANAGER' || user?.capabilities?.includes('EMPLOYEE_ID_CARD_GENERATE');
  const canRevoke = user?.role === 'SUPER_ADMIN' || user?.role === 'PROPERTY_MANAGER' || user?.capabilities?.includes('EMPLOYEE_ID_CARD_REVOKE');

  // Load employee directory and card statuses
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {};
      if (currentProperty?.id) {
        params.property_id = currentProperty.id;
      }
      const res = await employeeService.getEmployees(params);
      const list = res.data?.employees || res.data || [];

      // Fetch card status for each employee
      const enrichedList = await Promise.all(
        list.map(async (emp) => {
          try {
            const cardRes = await employeeService.getEmployeeIdCard(emp.id);
            return { ...emp, current_card: cardRes.data?.current_card || null };
          } catch {
            return { ...emp, current_card: null };
          }
        })
      );
      setEmployees(enrichedList);
    } catch (err) {
      console.error('Failed to load ID card directory:', err);
      setError('Failed to load employee ID cards.');
    } finally {
      setLoading(false);
    }
  }, [currentProperty]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle Generate Card
  const handleGenerate = async (e) => {
    e.preventDefault();
    if (!selectedEmployee) return;
    setActionLoading(true);
    try {
      const expiry = new Date();
      expiry.setMonth(expiry.getMonth() + parseInt(expiryMonths, 10));
      const expiresAt = expiry.toISOString().slice(0, 10);

      await employeeService.generateIdCard(selectedEmployee.id, { expires_at: expiresAt });
      setGenerateModalOpen(false);
      setSelectedEmployee(null);
      await fetchData();
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to generate ID card.');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Revoke Card
  const handleRevoke = async () => {
    if (!selectedEmployee || !selectedCard) return;
    if (!revocationReason.trim()) {
      alert('Revocation reason is required.');
      return;
    }
    setActionLoading(true);
    try {
      await employeeService.revokeIdCard(selectedEmployee.id, selectedCard.id, {
        revocation_reason: revocationReason
      });
      setRevokeModalOpen(false);
      setSelectedCard(null);
      setSelectedEmployee(null);
      setRevocationReason('');
      await fetchData();
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to revoke ID card.');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Reissue Card
  const handleReissue = async (emp) => {
    if (!window.confirm(`Reissue ID card for ${emp.first_name} ${emp.last_name}? The previous active card will be marked as REISSUED.`)) {
      return;
    }
    try {
      const expiry = new Date();
      expiry.setFullYear(expiry.getFullYear() + 1);
      await employeeService.reissueIdCard(emp.id, { expires_at: expiry.toISOString().slice(0, 10) });
      await fetchData();
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to reissue ID card.');
    }
  };

  // Handle PDF Download
  const handleDownloadPdf = async (emp) => {
    try {
      const res = await employeeService.downloadIdCardPdf(emp.id);
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `ID_CARD_${emp.staff_code || emp.id}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to download ID card PDF badge.');
    }
  };

  // Handle QR verification testing
  const handleTestVerify = async (e) => {
    e.preventDefault();
    if (!verifyTokenInput.trim()) return;
    setVerifyResult(null);
    setVerifyError(null);
    try {
      const res = await employeeService.verifyIdCardToken(verifyTokenInput.trim());
      setVerifyResult(res.data);
    } catch (err) {
      setVerifyError(err.response?.data?.error?.message || 'Token verification failed.');
    }
  };

  const filteredEmployees = employees.filter((emp) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      emp.first_name?.toLowerCase().includes(q) ||
      emp.last_name?.toLowerCase().includes(q) ||
      emp.staff_code?.toLowerCase().includes(q) ||
      emp.current_card?.card_number?.toLowerCase().includes(q);

    if (!matchesSearch) return false;

    if (statusFilter === 'ACTIVE') return emp.current_card?.status === 'ACTIVE';
    if (statusFilter === 'REVOKED') return emp.current_card?.status === 'REVOKED';
    if (statusFilter === 'NONE') return !emp.current_card;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <CreditCard className="w-7 h-7 text-indigo-600" />
            Employee ID Cards & Verification Hub
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Generate printable staff ID badges with secure, cryptographically verifiable QR codes
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setVerifyModalOpen(true);
              setVerifyTokenInput('');
              setVerifyResult(null);
              setVerifyError(null);
            }}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 shadow-sm"
          >
            <QrCode className="w-4 h-4 text-indigo-600" />
            Verify QR Token
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 flex flex-col md:flex-row gap-4 justify-between items-center">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
          <input
            type="text"
            placeholder="Search by staff name, code, or card #..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <span className="text-xs font-semibold text-gray-500 uppercase">Card Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          >
            <option value="ALL">All Staff</option>
            <option value="ACTIVE">Active Badge Only</option>
            <option value="REVOKED">Revoked Badge</option>
            <option value="NONE">No Card Issued</option>
          </select>
        </div>
      </div>

      {/* Staff ID Card Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-400">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-indigo-500" />
            <p className="text-sm">Loading ID card registry...</p>
          </div>
        ) : filteredEmployees.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <CreditCard className="w-12 h-12 mx-auto mb-2 opacity-40" />
            <p className="text-sm font-medium">No employee records match the filter criteria.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="py-3 px-4">Staff Member</th>
                  <th className="py-3 px-4">Department / Role</th>
                  <th className="py-3 px-4">Card Number</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Validity Period</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredEmployees.map((emp) => {
                  const card = emp.current_card;
                  const isCardActive = card?.status === 'ACTIVE';

                  return (
                    <tr key={emp.id} className="hover:bg-gray-50/75 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 text-white font-bold flex items-center justify-center text-xs shadow-sm">
                            {emp.first_name?.[0]}
                            {emp.last_name?.[0]}
                          </div>
                          <div>
                            <div className="font-semibold text-gray-900">
                              {emp.first_name} {emp.last_name}
                            </div>
                            <div className="font-mono text-xs text-indigo-600">{emp.staff_code}</div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4 text-xs text-gray-600">
                        <div className="font-medium text-gray-900">{emp.job_title || 'Staff'}</div>
                        <div className="text-gray-500">{emp.department || 'Operations'}</div>
                      </td>

                      <td className="py-3 px-4 font-mono text-xs">
                        {card ? (
                          <span className="font-semibold text-gray-800">{card.card_number}</span>
                        ) : (
                          <span className="text-gray-400 italic">None</span>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        {card ? (
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              card.status === 'ACTIVE'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : card.status === 'REVOKED'
                                ? 'bg-red-50 text-red-700 border border-red-200'
                                : 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {card.status === 'ACTIVE' && <CheckCircle className="w-3 h-3" />}
                            {card.status === 'REVOKED' && <XCircle className="w-3 h-3" />}
                            {card.status}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">UNISSUED</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-xs text-gray-500">
                        {card ? (
                          <div>
                            <div>Issued: {card.issued_at?.slice(0, 10)}</div>
                            <div className="text-gray-400">Expires: {card.expires_at?.slice(0, 10) || 'None'}</div>
                          </div>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {isCardActive ? (
                            <>
                              <button
                                onClick={() => handleDownloadPdf(emp)}
                                className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
                                title="Download PDF Badge"
                              >
                                <Download className="w-4 h-4" />
                              </button>

                              {canGenerate && (
                                <button
                                  onClick={() => handleReissue(emp)}
                                  className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                                  title="Reissue Badge"
                                >
                                  <RefreshCw className="w-4 h-4" />
                                </button>
                              )}

                              {canRevoke && (
                                <button
                                  onClick={() => {
                                    setSelectedEmployee(emp);
                                    setSelectedCard(card);
                                    setRevokeModalOpen(true);
                                  }}
                                  className="p-1.5 text-red-600 hover:bg-red-50 rounded-md transition-colors"
                                  title="Revoke Badge"
                                >
                                  <Slash className="w-4 h-4" />
                                </button>
                              )}
                            </>
                          ) : (
                            canGenerate && (
                              <button
                                onClick={() => {
                                  setSelectedEmployee(emp);
                                  setGenerateModalOpen(true);
                                }}
                                className="inline-flex items-center gap-1 px-3 py-1 bg-indigo-600 text-white rounded-md text-xs font-semibold hover:bg-indigo-700 shadow-sm"
                              >
                                <CreditCard className="w-3.5 h-3.5" />
                                Issue Card
                              </button>
                            )
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Generate Card Modal */}
      {generateModalOpen && (
        <Modal
          isOpen={generateModalOpen}
          onClose={() => setGenerateModalOpen(false)}
          title={`Generate Staff ID Card: ${selectedEmployee?.first_name} ${selectedEmployee?.last_name}`}
        >
          <form onSubmit={handleGenerate} className="space-y-4">
            <p className="text-sm text-gray-600">
              Generating an official BFA Staff ID Card creates a unique card number, digital signature, and secure
              QR verification token.
            </p>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Badge Validity Period</label>
              <select
                value={expiryMonths}
                onChange={(e) => setExpiryMonths(e.target.value)}
                className="w-full text-sm border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500"
              >
                <option value={6}>6 Months</option>
                <option value={12}>1 Year (Standard)</option>
                <option value={24}>2 Years</option>
                <option value={36}>3 Years</option>
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t">
              <button
                type="button"
                onClick={() => setGenerateModalOpen(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={actionLoading}
                className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {actionLoading ? 'Generating...' : 'Confirm & Generate'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Revoke Card Modal */}
      {revokeModalOpen && (
        <Modal
          isOpen={revokeModalOpen}
          onClose={() => setRevokeModalOpen(false)}
          title={`Revoke ID Card: ${selectedCard?.card_number}`}
        >
          <div className="space-y-4">
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              <span>
                Revoking this card invalidates the QR verification token immediately. Security personnel scanning this
                card will be alerted that the badge is REVOKED.
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Reason for Revocation <span className="text-red-500">*</span>
              </label>
              <textarea
                rows={3}
                required
                value={revocationReason}
                onChange={(e) => setRevocationReason(e.target.value)}
                placeholder="e.g. Employee resignation, lost badge, damaged card..."
                className="w-full text-sm border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-red-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t">
              <button
                type="button"
                onClick={() => setRevokeModalOpen(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionLoading}
                onClick={handleRevoke}
                className="px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {actionLoading ? 'Revoking...' : 'Confirm Revocation'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* QR Token Verification Test Modal */}
      {verifyModalOpen && (
        <Modal
          isOpen={verifyModalOpen}
          onClose={() => setVerifyModalOpen(false)}
          title="Security QR Token Verification Test"
        >
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Paste a verification token (or scan a badge QR code) to inspect the public verification response. Notice
              how sensitive PII (home address, personal phone, emergency contacts) is omitted to protect employee privacy.
            </p>

            <form onSubmit={handleTestVerify} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Verification Token</label>
                <input
                  type="text"
                  required
                  placeholder="Paste 48-character token..."
                  value={verifyTokenInput}
                  onChange={(e) => setVerifyTokenInput(e.target.value)}
                  className="w-full text-sm font-mono border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700"
                >
                  Verify Token
                </button>
              </div>
            </form>

            {verifyError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg flex items-center gap-2">
                <XCircle className="w-5 h-5 flex-shrink-0" />
                <span>{verifyError}</span>
              </div>
            )}

            {verifyResult && (
              <div
                className={`p-4 rounded-xl border space-y-2 ${
                  verifyResult.badge_valid
                    ? 'bg-emerald-50/70 border-emerald-300'
                    : 'bg-red-50/70 border-red-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  {verifyResult.badge_valid ? (
                    <ShieldCheck className="w-5 h-5 text-emerald-600" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-red-600" />
                  )}
                  <span
                    className={`font-bold text-sm ${
                      verifyResult.badge_valid ? 'text-emerald-800' : 'text-red-800'
                    }`}
                  >
                    {verifyResult.message}
                  </span>
                </div>

                {verifyResult.badge && (
                  <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-gray-200">
                    <div>
                      <span className="text-gray-500 block">Staff Name</span>
                      <span className="font-semibold text-gray-900">{verifyResult.badge.employee_name}</span>
                    </div>
                    <div>
                      <span className="text-gray-500 block">Staff Code</span>
                      <span className="font-semibold text-gray-900 font-mono">
                        {verifyResult.badge.staff_code}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500 block">Job Title</span>
                      <span className="font-medium text-gray-800">{verifyResult.badge.job_title}</span>
                    </div>
                    <div>
                      <span className="text-gray-500 block">Department</span>
                      <span className="font-medium text-gray-800">{verifyResult.badge.department}</span>
                    </div>
                    <div>
                      <span className="text-gray-500 block">Property</span>
                      <span className="font-medium text-gray-800">{verifyResult.badge.property_name}</span>
                    </div>
                    <div>
                      <span className="text-gray-500 block">Badge Status</span>
                      <span
                        className={`font-bold ${
                          verifyResult.badge.card_status === 'ACTIVE'
                            ? 'text-emerald-600'
                            : 'text-red-600'
                        }`}
                      >
                        {verifyResult.badge.card_status}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
