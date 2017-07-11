# node-cba-netbank

[![NPM version][npm-version-image]][npm-url]
[![MIT License][license-image]][license-url]
[![Build Status][travis-image]][travis-url]
[![Dependency Status][dependency-image]][dependency-url]
[![Coverage Status][coverage-image]][coverage-url]

[![NPM][npm-classy-badge-image]][npm-classy-badge-url]

Unofficial The Commonwealth Bank of Australia NetBank API wrap for
Node.js

# Usage

## CLI

### Install

```bash
npm install node-cba-netbank -g
```

### Usage

```bash
$ cba-netbank --help
CBA Netbank CLI
Usage: cba-netbank <command> [args]

Commands:
  list      List accounts
  download  Download transactions history for given account
  ui        Interactive user interface.

Options:
  -u, --username  client number [string] [required] [default: $NETBANK_USERNAME]
  -p, --password  password      [string] [required] [default: $NETBANK_PASSWORD]
  --help          Show help                                            [boolean]
```

There are 3 commands, `list`, `download` and `ui`.

Username and password can be given via the arguments, `--username` and `--password`, as well as the environment variables, `NETBANK_USERNAME` and `NETBANK_PASSWORD`.

You can use `list` command to see the account list, and use `download` command to download the transaction history in given format, there are more arguments for `download` command:

```bash
$ cba-netbank download --help
cba-netbank download

Options:
  -u, --username  client number [string] [required] [default: $NETBANK_USERNAME]
  -p, --password  password      [string] [required] [default: $NETBANK_PASSWORD]
  --help          Show help                                            [boolean]
  -a, --account   account name or number                     [string] [required]
  -f, --from      history range from date       [string] [default: "03/04/2017"]
  -t, --to        history range to date         [string] [default: "03/07/2017"]
  -o, --output    output file name
                 [string] [default: "[<name>](<number>) [<from> to <to>].<ext>"]
  --format        the output file format
  [string] [choices: "json", "csv", "qif", "aus.qif", "us.qif", "ofx"] [default:
                                                                         "json"]
```

You can use `-a` to specify which account you want to download the history from, and the value can be part of the name or account number. For example, if the account name you want to specified is `Smart Access`, then you can use `-a smart` to save some time.

Currently, `JSON`, `CSV`, `QIF` and `OFX` format is supported for the transactions history export format.

About the QIF format, there are several options:

* `qif` is most common one, which is for `QIF(MYOB, MSMoney, or Quicken 2005 or later)`;
* `aus.qif` is for some old software, such as `QIF (Quicken AUS 2004 or earlier)`;
* `us.qif` is for some old software, such as `QIF (Quicken US 2004 or earlier)`.

### Interactive UI

This is an UI you can just use `<UP>` and `<DOWN>` key to list accounts and its recent transactions.

```bash
$ cba-netbank ui
Logon as account 1234567 ...
? Which account?
❯ Smart Access 	(062001 12340001)	 Balance: $987.65 	 Available Funds: $907.65
  NetBank Saver 	(062002 12340012)	 Balance: $4321.01 	 Available Funds: $4021.00
  GoalSaver 	(062003 12340013)	 Balance: $32109.87 	 Available Funds: $32109.87
  Complete Access 	(062004 12340014)	 Balance: $1234.56 	 Available Funds: $1023.45
  MasterCard Platinum 	( 5520123456789012)	 Balance: $-1234.56 	 Available Funds: $12345.67
  <Quit>
```

Use `<UP>` and `<DOWN>` key to select an account then press `<ENTER>`, the recent transaction history will be downloaded and shown below.

```bash
Downloading history [03/05/2017 => 03/07/2017] ...
Time              Description                                                                     Amount    Balance
----------------  ------------------------------------------------------------------------------  --------  --------
2017-07-01 00:00  PENDING - HURSTSVILLE TONGLI S   HURSTVILLE , 0701; LAST 4 CARD DIGITS 4341     $-3.09
2017-07-01 00:00  PENDING - DAMS APPLE AT THE STAT HURSTVILLE , 0701; LAST 4 CARD DIGITS 4341     $-12.37
...
2017-07-01 04:39  THE NAKED DUCK DARLING SYDNEY NS AUS; Card xx4341; Value Date: 28/06/2017       $-13.50   $909.66
2017-07-01 04:39  TOPSHOP TOPMAN SYDNE SYDNEY  AUS; Card xx4341; Value Date: 30/06/2017           $-80.00   $927.16
...
2017-06-12 16:13  Cardless Cash for collection                                                    $-40.00   $1111.83

Total 69 transactions and 12 pending transactions.
```

To quit the CLI, just select `<Quit>` then press `<Enter>`.

## Library

### Install

```bash
npm install node-cba-netbank --save
```

### List Accounts

API: `netbank.logon(username, password)`

* `username`: the netbank client number;
* `password`: the netbank password;

Returned object will contains an `accounts` field, which contains all the account information.

#### Example of list accounts

```js
const Netbank = require('node-cba-netbank');

const netbank = new Netbank();

netbank.logon('76543210', 'YOUR_PASSWORD')
  .then(resp => {
    //  output account to console
    resp.accounts.forEach(
      a => console.log(`${a.name} (${a.bsb} ${a.account}) => ${a.balance}/${a.available}`)
    );
  })
  .catch(console.error);
```

Just replace `76543210` with your client number, and replace
`YOUR_PASSWORD` with your netbank password.

The result will look like below:

```js
Smart Access (062001 12340001) => 987.65/907.65
NetBank Saver (062002 12340012) => 4321.01/4021.00
...
```

For each account, there are following properties:

* `name`: Account name;
* `url`: Transaction page for the account, it will be different everytime you logged in;
* `bsb`: BSB number;
* `account`: Account number (without BSB part);
* `number`: The entire account number, `bsb`+`account`, without space;
* `balance`: Current account balance. It might be different from the available funds;
* `available`: Current available funds of the account.

### Retrieve Transactions for Given Account

API: `netbank.getTransactionHistory(account, from, to)`

* `account`: one of the account object retrieved from the previous `.logon()` api
* `from`: the begin date of the search period. format is `DD/MM/YYYY`, *[default: 6 years ago (bank may not store transactions for such long time.)]*
* `to`: the end date of the search period. format is `DD/MM/YYYY`, *[default: today]*

The returned object will contains following field:

* `transactions`: the processed transactions;
* `pendings`: the pending transactions;

#### Example of retrieve transactions

```js
const Netbank = require('node-cba-netbank');

const netbank = new Netbank();

netbank.logon('76543210', 'YOUR_PASSWORD')
  // Assume we are going to retrieve the transactions of the first account, from '1/1/2017' to today
  .then(resp => netbank.getTransactionHistory(resp.accounts[0], '1/1/2017'))
  .then((resp) => {
    //  output transactions to console
    resp.transactions.forEach(t => console.log(`${t.date} ${t.description} => ${t.amount}`));
  })
  .catch(console.error);
```

 **Be aware, it might take several minutes if there are thousands transactions.**

 The transaction list will look like below:

```bash
2015-04-20T00:00:00.004Z SO THAI RESTAURANT       KOGARAH => -13.9
2015-04-20T00:00:00.003Z NOK NOK                  SYDNEY => -41.8
...
```

For each transaction object, there are following properties:

* ```timestamp```: Timestamp of given transaction, it's milliseconds since epoch. Although, it might be pretty accurate for some accounts (non-credit card account), it might just be accurate at date level;
* ```date```: It's human readable date format;
* ```description```: Transaction description;
* ```amount```: Transaction amount, negative value is DR, positive value is CR;
* ```balance```: The balance of the account after the transaction happened, however, the field might be empty for some accounts, such as credit card account;
* ```trancode```: It's a category code for the transaction, such as ATM, EFTPOS, cash out might be different code;
* ```receiptnumber```: The receipt number for the transaction. However, I cannot found it on my real paper receipt, and the field might be missing for some accounts, such as credit card account;

### Testing

Offline test can be done by simply run `yarn test`.

To enable real world testing, please set environment variables `NETBANK_USERNAME` and `NETBANK_PASSWORD` to your client number and password for online banking.

Then run command:

```bash
yarn test
```

to have more details, you can run `yarn test-debug` for more verbose output.

The test will try to login and get transactions from the first account, and if it will fail if the retrieved transactions number is less than 400. It's ok if you don't have that much transactions in the account. The purpose of checking whether it get more than 400 transactions is to check whether it can overcome the maximum transactions limits.

[license-image]: http://img.shields.io/badge/license-Apache%202.0-blue.svg?style=flat
[license-url]: LICENSE.txt

[npm-url]: https://npmjs.org/package/node-cba-netbank
[npm-version-image]: http://img.shields.io/npm/v/node-cba-netbank.svg?style=flat
[npm-downloads-image]: http://img.shields.io/npm/dm/node-cba-netbank.svg?style=flat
[npm-classy-badge-image]: https://nodei.co/npm/node-cba-netbank.png?downloads=true&downloadRank=true&stars=true
[npm-classy-badge-url]: https://nodei.co/npm/node-cba-netbank/

[travis-url]: http://travis-ci.org/twang2218/node-cba-netbank
[travis-image]: http://img.shields.io/travis/twang2218/node-cba-netbank.svg?style=flat

[dependency-url]: https://gemnasium.com/twang2218/node-cba-netbank
[dependency-image]: http://img.shields.io/gemnasium/twang2218/node-cba-netbank.svg

[coverage-url]: https://coveralls.io/r/twang2218/node-cba-netbank
[coverage-image]: http://img.shields.io/coveralls/twang2218/node-cba-netbank.svg
