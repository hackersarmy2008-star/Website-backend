const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const { initDatabase, db } = require('./api/db');
const { register, login, authenticateToken } = require('./api/auth');
const { initiateRecharge, confirmRecharge, initiateWithdraw, approveWithdrawal, denyWithdrawal, getUserWithdrawals, getTransactions, approveRecharge } = require('./api/payment');
const { createInvestment, getUserInvestments, processDailyGrowth, getInvestmentStats } = require('./api/investment');
const { authenticateAdmin, getStats, getAllUsers, getAllTransactions, getPendingPayments, approvePayment, rejectPayment, getUPIs } = require('./api/admin-sqlite');

const app = express();
const PORT = 5000;
const HOST = '0.0.0.0';

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  next();
});

app.use(express.static('.', {
  extensions: ['html'],
  setHeaders: (res, path) => {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  }
}));

app.post('/api/auth/register', register);
app.post('/api/auth/login', login);

app.post('/api/auth/admin-login', async (req, res) => {
  const { username, password } = req.body;
  
  const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
  
  if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
    return res.status(500).json({ error: 'Admin credentials not configured' });
  }
  
  if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Invalid admin credentials' });
  }
  
  const jwt = require('jsonwebtoken');
  const JWT_SECRET = process.env.JWT_SECRET || 'easymoney-premium-jwt-secret-2024-CHANGE-THIS-IN-PRODUCTION';
  
  const token = jwt.sign({ 
    userId: 0,
    phone: 'admin',
    isAdmin: true
  }, JWT_SECRET, { expiresIn: '24h' });
  
  res.json({
    message: 'Admin login successful',
    token,
    user: {
      id: 0,
      phone: 'admin',
      isAdmin: true
    }
  });
});

app.get('/api/user/profile', authenticateToken, async (req, res) => {
  try {
    const result = db.prepare(
      `SELECT id, phone, balance, total_recharge, total_withdraw, total_welfare, referral_code 
       FROM users WHERE id = ?`
    ).get(req.user.userId);

    if (!result) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user: result });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

app.post('/api/user/checkin', authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  const today = new Date().toISOString().split('T')[0];

  try {
    const existing = db.prepare(
      'SELECT id FROM checkins WHERE user_id = ? AND checkin_date = ?'
    ).get(userId, today);

    if (existing) {
      return res.status(400).json({ error: 'Already checked in today' });
    }

    const bonus = Math.floor(Math.random() * 51) + 10;

    const checkinTransaction = db.transaction(() => {
      db.prepare(
        'INSERT INTO checkins (user_id, amount, checkin_date) VALUES (?, ?, ?)'
      ).run(userId, bonus, today);

      db.prepare(
        'UPDATE users SET balance = balance + ?, total_welfare = total_welfare + ? WHERE id = ?'
      ).run(bonus, bonus, userId);
    });

    checkinTransaction();

    const userResult = db.prepare('SELECT balance FROM users WHERE id = ?').get(userId);

    res.json({
      message: 'Check-in successful!',
      bonus,
      balance: userResult.balance
    });
  } catch (error) {
    console.error('Check-in error:', error);
    res.status(500).json({ error: 'Check-in failed' });
  }
});

app.post('/api/payment/recharge', authenticateToken, initiateRecharge);
app.post('/api/payment/recharge/confirm', authenticateToken, confirmRecharge);
app.post('/api/payment/withdraw', authenticateToken, initiateWithdraw);
app.get('/api/withdrawals', authenticateToken, getUserWithdrawals);
app.get('/api/transactions', authenticateToken, getTransactions);

app.post('/api/invest', authenticateToken, createInvestment);
app.get('/api/investments', authenticateToken, getUserInvestments);

app.post('/api/cron/daily-growth', processDailyGrowth);

app.get('/api/admin/stats', authenticateToken, authenticateAdmin, getStats);
app.get('/api/admin/users', authenticateToken, authenticateAdmin, getAllUsers);
app.get('/api/admin/transactions', authenticateToken, authenticateAdmin, getAllTransactions);
app.get('/api/admin/pending', authenticateToken, authenticateAdmin, getPendingPayments);
app.post('/api/admin/approve', authenticateToken, authenticateAdmin, approvePayment);
app.post('/api/admin/reject', authenticateToken, authenticateAdmin, rejectPayment);
app.get('/api/admin/upis', authenticateToken, authenticateAdmin, getUPIs);
app.get('/api/admin/investment-stats', authenticateToken, authenticateAdmin, getInvestmentStats);

app.get('/api/admin/pending-withdrawals', authenticateToken, authenticateAdmin, async (req, res) => {
  try {
    const withdrawals = db.prepare(`
      SELECT w.id, w.user_id, w.requested_amount, w.status, w.upi_id, w.created_at, u.phone 
      FROM withdrawals w
      JOIN users u ON w.user_id = u.id
      WHERE w.status = 'pending'
      ORDER BY w.created_at DESC
    `).all();
    res.json({ withdrawals });
  } catch (error) {
    console.error('Get pending withdrawals error:', error);
    res.status(500).json({ error: 'Failed to fetch pending withdrawals' });
  }
});

app.post('/api/admin/withdraw/:id/approve', authenticateToken, authenticateAdmin, async (req, res) => {
  const withdrawalId = parseInt(req.params.id);
  await approveWithdrawal({ ...req, body: { withdrawalId } }, res);
});

app.post('/api/admin/withdraw/:id/deny', authenticateToken, authenticateAdmin, async (req, res) => {
  const withdrawalId = parseInt(req.params.id);
  const { reason } = req.body;
  await denyWithdrawal({ ...req, body: { withdrawalId, reason } }, res);
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use((req, res, next) => {
  if (!req.path.startsWith('/api') && req.method === 'GET') {
    res.sendFile(path.join(__dirname, 'login.html'));
  } else if (req.path.startsWith('/api')) {
    res.status(404).json({ error: 'API endpoint not found' });
  } else {
    next();
  }
});

function startServer() {
  try {
    initDatabase();
    app.listen(PORT, HOST, () => {
      console.log(`Backend server running at http://${HOST}:${PORT}/`);
      console.log('API endpoints available at /api/*');
      console.log('Using SQLite database with admin support');
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
