const { db } = require('./db');

function getActiveQR() {
  let result = db.prepare(
    'SELECT * FROM qr_codes WHERE is_active = 1 ORDER BY qr_position LIMIT 1'
  ).get();

  if (!result) {
    const firstQR = db.prepare(
      'SELECT * FROM qr_codes ORDER BY qr_position LIMIT 1'
    ).get();
    
    if (firstQR) {
      db.prepare(
        'UPDATE qr_codes SET is_active = 1 WHERE id = ?'
      ).run(firstQR.id);
      return firstQR;
    }
    
    throw new Error('No QR codes available');
  }

  return result;
}

function rotateQR() {
  const transaction = db.transaction(() => {
    const currentQR = db.prepare(
      'SELECT * FROM qr_codes WHERE is_active = 1 ORDER BY qr_position LIMIT 1'
    ).get();

    if (!currentQR) {
      return null;
    }

    db.prepare(
      'UPDATE qr_codes SET is_active = 0 WHERE id = ?'
    ).run(currentQR.id);

    let nextQR = db.prepare(
      'SELECT * FROM qr_codes WHERE qr_position > ? ORDER BY qr_position LIMIT 1'
    ).get(currentQR.qr_position);

    if (!nextQR) {
      nextQR = db.prepare(
        'SELECT * FROM qr_codes ORDER BY qr_position LIMIT 1'
      ).get();
    }

    if (!nextQR) {
      throw new Error('No QR codes available for rotation');
    }

    db.prepare(
      'UPDATE qr_codes SET is_active = 1, successful_payments = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(nextQR.id);

    console.log(`QR rotated from position ${currentQR.qr_position} to ${nextQR.qr_position}`);
    return nextQR;
  });

  return transaction();
}

function incrementPaymentAndRotate() {
  const transaction = db.transaction(() => {
    const qr = db.prepare(
      'SELECT * FROM qr_codes WHERE is_active = 1 ORDER BY qr_position LIMIT 1'
    ).get();

    if (!qr) {
      return null;
    }

    db.prepare(
      'UPDATE qr_codes SET successful_payments = successful_payments + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(qr.id);

    const newCount = qr.successful_payments + 1;

    if (newCount >= qr.max_payments_per_qr) {
      console.log(`QR ${qr.qr_position} reached ${newCount} payments. Rotating...`);
      rotateQR();
    } else {
      console.log(`QR ${qr.qr_position} now has ${newCount}/${qr.max_payments_per_qr} payments`);
    }

    return true;
  });

  return transaction();
}

function addQRCode(upiId) {
  const maxPosition = db.prepare(
    'SELECT COALESCE(MAX(qr_position), 0) as max_pos FROM qr_codes'
  ).get();
  
  const newPosition = maxPosition.max_pos + 1;

  const result = db.prepare(
    `INSERT INTO qr_codes (upi_id, qr_position) 
     VALUES (?, ?)`
  ).run(upiId, newPosition);

  return db.prepare('SELECT * FROM qr_codes WHERE id = ?').get(result.lastInsertRowid);
}

function getAllQRCodes() {
  const result = db.prepare(
    'SELECT * FROM qr_codes ORDER BY qr_position'
  ).all();
  return result;
}

function updateQRCode(id, upiId) {
  db.prepare(
    'UPDATE qr_codes SET upi_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).run(upiId, id);
  
  return db.prepare('SELECT * FROM qr_codes WHERE id = ?').get(id);
}

function deleteQRCode(id) {
  db.prepare('DELETE FROM qr_codes WHERE id = ?').run(id);
  return true;
}

function getQRStats() {
  const activeQR = db.prepare(
    'SELECT * FROM qr_codes WHERE is_active = 1 LIMIT 1'
  ).get();

  const totalQRs = db.prepare(
    'SELECT COUNT(*) as count FROM qr_codes'
  ).get();

  const totalPayments = db.prepare(
    'SELECT SUM(successful_payments) as total FROM qr_codes'
  ).get();

  return {
    activeQR: activeQR || null,
    totalQRs: totalQRs.count,
    totalPayments: totalPayments.total || 0
  };
}

module.exports = {
  getActiveQR,
  rotateQR,
  incrementPaymentAndRotate,
  addQRCode,
  getAllQRCodes,
  updateQRCode,
  deleteQRCode,
  getQRStats
};
