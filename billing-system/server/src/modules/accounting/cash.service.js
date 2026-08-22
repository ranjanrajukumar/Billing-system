import { CashRegister, CashTransaction } from '../../models/index.js';

/**
 * Cash movements through a register.
 *
 * The running balance is computed from the register's last transaction inside
 * the caller's transaction, with the register row locked — two counters taking
 * money at the same till must not both read the same "previous balance" and
 * write two rows that each look correct in isolation.
 */
export async function recordCashMovement({
  registerId,
  entryType,
  amountIn = 0,
  amountOut = 0,
  referenceType = null,
  referenceId = null,
  referenceNumber = null,
  partyName = null,
  notes = null,
  transactionDate = null,
  transaction,
  userId = null,
}) {
  const register = await CashRegister.findOne({
    where: { id: registerId, detstatus: false },
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined,
  });
  if (!register) throw Object.assign(new Error('Cash register not found'), { status: 404 });
  if (register.status !== 'Open') {
    throw Object.assign(new Error('This cash register is closed. Open a new shift first.'), { status: 409 });
  }

  const last = await CashTransaction.findOne({
    where: { registerId, detstatus: false },
    order: [['id', 'DESC']],
    transaction,
  });

  const previous = last ? Number(last.balance) : Number(register.openingBalance || 0);
  const balance = previous + Number(amountIn || 0) - Number(amountOut || 0);

  return CashTransaction.create({
    registerId,
    branchId: register.branchId,
    entryType,
    transactionDate: transactionDate || new Date(),
    amountIn: Number(amountIn || 0),
    amountOut: Number(amountOut || 0),
    balance,
    referenceType,
    referenceId,
    referenceNumber,
    partyName,
    notes,
    authadd: userId,
  }, { transaction });
}

/** What the register's ledger says should be in the drawer right now. */
export async function expectedBalance(registerId, transaction) {
  const register = await CashRegister.findByPk(registerId, { transaction });
  if (!register) throw Object.assign(new Error('Cash register not found'), { status: 404 });

  const last = await CashTransaction.findOne({
    where: { registerId, detstatus: false },
    order: [['id', 'DESC']],
    transaction,
  });
  return last ? Number(last.balance) : Number(register.openingBalance || 0);
}

/** The open register at a location, if there is one. */
export async function openRegisterFor(branchId, transaction) {
  return CashRegister.findOne({
    where: { branchId, status: 'Open', detstatus: false },
    order: [['id', 'DESC']],
    transaction,
  });
}
