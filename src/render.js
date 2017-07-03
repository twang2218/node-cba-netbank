//  Dependencies
const chalk = require('chalk');
const Table = require('easy-table');
const moment = require('./moment');

//  Functions
const currency = amount =>
  (amount >= 0 ? chalk.green.bold(`$${amount.toFixed(2)}`) : chalk.red.bold(`$${amount.toFixed(2)}`));
const account = a =>
  `${chalk.bold(a.name)} \t(${chalk.red(a.bsb)} ${chalk.red(a.account)})` +
  `\t Balance: ${currency(a.balance)} ` +
  `\t Available Funds: ${currency(a.available)}`;
const accounts = accs =>
  Table.print(
    accs.map(a => ({
      Name: chalk.bold(a.name),
      Number: `${chalk.red(a.bsb)} ${chalk.red(a.account)}`,
      Balance: `${currency(a.balance)}`,
      Available: `${currency(a.available)}`,
    })),
  );
const transactions = ts =>
  Table.print(
    ts.map(t => ({
      Time: chalk.italic.cyan(moment(t.timestamp).format('YYYY-MM-DD HH:mm')),
      Description: t.pending ? chalk.gray(t.description) : chalk.white(t.description),
      Amount: currency(t.amount),
      Balance: t.pending ? '' : currency(t.balance),
    })),
  );

module.exports = {
  currency,
  account,
  accounts,
  transactions,
};
