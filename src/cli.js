#!/usr/bin/env node

/* eslint-disable no-use-before-define */

// Dependencies
const netbank = require('./api');

const chalk = require('chalk');
const debug = require('debug')('node-cba-netbank');
const fs = require('fs');
const inquirer = require('inquirer');
const moment = require('moment-timezone');
const ofx = require('ofx');
const Table = require('easy-table');
const yargs = require('yargs');

moment.tz.setDefault('Australia/Sydney');

const msgQuit = 'quit';
const tagQuit = chalk.red('<Quit>');
const tagAccountName = '<name>';
const tagAccountNumber = '<number>';
const tagFrom = '<from>';
const tagTo = '<to>';
const tagExt = '<ext>';
const outputFilenameTemplate = `[${tagAccountName}](${tagAccountNumber}) [${tagFrom} to ${tagTo}].${tagExt}`;
const formatSortable = 'YYYY-MM-DD';
const formatAus = 'DD/MM/YYYY';
const formatQifQuickenAUS = 'DD/MM/YY';
const formatQifQuickenUS = 'MM/DD/YY';

class Render {
  static currency(amount) {
    return amount >= 0 ? chalk.green.bold(`$${amount.toFixed(2)}`) : chalk.red.bold(`$${amount.toFixed(2)}`);
  }
  static account(account) {
    return (
      `${chalk.bold(account.name)} \t(${chalk.red(account.bsb)} ${chalk.red(account.account)})` +
      `\t Balance: ${Render.currency(account.balance)} ` +
      `\t Available Funds: ${Render.currency(account.available)}`
    );
  }
  static accounts(accounts) {
    return Table.print(
      accounts.map(account => ({
        Name: chalk.bold(account.name),
        Number: `${chalk.red(account.bsb)} ${chalk.red(account.account)}`,
        Balance: `${Render.currency(account.balance)}`,
        Available: `${Render.currency(account.available)}`,
      })),
    );
  }
  static transactions(transactions) {
    return Table.print(
      transactions.map(t => ({
        Time: chalk.italic.cyan(moment(t.timestamp).format('YYYY-MM-DD HH:mm')),
        Description: t.pending ? chalk.gray(t.description) : chalk.white(t.description),
        Amount: Render.currency(t.amount),
        Balance: t.pending ? '' : Render.currency(t.balance),
      })),
    );
  }
  static csvAmount(n) {
    return n > 0 ? `+${n.toFixed(2)}` : `${n.toFixed(2)}`;
  }
  static csvTransaction(t) {
    return (
      `${moment(t.timestamp).format(formatAus)}` +
      `,"${Render.csvAmount(t.amount)}"` +
      `,"${t.description}"` +
      `,"${Render.csvAmount(t.balance)}"\r\n`
    );
  }
  static csvTransactions(transactions) {
    return transactions.map(Render.csvTransaction).join('');
  }
  static qifMyobTransaction(t) {
    return (
      `D${moment(t.timestamp).format(formatAus)}\r\n` +
      `T${t.amount.toFixed(2)}\r\n` +
      `P${t.description}\r\n` +
      `L${t.amount >= 0 ? 'DEP' : 'DEBIT'}\r\n` +
      '^\r\n'
    );
  }
  static qifQuicken2004Transaction(t, format) {
    return `D${moment(t.timestamp).format(format)}\r\nT${t.amount.toFixed(2)}\r\nP${t.description}\r\n^\r\n`;
  }
  static qifTransactions(transactions, type) {
    let render;
    switch (type) {
      case 'aus':
        render = t => Render.qifQuicken2004Transaction(t, formatQifQuickenAUS);
        break;
      case 'us':
        render = t => Render.qifQuicken2004Transaction(t, formatQifQuickenUS);
        break;
      default:
      case 'myob':
        render = Render.qifMyobTransaction;
        break;
    }
    return `!Type:Bank\r\n${transactions.map(render).join('')}`;
  }
  static ofxTransactions(account, from, to, transactions) {
    const current = moment().format('YYYYMMDDHHmmss');
    const header = {
      OFXHEADER: '100',
      DATA: 'OFXSGML',
      VERSION: '102',
      SECURITY: 'NONE',
      ENCODING: 'USASCII',
      CHARSET: '1252',
      COMPRESSION: 'NONE',
      OLDFILEUID: 'NONE',
      NEWFILEUID: 'NONE',
    };

    const body = {
      SIGNONMSGSRSV1: {
        SONRS: {
          STATUS: {
            CODE: 0,
            SEVERITY: 'INFO',
          },
          DTSERVER: current,
          LANGUAGE: 'ENG',
        },
      },
    };

    //  BANKTRANLIST
    const translist = {
      DTSTART: moment(from, formatAus).format('YYYYMMDD000000'),
      DTEND: moment(to, formatAus).format('YYYYMMDD000000'),
      STMTTRN: transactions.map(t => ({
        TRNTYPE: t.amount > 0 ? 'CREDIT' : 'DEBIT',
        DTPOSTED: moment(t.timestamp).format('YYYYMMDD'),
        DTUSER: moment(t.timestamp).format('YYYYMMDD'),
        TRNAMT: t.amount.toFixed(2),
        //  use timestamp as FITID if necessary to fix the OFX missing FITID issue.
        FITID: t.receiptnumber || t.timestamp,
        MEMO: t.description.replace(';', ''),
      })),
    };

    if (account.type === 'DDA') {
      body.BANKMSGSRSV1 = {
        STMTTRNRS: {
          TRNUID: 1,
          STATUS: {
            CODE: 0,
            SEVERITY: 'INFO',
          },
          STMTRS: {
            CURDEF: 'AUD',
            BANKACCTFROM: {
              BANKID: account.bsb,
              ACCTID: account.account,
              ACCTTYPE: 'SAVINGS',
            },
            BANKTRANLIST: translist,
            LEDGERBAL: {
              BALAMT: account.balance,
              DTASOF: current,
            },
            AVAILBAL: {
              BALAMT: account.available,
              DTASOF: current,
            },
          },
        },
      };
    } else {
      body.CREDITCARDMSGSRSV1 = {
        CCSTMTTRNRS: {
          TRNUID: 1,
          STATUS: {
            CODE: 0,
            SEVERITY: 'INFO',
          },
          CCSTMTRS: {
            CURDEF: 'AUD',
            CCACCTFROM: {
              ACCTID: account.number,
            },
            BANKTRANLIST: translist,
            LEDGERBAL: {
              BALAMT: account.balance,
              DTASOF: current,
            },
            AVAILBAL: {
              BALAMT: account.available,
              DTASOF: current,
            },
          },
        },
      };
    }

    return ofx.serialize(header, body);
  }
}

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
              return this.start(credential);
            }
            throw new Error(msgQuit);
          }),
      )
      .then((resp) => {
        this.accounts = resp.accounts;
        return this.accounts;
      });
  }

  chooseAccountAndShowHistory(months) {
    return this.selectAccount()
      .then(account => this.downloadHistoryAndShow(account, moment().subtract(months, 'months').format(formatAus)))
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
    return netbank.getTransactionHistory(account, from, to);
  }

  downloadHistoryAndShow(account, from, to = moment().format(formatAus)) {
    return this.downloadHistory(account, from, to).then((history) => {
      const allTransactions = history.pendings
        .map(t => Object.assign({}, t, { pending: true }))
        .concat(history.transactions);
      console.log(Render.transactions(allTransactions));
      console.log(
        `Total ${history.transactions.length} transactions and ${history.pendings.length} pending transactions.`,
      );
      return history;
    });
  }
}

const ui = new UI();
const myArgv = yargs
  .usage('CBA Netbank CLI\nUsage: $0 <command> [args]')
  .option('u', {
    alias: 'username',
    demandOption: !process.env.NETBANK_USERNAME,
    default: process.env.NETBANK_USERNAME,
    defaultDescription: '$NETBANK_USERNAME',
    describe: 'client number',
    type: 'string',
  })
  .option('p', {
    alias: 'password',
    demandOption: !process.env.NETBANK_PASSWORD,
    default: process.env.NETBANK_PASSWORD,
    defaultDescription: '$NETBANK_PASSWORD',
    describe: 'password',
    type: 'string',
  })
  .command(
    'list',
    'List accounts',
    () => {},
    (argv) => {
      debug(`Listing accounts ${JSON.stringify(argv)}...`);
      ui.logon(argv).then((accounts) => {
        console.log(Render.accounts(accounts));
      });
    },
  )
  .command(
    'download',
    'Download transactions history for given account',
  {
    a: {
      alias: 'account',
      demandOption: true,
      describe: 'account name or number',
      type: 'string',
    },
    f: {
      alias: 'from',
      default: moment().subtract(3, 'months').format(formatAus),
      describe: 'history range from date',
      type: 'string',
    },
    t: {
      alias: 'to',
      default: moment().format(formatAus),
      describe: 'history range to date',
      type: 'string',
    },
    o: {
      alias: 'output',
      default: outputFilenameTemplate,
      describe: 'output file name',
      type: 'string',
    },
    format: {
      default: 'json',
      describe: 'the output file format',
      type: 'string',
      choices: ['json', 'csv', 'qif', 'aus.qif', 'us.qif', 'ofx'],
    },
  },
    (argv) => {
      debug(`Download transactions ${JSON.stringify(argv)}...`);
      ui.logon(argv).then((accounts) => {
        //  matching accounts
        const account = accounts.find(
          a => a.name.toLowerCase().indexOf(argv.account.toLowerCase()) >= 0 || a.number.indexOf(argv.account) >= 0,
        );
        if (account) {
          debug(`${Render.account(account)}`);
          ui.downloadHistory(account, argv.from, argv.to).then((history) => {
            console.log(`Retrieved ${history.transactions.length} transactions`);
            const filename = argv.output
              .replace(tagAccountName, account.name)
              .replace(tagAccountNumber, account.number)
              .replace(tagFrom, moment(argv.from, formatAus).format(formatSortable))
              .replace(tagTo, moment(argv.to, formatAus).format(formatSortable))
              .replace(tagExt, argv.format);
            console.log(`filename: ${filename}`);
            let content;
            switch (argv.format) {
              default:
              case 'json':
                content = JSON.stringify(history.transactions);
                break;
              case 'csv':
                content = Render.csvTransactions(history.transactions);
                break;
              case 'qif':
                content = Render.qifTransactions(history.transactions, 'myob');
                break;
              case 'aus.qif':
                content = Render.qifTransactions(history.transactions, 'aus');
                break;
              case 'us.qif':
                content = Render.qifTransactions(history.transactions, 'us');
                break;
              case 'ofx':
                content = Render.ofxTransactions(account, argv.from, argv.to, history.transactions);
                break;
            }
            fs.writeFile(filename, content, (error) => {
              if (error) {
                throw error;
              }
            });
          });
        } else {
          console.log(`Cannot find account matching pattern '${argv.account}'`);
        }
      });
    },
  )
  .command(
    'ui',
    'Interactive user interface.',
  {
    m: {
      alias: 'months',
      default: 2,
      describe: 'how many months of history should be shown',
      type: 'number',
    },
  },
    (argv) => {
      debug(`UI: ${JSON.stringify(argv)}...`);
      ui.start(argv).catch(debug);
    },
  )
  .demandCommand(1, 'You have to tell me what to do, right?')
  .help().argv;

debug(`argv => ${JSON.stringify(myArgv)}`);
