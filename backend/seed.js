const db = require('./src/models/db');

// Insert sample data if table is empty
db.get('SELECT COUNT(*) as count FROM investments', [], (err, row) => {
  if (err) {
    console.error('Error checking investments count:', err.message);
    process.exit(1);
  }
  if (row.count === 0) {
    const stmt = db.prepare('INSERT INTO investments (symbol, quantity, avg_price, current_price) VALUES (?, ?, ?, ?)');
    const sample = [
      ['ABEV3', 100, 12.5, 13.2],
      ['PETR4', 50, 30.0, 31.8],
      ['VALE3', 20, 65.0, 70.1],
    ];
    for (const [symbol, quantity, avg, cur] of sample) {
      stmt.run(symbol, quantity, avg, cur);
    }
    stmt.finalize(() => {
      console.log('Seed data inserted into investments table');
      db.close();
    });
  } else {
    console.log('Investments table already has data');
    db.close();
  }
});

