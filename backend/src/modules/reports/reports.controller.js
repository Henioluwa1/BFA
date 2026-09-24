const ReportsService = require('./reports.service');
const ApiResponse = require('../../utils/apiResponse');

class ReportsController {
  static async getReservations(req, res, next) {
    try {
      const { propertyId, fromDate, toDate, format } = req.query;
      const userRole = req.user?.role || 'ADMIN';
      const agentId = req.user?.agentId;

      const data = await ReportsService.getReservationsReport({
        propertyId,
        fromDate,
        toDate,
        userRole,
        agentId,
      });

      if (format === 'csv') {
        const headers = [
          { label: 'Reservation Code', key: 'reservation_code' },
          { label: 'Property', key: 'property_name' },
          { label: 'Unit Number', key: 'unit_number' },
          { label: 'Tenant Name', key: 'tenant_name' },
          { label: 'Tenant Email', key: 'tenant_email' },
          { label: 'Tenant Phone', key: 'tenant_phone' },
          { label: 'Agent', key: 'agent_name' },
          { label: 'Check-In', key: 'check_in_date' },
          { label: 'Check-Out', key: 'check_out_date' },
          { label: 'Nights', key: 'nights' },
          { label: 'Total Amount (NGN)', key: 'total_amount' },
          { label: 'Paid Amount (NGN)', key: 'paid_amount' },
          { label: 'Status', key: 'status' },
          { label: 'Payment Status', key: 'payment_status' },
        ];

        const csvContent = ReportsService.toCSV(headers, data);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="bfa-reservations-report-${Date.now()}.csv"`);
        return res.status(200).send(csvContent);
      }

      return ApiResponse.success(res, {
        message: 'Reservations report generated successfully',
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getFinancial(req, res, next) {
    try {
      const { propertyId, fromDate, toDate, format } = req.query;
      const data = await ReportsService.getFinancialReport({ propertyId, fromDate, toDate });

      if (format === 'csv') {
        const headers = [
          { label: 'Code', key: 'reservation_code' },
          { label: 'Property', key: 'property_name' },
          { label: 'Tenant', key: 'tenant_name' },
          { label: 'Check-In', key: 'check_in_date' },
          { label: 'Revenue (NGN)', key: 'total_amount' },
          { label: 'Collected (NGN)', key: 'paid_amount' },
          { label: 'Status', key: 'status' },
        ];

        const csvContent = ReportsService.toCSV(headers, data.reservations);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="bfa-financial-report-${Date.now()}.csv"`);
        return res.status(200).send(csvContent);
      }

      if (format === 'pdf') {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="bfa-financial-summary-${Date.now()}.pdf"`);
        const pdfStream = ReportsService.generateFinancialPDF(data, propertyId ? `Property #${propertyId}` : 'All Properties');
        return pdfStream.pipe(res);
      }

      return ApiResponse.success(res, {
        message: 'Financial report generated successfully',
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getPayments(req, res, next) {
    try {
      const { propertyId, fromDate, toDate, status, format } = req.query;
      const data = await ReportsService.getPaymentsReport({ propertyId, fromDate, toDate, status });

      if (format === 'csv') {
        const headers = [
          { label: 'Transaction Reference', key: 'transaction_reference' },
          { label: 'Reservation Code', key: 'reservation_code' },
          { label: 'Tenant Name', key: 'tenant_name' },
          { label: 'Property', key: 'property_name' },
          { label: 'Amount (NGN)', key: 'amount' },
          { label: 'Payment Method', key: 'payment_method' },
          { label: 'Status', key: 'status' },
          { label: 'Paid At', key: 'paid_at' },
          { label: 'Refund Amount (NGN)', key: 'refund_amount' },
          { label: 'Refund Reason', key: 'refund_reason' },
        ];

        const csvContent = ReportsService.toCSV(headers, data);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="bfa-payments-report-${Date.now()}.csv"`);
        return res.status(200).send(csvContent);
      }

      return ApiResponse.success(res, {
        message: 'Payments report generated successfully',
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getExpenses(req, res, next) {
    try {
      const { propertyId, category, status, fromDate, toDate, format } = req.query;
      const data = await ReportsService.getExpensesReport({ propertyId, category, status, fromDate, toDate });

      if (format === 'csv') {
        const headers = [
          { label: 'Expense Code', key: 'expense_code' },
          { label: 'Property', key: 'property_name' },
          { label: 'Category', key: 'category' },
          { label: 'Description', key: 'description' },
          { label: 'Vendor / Payee', key: 'vendor_payee' },
          { label: 'Amount (NGN)', key: 'amount' },
          { label: 'Payment Method', key: 'payment_method' },
          { label: 'Status', key: 'status' },
          { label: 'Expense Date', key: 'expense_date' },
          { label: 'Recorded By', key: 'recorded_by_name' },
          { label: 'Approved By', key: 'approved_by_name' },
        ];

        const csvContent = ReportsService.toCSV(headers, data);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="bfa-expenses-report-${Date.now()}.csv"`);
        return res.status(200).send(csvContent);
      }

      return ApiResponse.success(res, {
        message: 'Expenses report generated successfully',
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getAgents(req, res, next) {
    try {
      const { propertyId, status, format } = req.query;
      const data = await ReportsService.getAgentsReport({ propertyId, status });

      if (format === 'csv') {
        const headers = [
          { label: 'Agent Name', key: 'name' },
          { label: 'Agency', key: 'agency_name' },
          { label: 'Email', key: 'email' },
          { label: 'Phone', key: 'phone' },
          { label: 'Commission Rate', key: 'commission_rate' },
          { label: 'Commission Type', key: 'commission_type' },
          { label: 'Status', key: 'status' },
          { label: 'Bank Name', key: 'bank_name' },
          { label: 'Account Number', key: 'account_number' },
          { label: 'Total Bookings', key: 'total_bookings' },
          { label: 'Total Volume (NGN)', key: 'total_volume' },
          { label: 'Paid Commission (NGN)', key: 'total_commission' },
        ];

        const csvContent = ReportsService.toCSV(headers, data);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="bfa-agents-report-${Date.now()}.csv"`);
        return res.status(200).send(csvContent);
      }

      return ApiResponse.success(res, {
        message: 'Agents report generated successfully',
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getCommissions(req, res, next) {
    try {
      const { agentId, propertyId, status, fromDate, toDate, format } = req.query;
      const data = await ReportsService.getCommissionsReport({ agentId, propertyId, status, fromDate, toDate });

      if (format === 'csv') {
        const headers = [
          { label: 'Commission Code', key: 'commission_code' },
          { label: 'Agent', key: 'agent_name' },
          { label: 'Agency', key: 'agency_name' },
          { label: 'Reservation Code', key: 'reservation_code' },
          { label: 'Property', key: 'property_name' },
          { label: 'Booking Amount (NGN)', key: 'booking_amount' },
          { label: 'Commission Rate', key: 'commission_rate' },
          { label: 'Commission Type', key: 'commission_type' },
          { label: 'Commission Amount (NGN)', key: 'commission_amount' },
          { label: 'Status', key: 'status' },
          { label: 'Payment Reference', key: 'payment_reference' },
          { label: 'Payment Method', key: 'payment_method' },
          { label: 'Paid At', key: 'paid_at' },
        ];

        const csvContent = ReportsService.toCSV(headers, data);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="bfa-commissions-report-${Date.now()}.csv"`);
        return res.status(200).send(csvContent);
      }

      if (format === 'pdf') {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="bfa-commissions-report-${Date.now()}.pdf"`);
        const pdfStream = ReportsService.generateCommissionsPDF(data, agentId ? `Agent #${agentId}` : 'All Agents');
        return pdfStream.pipe(res);
      }

      return ApiResponse.success(res, {
        message: 'Commissions report generated successfully',
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getMaintenance(req, res, next) {
    try {
      const { propertyId, status, priority, category, fromDate, toDate, format } = req.query;
      const data = await ReportsService.getMaintenanceReport({ propertyId, status, priority, category, fromDate, toDate });

      if (format === 'csv') {
        const headers = [
          { label: 'Issue Code', key: 'issue_code' },
          { label: 'Title', key: 'issue_title' },
          { label: 'Property', key: 'property_name' },
          { label: 'Unit', key: 'unit_number' },
          { label: 'Category', key: 'category' },
          { label: 'Priority', key: 'priority' },
          { label: 'Status', key: 'status' },
          { label: 'Estimated Cost (NGN)', key: 'estimated_cost' },
          { label: 'Actual Cost (NGN)', key: 'actual_cost' },
          { label: 'Assigned To', key: 'assigned_to' },
          { label: 'Created At', key: 'created_at' },
          { label: 'Resolved At', key: 'resolved_at' },
        ];

        const csvContent = ReportsService.toCSV(headers, data);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="bfa-maintenance-report-${Date.now()}.csv"`);
        return res.status(200).send(csvContent);
      }

      return ApiResponse.success(res, {
        message: 'Maintenance report generated successfully',
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getInspections(req, res, next) {
    try {
      const { propertyId, status, type, fromDate, toDate, format } = req.query;
      const data = await ReportsService.getInspectionsReport({ propertyId, status, type, fromDate, toDate });

      if (format === 'csv') {
        const headers = [
          { label: 'Inspection Code', key: 'inspection_code' },
          { label: 'Property', key: 'property_name' },
          { label: 'Unit', key: 'unit_number' },
          { label: 'Type', key: 'inspection_type' },
          { label: 'Condition Rating', key: 'condition_rating' },
          { label: 'Status', key: 'status' },
          { label: 'Inspector', key: 'inspector_name' },
          { label: 'Created At', key: 'created_at' },
        ];

        const csvContent = ReportsService.toCSV(headers, data);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="bfa-inspections-report-${Date.now()}.csv"`);
        return res.status(200).send(csvContent);
      }

      return ApiResponse.success(res, {
        message: 'Inspections report generated successfully',
        data,
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = ReportsController;
