const pool = require('../../db/pool');

class AnalyticsRepository {
  /**
   * Helper to format date bounds
   */
  static getDateBounds(fromDate, toDate) {
    const end = toDate ? new Date(toDate) : new Date();
    let start = fromDate ? new Date(fromDate) : new Date();
    if (!fromDate) {
      start.setDate(start.getDate() - 30); // Default to last 30 days
    }
    const fromStr = start.toISOString().slice(0, 10);
    const toStr = end.toISOString().slice(0, 10);
    const diffDays = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
    return { fromStr, toStr, diffDays };
  }

  /**
   * High-level Executive Overview (Revenue, ADR, Occupancy, RevPAR, NOI)
   */
  static async getOverview({ propertyId, fromDate, toDate, user } = {}) {
    const { fromStr, toStr, diffDays } = this.getDateBounds(fromDate, toDate);

    // 1. Total units in scope
    let unitSql = 'SELECT COUNT(id) as count FROM apartments WHERE 1=1';
    const unitParams = [];
    if (user && user.propertyId && !['SUPER_ADMIN', 'OWNER', 'ADMIN'].includes(user.role)) {
      unitSql += ' AND property_id = ?';
      unitParams.push(user.propertyId);
    } else if (propertyId && propertyId !== 'all') {
      unitSql += ' AND property_id = ?';
      unitParams.push(propertyId);
    }
    const unitRows = await pool.query(unitSql, unitParams);
    const totalUnits = parseInt(unitRows[0]?.count || 0, 10);
    const totalAvailableUnitNights = Math.max(1, totalUnits * diffDays);

    // 2. Reservations & revenue in period
    let resSql = `
      SELECT 
        COUNT(r.id) AS total_bookings,
        SUM(CASE WHEN r.status IN ('CONFIRMED', 'CHECKED_IN') THEN 1 ELSE 0 END) AS active_stays,
        SUM(CASE WHEN r.status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed_stays,
        SUM(CASE WHEN r.status = 'CANCELLED' THEN 1 ELSE 0 END) AS cancelled_stays,
        COALESCE(SUM(CASE WHEN r.status != 'CANCELLED' THEN r.nights ELSE 0 END), 0) AS occupied_unit_nights,
        COALESCE(SUM(CASE WHEN r.status != 'CANCELLED' THEN r.total_amount ELSE 0 END), 0.00) AS total_booking_value,
        COALESCE(SUM(r.paid_amount), 0.00) AS total_collected_revenue
      FROM reservations r
      WHERE DATE(r.check_in_date) >= ? AND DATE(r.check_in_date) <= ?
    `;
    const resParams = [fromStr, toStr];

    if (user && user.role === 'AGENT') {
      resSql += ' AND r.agent_id = ?';
      resParams.push(user.agentId);
    } else if (user && user.propertyId && !['SUPER_ADMIN', 'OWNER', 'ADMIN'].includes(user.role)) {
      resSql += ' AND r.property_id = ?';
      resParams.push(user.propertyId);
    } else if (propertyId && propertyId !== 'all') {
      resSql += ' AND r.property_id = ?';
      resParams.push(propertyId);
    }

    const resResult = await pool.query(resSql, resParams);
    const stats = resResult[0] || {};

    const occupiedNights = parseInt(stats.occupied_unit_nights || 0, 10);
    const totalRevenue = parseFloat(stats.total_booking_value || 0);

    // 2b. Authoritative collected revenue & refunds from payment_transactions
    let paySql = `
      SELECT 
        COALESCE(SUM(CASE WHEN pt.parent_transaction_id IS NULL AND pt.status IN ('SUCCESS', 'COMPLETED', 'PARTIALLY_REFUNDED', 'REFUNDED') THEN pt.amount ELSE 0 END), 0) as gross_collected,
        COALESCE(SUM(CASE WHEN pt.parent_transaction_id IS NULL THEN COALESCE(pt.refund_amount, 0) ELSE 0 END), 0) as total_refunded
      FROM payment_transactions pt
      JOIN reservations r ON r.id = pt.reservation_id
      WHERE DATE(COALESCE(pt.paid_at, pt.created_at)) >= ? AND DATE(COALESCE(pt.paid_at, pt.created_at)) <= ?
    `;
    const payParams = [fromStr, toStr];
    if (user && user.role === 'AGENT') {
      paySql += ' AND r.agent_id = ?';
      payParams.push(user.agentId);
    } else if (user && user.propertyId && !['SUPER_ADMIN', 'OWNER', 'ADMIN'].includes(user.role)) {
      paySql += ' AND r.property_id = ?';
      payParams.push(user.propertyId);
    } else if (propertyId && propertyId !== 'all') {
      paySql += ' AND r.property_id = ?';
      payParams.push(propertyId);
    }

    const [payResult] = await pool.query(paySql, payParams);
    const grossCollected = parseFloat(payResult?.gross_collected || 0);
    const totalRefunded = parseFloat(payResult?.total_refunded || 0);
    const collectedRevenue = Math.max(0, grossCollected - totalRefunded);
    const outstandingReceivables = Math.max(0, totalRevenue - collectedRevenue);

    // ADR = Room Revenue / Occupied Nights
    const adr = occupiedNights > 0 ? Number((totalRevenue / occupiedNights).toFixed(2)) : 0.00;

    // Occupancy Rate = (Occupied Nights / Total Available Nights) * 100
    const occupancyRate = totalAvailableUnitNights > 0
      ? Number(Math.min(100, (occupiedNights / totalAvailableUnitNights) * 100).toFixed(2))
      : 0.00;

    // RevPAR = Total Revenue / Total Available Nights (or ADR * (Occupancy Rate / 100))
    const revPar = totalAvailableUnitNights > 0
      ? Number((totalRevenue / totalAvailableUnitNights).toFixed(2))
      : 0.00;

    // 3. Operational Expenses in period
    let expSql = `
      SELECT COALESCE(SUM(amount), 0.00) AS total_expenses
      FROM expenses
      WHERE status = 'APPROVED'
        AND DATE(expense_date) >= ? AND DATE(expense_date) <= ?
    `;
    const expParams = [fromStr, toStr];
    if (user && user.propertyId && !['SUPER_ADMIN', 'OWNER', 'ADMIN'].includes(user.role)) {
      expSql += ' AND property_id = ?';
      expParams.push(user.propertyId);
    } else if (propertyId && propertyId !== 'all') {
      expSql += ' AND property_id = ?';
      expParams.push(propertyId);
    }

    const expResult = await pool.query(expSql, expParams);
    const totalExpenses = parseFloat(expResult[0]?.total_expenses || 0);
    const netOperatingIncome = Number((collectedRevenue - totalExpenses).toFixed(2));
    const profitMargin = collectedRevenue > 0 ? Number(((netOperatingIncome / collectedRevenue) * 100).toFixed(2)) : 0.00;

    // 4. Daily time series trend (revenue and bookings)
    let trendSql = `
      SELECT 
        DATE(r.check_in_date) AS date,
        COUNT(r.id) AS bookings,
        COALESCE(SUM(CASE WHEN r.status != 'CANCELLED' THEN r.total_amount ELSE 0 END), 0.00) AS revenue
      FROM reservations r
      WHERE DATE(r.check_in_date) >= ? AND DATE(r.check_in_date) <= ?
    `;
    const trendParams = [fromStr, toStr];
    if (user && user.role === 'AGENT') {
      trendSql += ' AND r.agent_id = ?';
      trendParams.push(user.agentId);
    } else if (user && user.propertyId && !['SUPER_ADMIN', 'OWNER', 'ADMIN'].includes(user.role)) {
      trendSql += ' AND r.property_id = ?';
      trendParams.push(user.propertyId);
    } else if (propertyId && propertyId !== 'all') {
      trendSql += ' AND r.property_id = ?';
      trendParams.push(propertyId);
    }
    trendSql += ' GROUP BY DATE(r.check_in_date) ORDER BY date ASC';

    const dailyTrends = await pool.query(trendSql, trendParams);

    return {
      period: { fromDate: fromStr, toDate: toStr, diffDays },
      summary: {
        totalUnits,
        totalAvailableUnitNights,
        occupiedUnitNights: occupiedNights,
        occupancyRate,
        adr,
        revPar,
        totalRevenue,
        grossCollected,
        totalRefunded,
        collectedRevenue,
        outstandingReceivables,
        totalExpenses,
        netOperatingIncome,
        profitMargin,
        totalBookings: parseInt(stats.total_bookings || 0, 10),
        activeStays: parseInt(stats.active_stays || 0, 10),
        completedStays: parseInt(stats.completed_stays || 0, 10),
        cancelledStays: parseInt(stats.cancelled_stays || 0, 10),
      },
      dailyTrends,
    };
  }

  /**
   * Reservations Analytics (Channel distribution, statuses, ALOS)
   */
  static async getReservations({ propertyId, fromDate, toDate, user } = {}) {
    const { fromStr, toStr } = this.getDateBounds(fromDate, toDate);

    let whereClause = ' WHERE DATE(r.check_in_date) >= ? AND DATE(r.check_in_date) <= ?';
    const params = [fromStr, toStr];

    if (user && user.role === 'AGENT') {
      whereClause += ' AND r.agent_id = ?';
      params.push(user.agentId);
    } else if (user && user.propertyId && !['SUPER_ADMIN', 'OWNER', 'ADMIN'].includes(user.role)) {
      whereClause += ' AND r.property_id = ?';
      params.push(user.propertyId);
    } else if (propertyId && propertyId !== 'all') {
      whereClause += ' AND r.property_id = ?';
      params.push(propertyId);
    }

    // Sources breakdown
    const sourceSql = `
      SELECT 
        COALESCE(r.source, 'DIRECT') AS source,
        COUNT(r.id) AS count,
        COALESCE(SUM(r.total_amount), 0.00) AS volume
      FROM reservations r
      ${whereClause}
      GROUP BY source
      ORDER BY count DESC
    `;
    const sources = await pool.query(sourceSql, params);

    // Statuses breakdown
    const statusSql = `
      SELECT 
        r.status,
        COUNT(r.id) AS count,
        COALESCE(SUM(r.total_amount), 0.00) AS volume
      FROM reservations r
      ${whereClause}
      GROUP BY r.status
    `;
    const statuses = await pool.query(statusSql, params);

    // Average Length of Stay & Lead Time
    const metricsSql = `
      SELECT 
        COALESCE(AVG(r.nights), 1.0) AS average_length_of_stay,
        COALESCE(AVG(DATEDIFF(r.check_in_date, r.created_at)), 0) AS average_lead_time_days
      FROM reservations r
      ${whereClause} AND r.status != 'CANCELLED'
    `;
    const metricsResult = await pool.query(metricsSql, params);
    const metrics = metricsResult[0] || {};

    return {
      sources,
      statuses,
      metrics: {
        averageLengthOfStay: Number(parseFloat(metrics.average_length_of_stay || 1).toFixed(1)),
        averageLeadTimeDays: Number(parseFloat(metrics.average_lead_time_days || 0).toFixed(1)),
      },
    };
  }

  /**
   * Apartment / Unit Performance Breakdown (RevPAR, Occupancy, Maintenance Cost)
   */
  static async getApartments({ propertyId, fromDate, toDate, user } = {}) {
    const { fromStr, toStr, diffDays } = this.getDateBounds(fromDate, toDate);

    let sql = `
      SELECT 
        a.id AS apartment_id,
        a.unit_number,
        a.unit_name,
        a.unit_type,
        a.status AS current_status,
        a.rate_per_night,
        p.id AS property_id,
        p.name AS property_name,
        COALESCE(b.total_bookings, 0) AS total_bookings,
        COALESCE(b.occupied_nights, 0) AS occupied_nights,
        COALESCE(b.revenue_generated, 0.00) AS revenue_generated,
        COALESCE(m.maintenance_incidents, 0) AS maintenance_incidents,
        COALESCE(m.maintenance_cost, 0.00) AS maintenance_cost
      FROM apartments a
      JOIN properties p ON a.property_id = p.id
      LEFT JOIN (
        SELECT 
          apartment_id,
          COUNT(id) AS total_bookings,
          SUM(CASE WHEN status != 'CANCELLED' THEN nights ELSE 0 END) AS occupied_nights,
          SUM(CASE WHEN status != 'CANCELLED' THEN total_amount ELSE 0 END) AS revenue_generated
        FROM reservations
        WHERE DATE(check_in_date) >= ? AND DATE(check_in_date) <= ?
        GROUP BY apartment_id
      ) b ON b.apartment_id = a.id
      LEFT JOIN (
        SELECT 
          apartment_id,
          COUNT(id) AS maintenance_incidents,
          SUM(actual_cost) AS maintenance_cost
        FROM maintenance_requests
        WHERE DATE(created_at) >= ? AND DATE(created_at) <= ?
        GROUP BY apartment_id
      ) m ON m.apartment_id = a.id
      WHERE 1=1
    `;

    const params = [fromStr, toStr, fromStr, toStr];

    if (user && user.propertyId && !['SUPER_ADMIN', 'OWNER', 'ADMIN'].includes(user.role)) {
      sql += ' AND a.property_id = ?';
      params.push(user.propertyId);
    } else if (propertyId && propertyId !== 'all') {
      sql += ' AND a.property_id = ?';
      params.push(propertyId);
    }

    sql += ' ORDER BY revenue_generated DESC, a.unit_number ASC';

    const rows = await pool.query(sql, params);

    // Calculate rates for each unit
    const results = rows.map((u) => {
      const occupiedNights = parseInt(u.occupied_nights || 0, 10);
      const revenue = parseFloat(u.revenue_generated || 0);
      const availableNights = diffDays;
      const occupancyRate = Number(Math.min(100, (occupiedNights / availableNights) * 100).toFixed(2));
      const adr = occupiedNights > 0 ? Number((revenue / occupiedNights).toFixed(2)) : 0.00;
      const revPar = Number((revenue / availableNights).toFixed(2));

      return {
        ...u,
        total_bookings: parseInt(u.total_bookings, 10),
        occupied_nights: occupiedNights,
        revenue_generated: revenue,
        maintenance_incidents: parseInt(u.maintenance_incidents, 10),
        maintenance_cost: parseFloat(u.maintenance_cost || 0),
        occupancy_rate: occupancyRate,
        adr,
        rev_par: revPar,
      };
    });

    return results;
  }

  /**
   * Agent Performance Leaderboard & Commission Analytics
   */
  static async getAgents({ propertyId, fromDate, toDate, user } = {}) {
    const { fromStr, toStr } = this.getDateBounds(fromDate, toDate);

    let sql = `
      SELECT 
        a.id AS agent_id,
        a.name,
        a.agency_name,
        a.email,
        a.phone,
        a.commission_rate,
        a.commission_type,
        a.status,
        COUNT(DISTINCT r.id) AS total_bookings,
        COALESCE(SUM(CASE WHEN r.status != 'CANCELLED' THEN r.total_amount ELSE 0 END), 0.00) AS total_volume_brought,
        COALESCE(SUM(c.commission_amount), 0.00) AS total_commission_generated,
        COALESCE(SUM(CASE WHEN c.status = 'PAID' THEN c.commission_amount ELSE 0 END), 0.00) AS paid_commission,
        COALESCE(SUM(CASE WHEN c.status IN ('PENDING', 'CALCULATED', 'APPROVED') THEN c.commission_amount ELSE 0 END), 0.00) AS pending_commission
      FROM agents a
      LEFT JOIN reservations r ON r.agent_id = a.id AND DATE(r.check_in_date) >= ? AND DATE(r.check_in_date) <= ?
      LEFT JOIN commissions c ON c.reservation_id = r.id AND c.agent_id = a.id
      WHERE 1=1
    `;

    const params = [fromStr, toStr];

    if (user && user.role === 'AGENT') {
      sql += ' AND a.id = ?';
      params.push(user.agentId);
    } else if (user && user.propertyId && !['SUPER_ADMIN', 'OWNER', 'ADMIN'].includes(user.role)) {
      sql += ' AND (a.property_id = ? OR a.property_id IS NULL)';
      params.push(user.propertyId);
    } else if (propertyId && propertyId !== 'all') {
      sql += ' AND a.property_id = ?';
      params.push(propertyId);
    }

    sql += ' GROUP BY a.id ORDER BY total_volume_brought DESC, total_bookings DESC';

    const rows = await pool.query(sql, params);
    return rows;
  }

  /**
   * Operational Analytics (Maintenance & Inspection KPIs)
   */
  static async getOperations({ propertyId, fromDate, toDate, user } = {}) {
    const { fromStr, toStr } = this.getDateBounds(fromDate, toDate);

    // Maintenance summary
    let mntSql = `
      SELECT 
        COUNT(id) AS total_requests,
        SUM(CASE WHEN status = 'OPEN' THEN 1 ELSE 0 END) AS open_count,
        SUM(CASE WHEN status = 'IN_PROGRESS' THEN 1 ELSE 0 END) AS in_progress_count,
        SUM(CASE WHEN status = 'RESOLVED' THEN 1 ELSE 0 END) AS resolved_count,
        SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END) AS cancelled_count,
        COALESCE(SUM(actual_cost), 0.00) AS total_spent,
        COALESCE(AVG(CASE WHEN status = 'RESOLVED' AND started_at IS NOT NULL AND resolved_at IS NOT NULL 
          THEN TIMESTAMPDIFF(HOUR, started_at, resolved_at) ELSE NULL END), 0) AS avg_turnaround_hours
      FROM maintenance_requests
      WHERE DATE(created_at) >= ? AND DATE(created_at) <= ?
    `;
    const mntParams = [fromStr, toStr];

    if (user && user.propertyId && !['SUPER_ADMIN', 'OWNER', 'ADMIN'].includes(user.role)) {
      mntSql += ' AND property_id = ?';
      mntParams.push(user.propertyId);
    } else if (propertyId && propertyId !== 'all') {
      mntSql += ' AND property_id = ?';
      mntParams.push(propertyId);
    }

    const mntRows = await pool.query(mntSql, mntParams);

    // Inspection summary
    let inspSql = `
      SELECT 
        COUNT(id) AS total_inspections,
        SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed_count,
        SUM(CASE WHEN condition_rating IN ('EXCELLENT', 'GOOD') THEN 1 ELSE 0 END) AS pass_count,
        SUM(CASE WHEN condition_rating IN ('FAIR', 'POOR', 'CRITICAL') THEN 1 ELSE 0 END) AS attention_needed_count
      FROM inspections
      WHERE DATE(created_at) >= ? AND DATE(created_at) <= ?
    `;
    const inspParams = [fromStr, toStr];
    if (user && user.propertyId && !['SUPER_ADMIN', 'OWNER', 'ADMIN'].includes(user.role)) {
      inspSql += ' AND property_id = ?';
      inspParams.push(user.propertyId);
    } else if (propertyId && propertyId !== 'all') {
      inspSql += ' AND property_id = ?';
      inspParams.push(propertyId);
    }

    const inspRows = await pool.query(inspSql, inspParams);

    return {
      maintenance: mntRows[0] || {},
      inspections: inspRows[0] || {},
    };
  }
}

module.exports = AnalyticsRepository;
