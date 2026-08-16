import { Sequelize } from 'sequelize';

const sequelize = new Sequelize('mysql://root:Raju%409452@localhost:3306/Billimgdb');

async function run() {
  try {
    const categories = await sequelize.query("SHOW COLUMNS FROM ExpenseCategories WHERE Field = 'id'");
    console.log('ExpenseCategories.id:', categories[0]);
  } catch (err) {
    try {
      const cats2 = await sequelize.query("SHOW COLUMNS FROM expense_categories WHERE Field = 'id'");
      console.log('expense_categories.id:', cats2[0]);
    } catch (e2) {
      console.error('Neither table found', err.message, e2.message);
    }
  }
  process.exit(0);
}
run();
