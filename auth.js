const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { db } = require('./db');

let JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  JWT_SECRET = 'easymoney-premium-jwt-secret-2024-CHANGE-THIS-IN-PRODUCTION';
  console.warn('\n⚠️  WARNING: Using default JWT_SECRET. Set JWT_SECRET environment variable for production!\n');
}

function generateReferralCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

async function register(req, res) {
  const { phone, password, referralCode } = req.body;

  if (!phone || !password) {
    return res.status(400).json({ error: 'Phone and password are required' });
  }

  if (phone.length < 10) {
    return res.status(400).json({ error: 'Invalid phone number' });
  }

  try {
    const existingUser = db.prepare('SELECT id FROM users WHERE phone = ?').get(phone);
    if (existingUser) {
      return res.status(400).json({ error: 'Phone number already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const userReferralCode = generateReferralCode();

    const result = db.prepare(
      `INSERT INTO users (phone, password_hash, referral_code, referred_by) 
       VALUES (?, ?, ?, ?)`
    ).run(phone, passwordHash, userReferralCode, referralCode || null);

    const user = db.prepare('SELECT id, phone, referral_code, balance FROM users WHERE id = ?').get(result.lastInsertRowid);

    const token = jwt.sign({ userId: user.id, phone: user.phone }, JWT_SECRET, { expiresIn: '30d' });

    res.json({
      message: 'Registration successful',
      token,
      user: {
        id: user.id,
        phone: user.phone,
        referralCode: user.referral_code,
        balance: user.balance
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
}

async function login(req, res) {
  const { phone, password } = req.body;

  if (!phone || !password) {
    return res.status(400).json({ error: 'Phone and password are required' });
  }

  try {
    const user = db.prepare(
      'SELECT id, phone, password_hash, referral_code, balance, is_admin FROM users WHERE phone = ?'
    ).get(phone);

    if (!user) {
      return res.status(401).json({ error: 'Invalid phone or password' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid phone or password' });
    }

    const token = jwt.sign({ 
      userId: user.id, 
      phone: user.phone,
      isAdmin: user.is_admin 
    }, JWT_SECRET, { expiresIn: '30d' });

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        phone: user.phone,
        referralCode: user.referral_code,
        balance: user.balance,
        isAdmin: user.is_admin
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
}

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
}

module.exports = { register, login, authenticateToken };
