#!/usr/bin/env node

/* eslint-disable no-use-before-define */

// Dependencies
const chalk = require('chalk');
const inquirer = require('inquirer');
// const yargs = require('yargs');
const netbank = require('..');
const moment = require('moment-timezone');
const Table = require('easy-table');
const debug = require('debug')('node-cba-netbank');

moment.tz.setDefault('Australia/Sydney');

let accounts = [];

const renderCurrency = amount => (amount >= 0 ? chalk.green.bold(`$${amount}`) : chalk.red.bold(`$${amount}`));

function getAccountTitle(account) {
  const title = `${chalk.bold(account.name)} (${chalk.red(account.bsb)} ${chalk.red(account.account)})  =>  Balance: ${renderCurrency(account.balance)} Available Funds: ${renderCurrency(account.available)}`;
  return title;
}

function fetchHistory(answer) {
  debug(`fetchHistory(): accounts[${accounts.length}]`);
  debug(`[${accounts.map(a => a.name)}]`);
  const account = accounts.find(v => answer.account.number === v.number);
  if (account) {
    debug(`fetchHistory(${getAccountTitle(answer.account)}): found account ${getAccountTitle(account)}`);
    //  download 6 months transactions
    console.log(`Downloading 6 months history for ${getAccountTitle(account)} ...`);
    return netbank
      .getTransactions(account, netbank.toDateString(moment().subtract(6, 'months').valueOf()))
      .then(showTransactions);
  }
  throw new Error('Quit.');
}

function showTransactions(resp) {
  console.log(Table.print(resp.transactions.map(t => ({
    Time: chalk.italic.yellow(moment(t.timestamp).format('YYYY-MM-DD HH:mm')),
    Description: t.description.replace(/\n/g, ''),
    Amount: renderCurrency(t.amount),
  }))));
  console.log(`Retrieved ${resp.transactions.length} transactions.`);
  return inquirer
    .prompt({
      type: 'list',
      name: 'account',
      message: 'Which account?',
      choices: accounts.map(a => ({ name: getAccountTitle(a), value: a })).concat([chalk.red('<Quit>')]),
    })
    .then(fetchHistory);
}

function login(credential) {
  console.log(`Logging into the netbank as account ${credential.username} ...`);
  return (
    netbank
      .login(credential)
      .catch(() =>
        inquirer
          .prompt({
            type: 'confirm',
            name: 'tryagain',
            message: 'Failed to logged in, try again?',
          })
          .then((answer) => {
            if (answer.tryagain) {
              console.log();
              return main();
            }
            throw new Error('Quit');
          }),
      )
      //  user select an account to download transaction, or quit.
      .then((resp) => {
        accounts = resp.accounts;
        return inquirer.prompt({
          type: 'list',
          name: 'account',
          message: 'Which account?',
          choices: resp.accounts.map(a => ({ name: getAccountTitle(a), value: a })).concat([chalk.red('<Quit>')]),
        });
      })
      .then(fetchHistory)
  );
}

function main() {
  const credential = {
    username: process.env.NETBANK_USERNAME,
    password: process.env.NETBANK_PASSWORD,
  };
  //  user input credential
  const questions = [];

  //  client number
  if (!credential.username) {
    questions.push({
      type: 'input',
      name: 'username',
      message: "What's your client number:",
      validate: input => /^\d{1,8}$/.test(input),
    });
  }

  //  password
  if (!credential.password) {
    questions.push({
      type: 'password',
      name: 'password',
      message: "What's your password:",
      validate: input => /^[\w\d-]{4,16}$/.test(input),
    });
  }

  if (questions.length > 0) {
    return inquirer.prompt(questions).then(login);
  }
  return login(credential);
}

console.table([{ name: 'foo' }, { name: 'bar' }]);

main().then(() => console.log('bye')).catch(debug);
