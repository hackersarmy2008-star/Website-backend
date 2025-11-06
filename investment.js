const { db } = require('./db');

function logTransaction(userId, type, amount, oldBalance, newBalance, status = 'completed', remarks = null, adminId = null) {
  try {
    db.prepare(
      `INSERT INTO transactions (user_id, type, amount, old_balance, new_balance, status, remarks, admin_id) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(userId, type, amount, oldBalance, newBalance, status, remarks, adminId);
  } catch (error) {
    console.error('Error logging transaction:', error);
  }
}

async function createInvestment(req, res) {
  const { amount } = req.body;
  const userId = req.user.userId;

  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'Invalid investment amount' });
  }

  try {
    const user = db.prepare('SELECT id, balance FROM users WHERE id = ?').get(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.balance < amount) {
      return res.status(400).json({ 
        error: 'Insufficient wallet balance. Please add funds before investing.' 
      });
    }

    const oldBalance = user.balance;
    const newBalance = oldBalance - amount;

    const transaction = db.transaction(() => {
      db.prepare('UPDATE users SET balance = ? WHERE id = ?').run(newBalance, userId);

      const result = db.prepare(
        `INSERT INTO investments (user_id, plan_name, amount, daily_profit, total_profit, days, status, last_growth_time) 
         VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
      ).run(userId, 'Daily Growth Plan', amount, 100, 0, 365, 'active');

      logTransaction(
        userId, 
        'invest', 
        amount, 
        oldBalance, 
        newBalance, 
        'completed', 
        `Investment created - Daily ₹100 growth plan`
      );

      return result.lastInsertRowid;
    });

    const investmentId = transaction();

    res.json({
      message: 'Investment successful. ₹100 will be added to your wallet every 24 hours.',
      investmentId,
      newBalance: newBalance.toFixed(2),
      dailyGrowth: 100
    });
  } catch (error) {
    console.error('Create investment error:', error);
    res.status(500).json({ error: 'Failed to create investment' });
  }
}

async function getUserInvestments(req, res) {
  const userId = req.user.userId;

  try {
    const investments = db.prepare(
      `SELECT id, plan_name, amount, daily_profit, total_profit, days, status, last_growth_time, created_at 
       FROM investments 
       WHERE user_id = ? 
       ORDER BY created_at DESC`
    ).all(userId);

    const activeCount = investments.filter(inv => inv.status === 'active').length;
    const totalInvested = investments.reduce((sum, inv) => sum + inv.amount, 0);
    const totalEarned = investments.reduce((sum, inv) => sum + inv.total_profit, 0);

    res.json({
      investments,
      summary: {
        activeInvestments: activeCount,
        totalInvested: totalInvested.toFixed(2),
        totalEarned: totalEarned.toFixed(2)
      }
    });
  } catch (error) {
    console.error('Get investments error:', error);
    res.status(500).json({ error: 'Failed to fetch investments' });
  }
}

async function processDailyGrowth(req, res) {
  try {
    const activeInvestments = db.prepare(
      `SELECT i.id, i.user_id, i.daily_profit, i.total_profit, i.last_growth_time
       FROM investments i
       WHERE i.status = 'active'`
    ).all();

    let processedCount = 0;
    let skippedCount = 0;
    const now = new Date();

    const processGrowth = db.transaction(() => {
      for (const investment of activeInvestments) {
        const lastGrowthTime = investment.last_growth_time ? new Date(investment.last_growth_time) : null;
        
        if (!lastGrowthTime) {
          continue;
        }

        const hoursSinceLastGrowth = (now - lastGrowthTime) / (1000 * 60 * 60);
        
        if (hoursSinceLastGrowth >= 24) {
          const user = db.prepare('SELECT balance FROM users WHERE id = ?').get(investment.user_id);
          const oldBalance = user.balance;
          const growthAmount = investment.daily_profit;
          const newBalance = oldBalance + growthAmount;
          const newTotalProfit = investment.total_profit + growthAmount;

          db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(growthAmount, investment.user_id);

          db.prepare(
            'UPDATE investments SET total_profit = ?, last_growth_time = datetime(?) WHERE id = ?'
          ).run(newTotalProfit, now.toISOString(), investment.id);

          logTransaction(
            investment.user_id,
            'daily_bonus',
            growthAmount,
            oldBalance,
            newBalance,
            'completed',
            `Daily growth bonus - Investment #${investment.id}`
          );

          processedCount++;
        } else {
          skippedCount++;
        }
      }
    });

    processGrowth();

    res.json({
      message: 'Daily growth processed successfully',
      processed: processedCount,
      skipped: skippedCount,
      total: activeInvestments.length
    });
  } catch (error) {
    console.error('Process daily growth error:', error);
    res.status(500).json({ error: 'Failed to process daily growth' });
  }
}

async function getInvestmentStats(req, res) {
  try {
    const totalInvested = db.prepare(
      'SELECT COALESCE(SUM(amount), 0) as total FROM investments'
    ).get();

    const totalProfit = db.prepare(
      'SELECT COALESCE(SUM(total_profit), 0) as total FROM investments'
    ).get();

    const activeInvestments = db.prepare(
      'SELECT COUNT(*) as count FROM investments WHERE status = ?'
    ).get('active');

    const totalInvestors = db.prepare(
      'SELECT COUNT(DISTINCT user_id) as count FROM investments'
    ).get();

    res.json({
      totalInvested: totalInvested.total.toFixed(2),
      totalProfit: totalProfit.total.toFixed(2),
      activeInvestments: activeInvestments.count,
      totalInvestors: totalInvestors.count
    });
  } catch (error) {
    console.error('Get investment stats error:', error);
    res.status(500).json({ error: 'Failed to fetch investment stats' });
  }
}

module.exports = {
  createInvestment,
  getUserInvestments,
  processDailyGrowth,
  getInvestmentStats
};
