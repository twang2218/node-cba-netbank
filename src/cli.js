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

const msgQuit = 'quit';
const tagQuit = chalk.red('<Quit>');

class Render {
  static currency(amount) {
    return amount >= 0 ? chalk.green.bold(`$${amount}`) : chalk.red.bold(`$${amount}`);
  }
  static account(account) {
    return (
      `${chalk.bold(account.name)} (${chalk.red(account.bsb)} ${chalk.red(account.account)})` +
      '  =>  ' +
      `Balance: ${Render.currency(account.balance)} ` +
      `Available Funds: ${Render.currency(account.available)}`
    );
  }
  static transactions(transactions) {
    return Table.print(
      transactions.map(t => ({
        Time: chalk.italic.yellow(moment(t.timestamp).format('YYYY-MM-DD HH:mm')),
        Description: t.description.replace(/\n/g, ''),
        Amount: Render.currency(t.amount),
      })),
    );
  }
}

/* eslint-disable class-methods-use-this */
class UI {
  constructor() {
    this.accounts = [];
  }

  logon(credential) {
    console.log(`Logon as account ${credential.username} ...`);
    return netbank
      .logon(credential)
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
              return this.logon();
            }
            throw new Error('Quit');
          }),
      )
      .then((resp) => {
        this.accounts = resp.accounts;
        return this.chooseAccountAndShowHistory(this.accounts);
      })
      .catch((error) => {
        debug(error);
        console.log('Bye!');
      });
  }

  chooseAccountAndShowHistory() {
    return this.selectAccount()
      .then(account =>
        this.downloadHistoryAndShow(account, netbank.toDateString(moment().subtract(2, 'months').valueOf())),
      )
      .then(() => this.chooseAccountAndShowHistory());
  }

  selectAccount() {
    return inquirer
      .prompt({
        type: 'list',
        name: 'account',
        message: 'Which account?',
        choices: this.accounts.map(a => ({ name: Render.account(a), value: a })).concat([tagQuit]),
      })
      .then((answer) => {
        if (answer.account === tagQuit) {
          throw new Error(msgQuit);
        }
        const account = this.accounts.find(v => answer.account.number === v.number);
        if (!account) {
          throw new Error(msgQuit);
        }
        debug(`selectAccount(${Render.account(answer.account)}): found account ${Render.account(account)}`);
        return account;
      });
  }

  downloadHistory(account, from, to) {
    console.log(`Downloading history [${from} => ${to}] ...`);
    return netbank.getTransactionHistory(account, from, to).then(resp => resp.transactions);
  }

  downloadHistoryAndShow(account, from, to = netbank.toDateString(moment().valueOf())) {
    return this.downloadHistory(account, from, to).then((transactions) => {
      console.log(Render.transactions(transactions));
      console.log(`Total ${transactions.length} transactions.`);
      return transactions;
    });
  }
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

  const ui = new UI();
  if (questions.length > 0) {
    return inquirer.prompt(questions).then(c => ui.logon(c));
  }
  return ui.logon(credential);
}

main().catch(debug);
