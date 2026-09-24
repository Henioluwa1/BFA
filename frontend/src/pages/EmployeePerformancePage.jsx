import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useProperty } from '../context/PropertyContext';
import { employeeService } from '../services/api';
import {
  Award,
  TrendingUp,
  Activity,
  CheckCircle,
  Calendar,
  User,
  Filter,
  BarChart2,
  AlertCircle,
  Search,
  ArrowUpRight,
  ShieldAlert
} from '../components/ui/Icons';

export default function EmployeePerformancePage() {
  const { user } = useAuth();
  const { currentProperty } = useProperty();

  const [employees, setEmployees] = useState([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [performanceData, setPerformanceData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Filters for employee selection
  const [searchQuery, setSearchQuery] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');

  // Fetch employee list for selector
  const fetchEmployees = useCallback(async () => {
    try {
      const params = {};
      if (currentProperty?.id) {
        params.property_id = currentProperty.id;
      }
      const res = await employeeService.getEmployees(params);
      const list = res.data?.employees || res.data || [];
      setEmployees(list);
      if (list.length > 0 && !selectedEmployeeId) {
        setSelectedEmployeeId(list[0].id);
      }
    } catch (err) {
      console.error('Failed to load employee directory for performance:', err);
    }
  }, [currentProperty, selectedEmployeeId]);

  // Fetch performance for selected employee
  const fetchPerformance = useCallback(async (empId) => {
    if (!empId) return;
    setLoading(true);
    setError(null);
    try {
      const params = {};
      if (periodStart) params.period_start = periodStart;
      if (periodEnd) params.period_end = periodEnd;
      const res = await employeeService.getEmployeePerformance(empId, params);
      setPerformanceData(res.data);
    } catch (err) {
      console.error('Failed to fetch employee performance data:', err);
      setError(err.response?.data?.error?.message || 'Failed to retrieve performance metrics.');
      setPerformanceData(null);
    } finally {
      setLoading(false);
    }
  }, [periodStart, periodEnd]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  useEffect(() => {
    if (selectedEmployeeId) {
      fetchPerformance(selectedEmployeeId);
    }
  }, [selectedEmployeeId, fetchPerformance]);

  const filteredEmployees = employees.filter((emp) => {
    const q = searchQuery.toLowerCase();
    return (
      emp.first_name?.toLowerCase().includes(q) ||
      emp.last_name?.toLowerCase().includes(q) ||
      emp.staff_code?.toLowerCase().includes(q) ||
      emp.job_title?.toLowerCase().includes(q) ||
      emp.department?.toLowerCase().includes(q)
    );
  });

  const selectedEmp = employees.find((e) => e.id === selectedEmployeeId);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <TrendingUp className="w-7 h-7 text-indigo-600" />
            Employee Performance & Operations Analytics
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Objective system operational activity juxtaposed against formal manager evaluation scores
          </p>
        </div>
      </div>

      {/* Main Grid: Left selector, Right performance dashboards */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left Column: Staff Selector & Filters */}
        <div className="lg:col-span-1 bg-white rounded-xl shadow-sm border border-gray-200 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
              <User className="w-4 h-4 text-gray-500" />
              Staff Directory
            </h2>
            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">
              {filteredEmployees.length}
            </span>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
            <input
              type="text"
              placeholder="Search staff..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-600 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" /> Date Range Filter
            </label>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                className="w-full text-xs p-1.5 border border-gray-300 rounded-md"
              />
              <input
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                className="w-full text-xs p-1.5 border border-gray-300 rounded-md"
              />
            </div>
            {(periodStart || periodEnd) && (
              <button
                onClick={() => {
                  setPeriodStart('');
                  setPeriodEnd('');
                }}
                className="text-xs text-indigo-600 hover:text-indigo-800"
              >
                Clear date filters
              </button>
            )}
          </div>

          {/* List of staff cards */}
          <div className="space-y-1.5 max-h-[520px] overflow-y-auto pr-1">
            {filteredEmployees.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-6">No staff members found.</p>
            ) : (
              filteredEmployees.map((emp) => {
                const isSelected = emp.id === selectedEmployeeId;
                return (
                  <button
                    key={emp.id}
                    onClick={() => setSelectedEmployeeId(emp.id)}
                    className={`w-full text-left p-2.5 rounded-lg border transition-all text-xs ${
                      isSelected
                        ? 'bg-indigo-50/80 border-indigo-300 shadow-sm'
                        : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <div className="font-semibold text-gray-900 truncate">
                      {emp.first_name} {emp.last_name}
                    </div>
                    <div className="text-gray-500 flex items-center justify-between mt-0.5">
                      <span className="font-mono text-[11px] text-indigo-600">{emp.staff_code}</span>
                      <span className="truncate max-w-[120px]">{emp.department || 'Operations'}</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Performance Analytics Dashboard */}
        <div className="lg:col-span-3 space-y-6">
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl flex items-center gap-2">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center text-gray-500">
              <Activity className="w-8 h-8 text-indigo-500 animate-spin mx-auto mb-2" />
              <p className="text-sm font-medium">Computing operational metrics and evaluation trends...</p>
            </div>
          ) : !performanceData ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center text-gray-400">
              <User className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Select an employee from the directory to inspect performance analytics.</p>
            </div>
          ) : (
            <>
              {/* Selected Employee Summary Card */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 text-white font-bold flex items-center justify-center text-lg shadow-sm">
                    {selectedEmp?.first_name?.[0] || 'E'}
                    {selectedEmp?.last_name?.[0] || 'M'}
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">
                      {selectedEmp?.first_name} {selectedEmp?.last_name}
                    </h2>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 mt-0.5">
                      <span className="font-mono text-indigo-600 font-semibold">{selectedEmp?.staff_code}</span>
                      <span>•</span>
                      <span>{selectedEmp?.job_title || 'Staff Member'}</span>
                      <span>•</span>
                      <span className="capitalize">{selectedEmp?.department || 'Operations'}</span>
                      <span>•</span>
                      <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
                        {selectedEmp?.employment_status || 'ACTIVE'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-xs text-gray-400 block">Performance Window</span>
                  <span className="text-xs font-medium text-gray-700">
                    {performanceData.period?.start} to {performanceData.period?.end}
                  </span>
                </div>
              </div>

              {/* Top KPI Cards (Rule 2: System Observed Metrics) */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-indigo-500" />
                    Observed System Operational Metrics
                  </h3>
                  <span className="text-[11px] text-gray-400 italic">Audit-backed system logs</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                    <span className="text-xs text-gray-500 block">Total Activities</span>
                    <div className="text-2xl font-bold text-gray-900 mt-1">
                      {performanceData.system_metrics?.total_activities || 0}
                    </div>
                    <span className="text-[11px] text-gray-400">Executed actions</span>
                  </div>

                  <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                    <span className="text-xs text-gray-500 block">Active Work Days</span>
                    <div className="text-2xl font-bold text-indigo-600 mt-1">
                      {performanceData.system_metrics?.active_days || 0}
                    </div>
                    <span className="text-[11px] text-gray-400">Days with activity</span>
                  </div>

                  <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                    <span className="text-xs text-gray-500 block">Attendance Rate</span>
                    <div className="text-2xl font-bold text-emerald-600 mt-1">
                      {performanceData.system_metrics?.estimated_attendance_rate}%
                    </div>
                    <span className="text-[11px] text-gray-400">Activity ratio</span>
                  </div>

                  <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                    <span className="text-xs text-gray-500 block">Ops Tasks Finished</span>
                    <div className="text-2xl font-bold text-purple-600 mt-1">
                      {(performanceData.system_metrics?.maintenance_resolved || 0) +
                        (performanceData.system_metrics?.inspections_completed || 0)}
                    </div>
                    <span className="text-[11px] text-gray-400">Maintenance & inspection</span>
                  </div>
                </div>
              </div>

              {/* Manager Evaluation vs System Operations Split */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Manager Evaluation Summary */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-4">
                  <div className="flex items-center justify-between border-b pb-3">
                    <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                      <Award className="w-4 h-4 text-amber-500" />
                      Formal Manager Evaluation
                    </h3>
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-50 text-amber-700">
                      Evaluated by Supervisor
                    </span>
                  </div>

                  {performanceData.manager_evaluation?.has_evaluation ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between bg-amber-50/50 p-3 rounded-lg border border-amber-200">
                        <div>
                          <span className="text-xs text-amber-800 font-medium block">Overall Rating</span>
                          <span className="text-2xl font-black text-amber-700">
                            {performanceData.manager_evaluation.average_score}%
                          </span>
                        </div>
                        <div className="text-right text-xs text-gray-500">
                          <div>Evaluated: {performanceData.manager_evaluation.finalized_at?.slice(0, 10) || 'Recent'}</div>
                          <div>By: {performanceData.manager_evaluation.evaluator_name || 'Management'}</div>
                        </div>
                      </div>

                      {/* Dimension breakdown */}
                      <div className="space-y-2 pt-1">
                        <span className="text-xs font-semibold text-gray-600 block">Evaluated Dimensions</span>
                        {performanceData.manager_evaluation.dimension_scores?.length > 0 ? (
                          performanceData.manager_evaluation.dimension_scores.map((dim, idx) => (
                            <div key={idx} className="space-y-1">
                              <div className="flex justify-between text-xs">
                                <span className="text-gray-700 font-medium">{dim.criteria_name}</span>
                                <span className="font-semibold text-gray-900">{dim.score_percentage}%</span>
                              </div>
                              <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${
                                    dim.score_percentage >= 80
                                      ? 'bg-emerald-500'
                                      : dim.score_percentage >= 60
                                      ? 'bg-indigo-500'
                                      : 'bg-amber-500'
                                  }`}
                                  style={{ width: `${dim.score_percentage}%` }}
                                />
                              </div>
                            </div>
                          ))
                        ) : (
                          <p className="text-xs text-gray-400 italic">No dimension scores recorded.</p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-400 space-y-2">
                      <AlertCircle className="w-8 h-8 mx-auto opacity-40" />
                      <p className="text-xs">No finalized manager evaluation for this employee in this period.</p>
                    </div>
                  )}
                </div>

                {/* Operations & Module Distribution */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-4">
                  <div className="flex items-center justify-between border-b pb-3">
                    <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                      <BarChart2 className="w-4 h-4 text-indigo-500" />
                      Operational Breakdown
                    </h3>
                    <span className="text-xs text-gray-400">System Records</span>
                  </div>

                  <div className="space-y-3">
                    <div className="flex justify-between items-center text-xs p-2 rounded-lg bg-gray-50 border border-gray-100">
                      <span className="font-medium text-gray-700">Reservations Handled</span>
                      <span className="font-bold text-indigo-600">
                        {performanceData.system_metrics?.reservations_handled || 0}
                      </span>
                    </div>

                    <div className="flex justify-between items-center text-xs p-2 rounded-lg bg-gray-50 border border-gray-100">
                      <span className="font-medium text-gray-700">Maintenance Work Orders Resolved</span>
                      <span className="font-bold text-emerald-600">
                        {performanceData.system_metrics?.maintenance_resolved || 0}
                      </span>
                    </div>

                    <div className="flex justify-between items-center text-xs p-2 rounded-lg bg-gray-50 border border-gray-100">
                      <span className="font-medium text-gray-700">Inspections Completed</span>
                      <span className="font-bold text-purple-600">
                        {performanceData.system_metrics?.inspections_completed || 0}
                      </span>
                    </div>

                    {/* Breakdown by Category */}
                    <div className="pt-2">
                      <span className="text-xs font-semibold text-gray-600 block mb-2">Activities by Category</span>
                      <div className="space-y-1.5">
                        {performanceData.activity_breakdown &&
                        Object.keys(performanceData.activity_breakdown).length > 0 ? (
                          Object.entries(performanceData.activity_breakdown).map(([category, count]) => (
                            <div key={category} className="flex justify-between items-center text-xs">
                              <span className="text-gray-600 capitalize">{category.toLowerCase().replace('_', ' ')}</span>
                              <span className="font-semibold text-gray-800 bg-gray-100 px-2 py-0.5 rounded-full">
                                {count}
                              </span>
                            </div>
                          ))
                        ) : (
                          <p className="text-xs text-gray-400 italic">No activity categories recorded.</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
