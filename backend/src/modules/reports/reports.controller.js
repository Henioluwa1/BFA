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
          { label: 'Check-In', key: 'check_in_date' },
          { label: 'Check-Out', key: 'check_out_date' },
          { label: 'Nights', key: 'nights' },
          { label: 'Total Amount ($)', key: 'total_amount' },
          { label: 'Paid Amount ($)', key: 'paid_amount' },
          { label: 'Status', key: 'status' },
        ];

        const csvContent = ReportsService.toCSV(headers, data);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="bfa-reservations-report-${Date.now()}.csv"`
        );
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
          { label: 'Revenue ($)', key: 'total_amount' },
          { label: 'Collected ($)', key: 'paid_amount' },
          { label: 'Status', key: 'status' },
        ];

        const csvContent = ReportsService.toCSV(headers, data.reservations);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="bfa-financial-report-${Date.now()}.csv"`
        );
        return res.status(200).send(csvContent);
      }

      if (format === 'pdf') {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="bfa-financial-summary-${Date.now()}.pdf"`
        );
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
}

module.exports = ReportsController;
