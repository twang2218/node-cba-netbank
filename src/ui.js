// Dependencies
const moment = require('./moment');
const API = require('./api');
const Render = require('./render');

const chalk = require('chalk');
const debug = require('debug')('node-cba-netbank');
const inquirer = require('inquirer');

//  Constant
const msgQuit = 'quit';
const tagQuit = chalk.red('<Quit>');

/* eslint-disable class-methods-use-this */
class UI {
  constructor() {
    this.accounts = [];
  }

  start(argv) {
    return new Promise((resolve) => {
      //  check given credential
      const questions = [];

      //  client number
      if (!argv.username) {
        questions.push({
          type: 'input',
          name: 'username',
          message: 'Client number:',
          validate: input => /^\d{1,8}$/.test(input),
        });
      }

      //  password
      if (!argv.password) {
        questions.push({
          type: 'password',
          name: 'password',
          message: 'Password:',
          validate: input => /^[\w\d-]{4,16}$/.test(input),
        });
      }

      return resolve(questions.length > 0 ? inquirer.prompt(questions) : argv);
    })
      .then(c => this.logon(c))
      .then(() => this.chooseAccountAndShowHistory(argv.months))
      .catch((error) => {
        debug(error);
        console.log('Bye!');
      });
  }

  logon(credential) {
    this.api = new API();
    console.log(`Logon as account ${credential.username} ...`);
    return this.api
      .logon(credential.username, credential.password)
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
              //  retry without give username/password, so user can give a new one to try.
              return this.start(Object.assign({}, credential, { username: '', password: '' }));
            }
            throw new Error(msgQuit);
          }))
      .then((resp) => {
        this.accounts = resp.accounts;
        return this.accounts;
      });
  }

  chooseAccountAndShowHistory(months) {
    return this.selectAccount()
      .then(account =>
        this.downloadHistoryAndShow(
          account,
          moment()
            .subtract(months, 'months')
            .format(moment.formats.default),
        ))
      .then(() => this.chooseAccountAndShowHistory(months));
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
    return this.api.getTransactionHistory(account, from, to);
  }

  downloadHistoryAndShow(account, from, to = moment().format(moment.formats.default)) {
    return this.downloadHistory(account, from, to).then((history) => {
      const allTransactions = history.pendings
        .map(t => Object.assign({}, t, { pending: true }))
        .concat(history.transactions);
      console.log(Render.transactions(allTransactions));
      console.log(`Total ${history.transactions.length} transactions and ${history.pendings.length} pending transactions.`);
      return history;
    });
  }
}

module.exports = UI;
