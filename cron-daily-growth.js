const fetch = require('node').fetch || require('https');

const API_URL = process.env.REPLIT_DEV_DOMAIN 
  ? `https://${process.env.REPLIT_DEV_DOMAIN}/api/cron/daily-growth`
  : 'http://localhost:5000/api/cron/daily-growth';

async function runDailyGrowth() {
  try {
    console.log('Starting daily growth process...');
    console.log('Calling:', API_URL);

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    console.log('Daily growth completed successfully:');
    console.log(`- Processed: ${data.processed}`);
    console.log(`- Skipped: ${data.skipped}`);
    console.log(`- Total: ${data.total}`);
  } catch (error) {
    console.error('Daily growth failed:', error.message);
    process.exit(1);
  }
}

runDailyGrowth();
