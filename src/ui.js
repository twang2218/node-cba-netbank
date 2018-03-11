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

const monthsBefore = months =>
  moment().subtract(months, 'months').format(moment.formats.default);

/* eslint-disable class-methods-use-this */
class UI {
  constructor() {
    this.accounts = [];
  }

  async start(argv) {
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

    const credential = questions.length > 0 ? await inquirer.prompt(questions) : argv;
    try {
      await this.logon(credential);
      return await this.chooseAccountAndShowHistory(argv.months);
    } catch (error) {
      debug(error);
      console.log('Bye!');
      process.exit(0);
      return null;
    }
  }

  async logon(credential) {
    this.api = new API();

    let resp;
    try {
      console.log(`Logon as account ${credential.username} ...`);
      resp = await this.api.logon(credential.username, credential.password);
    } catch (err) {
      const answer = await inquirer.prompt({
        type: 'confirm',
        name: 'tryagain',
        message: 'Failed to logged in, try again?',
      });

      if (!answer.tryagain) {
        throw new Error(msgQuit);
      }
      console.log();
      //  retry without give username/password, so user can give a new one to try.
      resp = await this.start({ ...credential, username: '', password: '' });
    }

    this.accounts = resp.accounts;
    return this.accounts;
  }

  async chooseAccountAndShowHistory(months) {
    const account = await this.selectAccount();
    await this.downloadHistoryAndShow(account, monthsBefore(months));
    return this.chooseAccountAndShowHistory(months);
  }

  async selectAccount() {
    const answer = await inquirer.prompt({
      type: 'list',
      name: 'account',
      message: 'Which account?',
      choices: this.accounts.map(a => ({ name: Render.account(a), value: a })).concat([tagQuit]),
    });


    if (answer.account === tagQuit) {
      throw new Error(msgQuit);
    }
    const account = this.accounts.find(v => answer.account.number === v.number);
    if (!account) {
      throw new Error(msgQuit);
    }
    debug(`selectAccount(${Render.account(answer.account)}): found account ${Render.account(account)}`);
    return account;
  }

  async downloadHistory(account, from, to) {
    console.log(`Downloading history [${from} => ${to}] ...`);
    return this.api.getTransactionHistory(account, from, to);
  }

  async downloadHistoryAndShow(account, from, to = moment().format(moment.formats.default)) {
    const history = await this.downloadHistory(account, from, to);
    const allTransactions = history.pendings
      .map(t => ({ ...t, pending: true }))
      .concat(history.transactions);
    console.log(Render.transactions(allTransactions));
    console.log(`Total ${history.transactions.length} transactions and ${history.pendings.length} pending transactions.`);
    return history;
  }
}

module.exports = UI;
