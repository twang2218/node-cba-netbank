#!/usr/bin/env node

/* eslint-disable no-use-before-define */

// Dependencies
const serializer = require('./serializer');
const UI = require('./ui');
const render = require('./render');

const debug = require('debug')('node-cba-netbank');
const fs = require('fs');
const moment = require('./moment');
const yargs = require('yargs');

const tagAccountName = '<name>';
const tagAccountNumber = '<number>';
const tagFrom = '<from>';
const tagTo = '<to>';
const tagExt = '<ext>';
const outputFilenameTemplate = `[${tagAccountName}](${tagAccountNumber}) [${tagFrom} to ${tagTo}].${tagExt}`;

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
        console.log(render.accounts(accounts));
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
        default: moment()
          .subtract(3, 'months')
          .format(moment.formats.default),
        describe: 'history range from date',
        type: 'string',
      },
      t: {
        alias: 'to',
        default: moment().format(moment.formats.default),
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
        const account = accounts.find(a => a.name.toLowerCase().indexOf(argv.account.toLowerCase()) >= 0
          || a.number.indexOf(argv.account) >= 0);
        if (account) {
          debug(`${render.account(account)}`);
          ui.downloadHistory(account, argv.from, argv.to).then((history) => {
            console.log(`Retrieved ${history.transactions.length} transactions`);
            const filename = argv.output
              .replace(tagAccountName, account.name)
              .replace(tagAccountNumber, account.number)
              .replace(tagFrom, moment(argv.from, moment.formats.default).format(moment.formats.sortable))
              .replace(tagTo, moment(argv.to, moment.formats.default).format(moment.formats.sortable))
              .replace(tagExt, argv.format);
            console.log(`filename: ${filename}`);
            let content;
            switch (argv.format) {
              default:
              case 'json':
                content = JSON.stringify(history.transactions);
                break;
              case 'csv':
                content = serializer.csv(history.transactions);
                break;
              case 'qif':
                content = serializer.qif(history.transactions);
                break;
              case 'aus.qif':
                content = serializer.qif(history.transactions, 'aus');
                break;
              case 'us.qif':
                content = serializer.qif(history.transactions, 'us');
                break;
              case 'ofx':
                content = serializer.ofx(history.transactions, account, argv.from, argv.to);
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
