import { Sequelize } from 'sequelize';

const sequelize = new Sequelize('mysql://root:Raju%409452@localhost:3306/Billimgdb');

async function run() {
  try {
    const branches = await sequelize.query("SHOW COLUMNS FROM branches WHERE Field = 'id'");
    console.log('branches.id:', branches[0]);
    const expenses = await sequelize.query("SHOW COLUMNS FROM expenses WHERE Field = 'branch_id'");
    console.log('expenses.branch_id:', expenses[0]);
  } catch (err) {
    console.error(err);
  }
  process.exit(0);
}
run();
