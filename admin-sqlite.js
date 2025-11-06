const { db } = require('./db');

function authenticateAdmin(req, res, next) {
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

async function getStats(req, res) {
  try {
    const usersResult = db.prepare('SELECT COUNT(*) as count FROM users').get();
    const balanceResult = db.prepare('SELECT SUM(balance) as total FROM users').get();
    const rechargeResult = db.prepare('SELECT SUM(total_recharge) as total FROM users').get();
    const withdrawResult = db.prepare('SELECT SUM(total_withdraw) as total FROM users').get();

    res.json({
      totalUsers: usersResult.count,
      totalBalance: (balanceResult.total || 0).toFixed(2),
      totalRecharge: (rechargeResult.total || 0).toFixed(2),
      totalWithdraw: (withdrawResult.total || 0).toFixed(2)
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
}

async function getAllUsers(req, res) {
  try {
    const result = db.prepare(
      `SELECT id, phone, balance, total_recharge, total_withdraw, total_welfare, referral_code, referred_by, created_at 
       FROM users 
       ORDER BY created_at DESC`
    ).all();

    res.json({ users: result });
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
}

async function getAllTransactions(req, res) {
  try {
    const result = db.prepare(
      `SELECT id, user_id, type, amount, status, upi_id, utr_number, created_at 
       FROM transactions 
       ORDER BY created_at DESC 
       LIMIT 200`
    ).all();

    res.json({ transactions: result });
  } catch (error) {
    console.error('Get all transactions error:', error);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
}

async function getPendingPayments(req, res) {
  try {
    const result = db.prepare(
      `SELECT id, user_id, type, amount, status, upi_id, utr_number, created_at 
       FROM transactions 
       WHERE status IN ('pending', 'verification_pending') 
       ORDER BY created_at DESC`
    ).all();

    res.json({ pending: result });
  } catch (error) {
    console.error('Get pending payments error:', error);
    res.status(500).json({ error: 'Failed to fetch pending payments' });
  }
}

async function approvePayment(req, res) {
  const { transactionId } = req.body;

  if (!transactionId) {
    return res.status(400).json({ error: 'Transaction ID is required' });
  }

  try {
    const transaction = db.prepare(
      'SELECT id, user_id, amount, status, type FROM transactions WHERE id = ?'
    ).get(transactionId);

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    if (transaction.status === 'completed') {
      return res.status(400).json({ error: 'Transaction already approved' });
    }

    const approveTransaction = db.transaction(() => {
      db.prepare(
        'UPDATE transactions SET status = ? WHERE id = ?'
      ).run('completed', transactionId);

      if (transaction.type === 'recharge') {
        const amount = parseFloat(transaction.amount);
        db.prepare(
          'UPDATE users SET balance = balance + ?, total_recharge = total_recharge + ? WHERE id = ?'
        ).run(amount, amount, transaction.user_id);
      }
    });

    approveTransaction();

    res.json({ message: 'Payment approved successfully' });
  } catch (error) {
    console.error('Approve payment error:', error);
    res.status(500).json({ error: 'Failed to approve payment' });
  }
}

async function rejectPayment(req, res) {
  const { transactionId } = req.body;

  if (!transactionId) {
    return res.status(400).json({ error: 'Transaction ID is required' });
  }

  try {
    const transaction = db.prepare(
      'SELECT id, user_id, amount, status, type FROM transactions WHERE id = ?'
    ).get(transactionId);

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    const rejectTransaction = db.transaction(() => {
      db.prepare(
        'UPDATE transactions SET status = ? WHERE id = ?'
      ).run('rejected', transactionId);

      if (transaction.type === 'withdraw' && transaction.status !== 'completed') {
        const amount = parseFloat(transaction.amount);
        db.prepare(
          'UPDATE users SET balance = balance + ?, total_withdraw = total_withdraw - ? WHERE id = ?'
        ).run(amount, amount, transaction.user_id);
      }
    });

    rejectTransaction();

    res.json({ message: 'Payment rejected successfully' });
  } catch (error) {
    console.error('Reject payment error:', error);
    res.status(500).json({ error: 'Failed to reject payment' });
  }
}

async function getUPIs(req, res) {
  try {
    const result = db.prepare(
      `SELECT id, upi_id, qr_position, successful_payments, max_payments_per_qr, is_active, created_at 
       FROM qr_codes 
       ORDER BY qr_position ASC`
    ).all();

    res.json({ upis: result });
  } catch (error) {
    console.error('Get UPIs error:', error);
    res.status(500).json({ error: 'Failed to fetch UPI IDs' });
  }
}

module.exports = {
  authenticateAdmin,
  getStats,
  getAllUsers,
  getAllTransactions,
  getPendingPayments,
  approvePayment,
  rejectPayment,
  getUPIs
};
